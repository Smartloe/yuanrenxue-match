/**
 * 改写 JSVMP：在 opcode 53（H[0][0][b] = value，即 window[key] = value）处插入日志，
 * 并把唯一的 debugger 语句去掉（方便挂真 DevTools 时不卡死）。
 * 通过 CDP Fetch 拦截，把改写后的文件喂给页面。
 *
 * 目的：看清 VM 到底往 window 上写了哪些名字、值是什么类型，特别是是否出现过真 secretkey。
 *
 * 用法：node tools/cdp_patched_vm.js [等待毫秒] [--devtools]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9410;
const WAIT_MS = Number(process.argv[2] || 20000);
const WITH_DEVTOOLS = process.argv.includes('--devtools');
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const VM_URL_PART = 'yrx_check_devtools_jsvmp';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 生成改写版：在 opcode 7(defineProperty) 与 opcode 53(window[key]=v) 处插日志 ----
const raw = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');
const P7_OLD = '_.$[8](7,g,b,H[0][0],_.$[8](4,g)?H[0][0][b]:undefined)';
const P7_NEW = '(__lv7=_.$[8](4,g)?H[0][0][b]:undefined,window.__logDef&&window.__logDef(b,__lv7),_.$[8](7,g,b,H[0][0],__lv7))';
const P53_OLD = 'H[0][0][b]=_.$[8](4,g)';
const P53_NEW = '(__lv53=_.$[8](4,g),window.__logDef&&window.__logDef(b,__lv53),H[0][0][b]=__lv53)';
const DBG_OLD = 'function(){debugger}()';
const DBG_NEW = 'function(){}()';

let patched = raw;
const report = {};
report.p7 = patched.split(P7_OLD).length - 1;
patched = patched.split(P7_OLD).join(P7_NEW);
report.p53 = patched.split(P53_OLD).length - 1;
patched = patched.split(P53_OLD).join(P53_NEW);
report.dbg = patched.split(DBG_OLD).length - 1;
patched = patched.split(DBG_OLD).join(DBG_NEW);
// 载入标记，用来确认改写版真的被页面使用
patched += '\n;window.__patchedVMLoaded = true;\n';
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'patched_jsvmp.js'), patched);
log('[*] 改写结果:', JSON.stringify(report), '大小', raw.length, '->', patched.length);

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
    });
  }
}

const EARLY = `(function(){
  try{
    var log = [];
    window.__winlog = log;
    window.__logDef = function(key, val){
      try{
        var t = typeof val;
        var desc;
        if (t === 'function') { try { desc = Function.prototype.toString.call(val).slice(0, 60); } catch(e){ desc = 'fn'; } }
        else if (t === 'object' && val) { try { desc = Object.prototype.toString.call(val); } catch(e){ desc = 'obj'; } }
        else desc = String(val).slice(0, 80);
        log.push(String(key) + ' = (' + t + ') ' + desc);
      }catch(e){ log.push(String(key) + ' = <logerr>'); }
    };
  }catch(e){}
})();`;

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11pv-'));
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
            body: Buffer.from(patched, 'utf8').toString('base64'),
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

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(3000);

  if (WITH_DEVTOOLS) {
    const dtUrl = `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${t.id}`;
    log('[*] 附加真 DevTools 前端');
    try { await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`, { method: 'PUT' }); } catch { /* ignore */ }
  }

  await sleep(WAIT_MS);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 200);
    return r.result.value;
  };

  const lg = await ev('JSON.stringify((window.__winlog||[]).slice(0,400))');
  let rows = [];
  try { rows = JSON.parse(lg); } catch { rows = []; }
  log(`\n[*] window 赋值日志 ${rows.length} 条`);
  for (const r of rows) log('   ', r);

  log('[*] 改写版是否生效:', await ev('String(window.__patchedVMLoaded)'));
  log('\n[*] 页面状态:', await ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    match1: String(window.match1),
    env: (function(){ try { return new window.DevtoolsTrap().checkEnv(); } catch(e){ return 'ERR'; } })(),
    trap: /Developer tools detected/.test(document.body.innerHTML)
  })`));

  ws.close(); ch.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
