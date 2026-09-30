/**
 * 用"改写后的内层载荷"替换原始 VM 载荷，记录 VM 对 window 的每一次写入。
 *
 * 原理：外层文件就是 `var yxr = eval(<解码后的载荷字符串>);`
 *   1) 把外层文件改成 `var yxr = eval(window.__PAYLOAD__);`
 *   2) 载荷里插入日志：
 *      - opcode 53: ﱞ173265[0][0][key] = value   （window[key] = value）
 *      - opcode 7 : ﱞ239919.push(key, window, value)（defineProperty 路径）
 *
 * 用法：node tools/cdp_payload_instrumented.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9412;
const WAIT_MS = Number(process.argv[2] || 20000);
const WITH_DEVTOOLS = process.argv.includes('--devtools');
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const VM_URL_PART = 'yrx_check_devtools_jsvmp';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1) 不再跨实例注入载荷；改为在 eval 前对"本次解码结果"做运行时改写 ----
const PATCH_RE_SRC = '([^\\s?(:,;]{1,24})\\[0\\]\\[0\\]\\[([^\\]\\s]{1,24})\\]=([^\\s;.]{1,24})\\s*\\.pop\\(\\)';
const PATCH_REPL = '(window.__lwv=$3.pop(),window.__logDef&&window.__logDef($2,window.__lwv),$1[0][0][$2]=window.__lwv)';

// ---- 2) 改写外层文件：把 eval 参数换成 window.__PAYLOAD__ ----
const raw = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');
const head = 'var yxr = eval(';
if (!raw.startsWith(head) || !raw.trimEnd().endsWith(');')) { log('[-] 外层文件结构不符合预期'); process.exit(1); }
// 保留原解码器，并在 eval 之前对解码结果做运行时改写
const origArg = raw.slice(head.length, raw.lastIndexOf(');'));
const patchedOuter = 'var yxr;try{var __dec=(' + origArg + ');window.__decLen=__dec.length;yxr=eval(window.__PATCH_PAYLOAD(__dec));window.__patchedVMLoaded=true;}catch(e){window.__vmErr=String(e&&e.message)+" | "+String(e&&e.stack).slice(0,400);}\n';
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'patched_jsvmp.js'), patchedOuter);

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) for (const h of this.handlers) h(m);
    });
  }
  on(f) { this.handlers.push(f); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11pi-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1440,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);

  cdp.on(async (m) => {
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.includes(VM_URL_PART)) {
        try {
          await cdp.send('Fetch.fulfillRequest', {
            requestId, responseCode: 200,
            responseHeaders: [{ name: 'content-type', value: 'application/javascript; charset=utf-8' }],
            body: Buffer.from(patchedOuter, 'utf8').toString('base64'),
          });
        } catch { /* ignore */ }
        return;
      }
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
        return;
      }
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
    }
  });

  const consoleMsgs = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = '[' + m.params.type + '] ' + m.params.args.map((a) => (!a ? 'undefined' : (a.type === 'string' ? a.value : ('value' in a ? JSON.stringify(a.value) : (a.description || a.type))))).join(' ');
      consoleMsgs.push(line);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  const early = `(function(){
  try{
    var rec = [];
    window.__winlog = rec;
    window.__logDef = function(key, val){
      try{
        var t = typeof val, d;
        if (t === 'function') { try { d = Function.prototype.toString.call(val).slice(0, 80); } catch(e){ d='fn'; } }
        else if (t === 'object' && val) { try { d = Object.prototype.toString.call(val); } catch(e){ d='obj'; } }
        else d = String(val).slice(0, 80);
        rec.push(String(key) + ' = (' + t + ') ' + d);
      }catch(e){ rec.push(String(key)+' = <err>'); }
    };
    // hook Object.defineProperty / Reflect.defineProperty，记录对 window 的定义
    var _dp = Object.defineProperty;
    Object.defineProperty = new Proxy(_dp, {
      apply: function(t, self, args){
        try { if (args[0] === window && window.__logDef) window.__logDef('defineProperty:' + String(args[1]), args[2] && args[2].get ? '[getter]' : (args[2] && args[2].value)); } catch(e){}
        return Reflect.apply(t, self, args);
      }
    });
    if (Reflect && Reflect.defineProperty) {
      var _rdp = Reflect.defineProperty;
      Reflect.defineProperty = new Proxy(_rdp, {
        apply: function(t, self, args){
          try { if (args[0] === window && window.__logDef) window.__logDef('Reflect.defineProperty:' + String(args[1]), args[2] && args[2].value); } catch(e){}
          return Reflect.apply(t, self, args);
        }
      });
    }
    window.__PATCH_RE = new RegExp(${JSON.stringify(PATCH_RE_SRC)}, 'g');
    window.__PATCH_PAYLOAD = function(src){
      try {
        var out = String(src).replace(window.__PATCH_RE, ${JSON.stringify(PATCH_REPL)});
        window.__patchCount = (String(src).match(window.__PATCH_RE) || []).length;
        return out;
      } catch(e) { window.__patchErr = String(e.message); return src; }
    };
  }catch(e){ window.__earlyErr = String(e.message); }
})();`;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: early });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(2500);
  if (WITH_DEVTOOLS) {
    const dtUrl = `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${t.id}`;
    log('[*] 附加真 DevTools 前端');
    try { await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`, { method: 'PUT' }); } catch { /* ignore */ }
  }
  await sleep(WAIT_MS);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 300);
    return r.result.value;
  };

  log('[*] early 错误:', await ev('String(window.__earlyErr||"none")'));
  log('[*] 注入检查:', await ev(`JSON.stringify({logDef:typeof window.__logDef, patcher:typeof window.__PATCH_PAYLOAD, yxr:typeof window.yxr, re:String(window.__PATCH_RE)})`));
  log('[*] 改写版生效:', await ev('String(window.__patchedVMLoaded)'));
  log('[*] 运行时改写处数:', await ev('String(window.__patchCount)'), '| 改写错误:', await ev('String(window.__patchErr||"none")'));
  log('[*] 解码长度:', await ev('String(window.__decLen)'));
  log('[*] VM 异常:', await ev('String(window.__vmErr||"none")'));
  const lg = await ev('JSON.stringify((window.__winlog||[]).slice(0,500))');
  let rows = [];
  try { rows = JSON.parse(lg); } catch { rows = []; }
  log(`\n[*] window 写入日志 ${rows.length} 条`);
  for (const r of rows) log('   ', r);
  log(`\n[*] 控制台消息 ${consoleMsgs.length} 条，去重 ${new Set(consoleMsgs).size} 条`);
  for (const l of [...new Set(consoleMsgs)].slice(0, 30)) log('   <', l.slice(0, 200));

  log('\n[*] 页面状态:', await ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    match1: String(window.match1),
    env: (function(){ try { return new window.DevtoolsTrap().checkEnv(); } catch(e){ return 'ERR'; } })()
  })`));

  ws.close(); ch.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
