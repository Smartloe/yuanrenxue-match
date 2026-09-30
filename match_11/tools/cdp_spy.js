/**
 * 间谍探针：把 VM 做完整性/原生性检测时最可能用到的内建函数用 Proxy 包一层（保持 "[native code]" 特征），
 * 记录它到底在检查什么、检查结果走向哪条分支。
 * 不开 Runtime 域（避免 CDP 触发控制台检测），最后用 Runtime.evaluate 读取日志。
 *
 * 用法：node tools/cdp_spy.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9346;
const WAIT_MS = Number(process.argv[2] || 20000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPY = `
(function(){
  try{
    var tr = [];
    window.__tr = tr;
    var push = function(s){ try{ if (tr.length < 4000) tr.push(String(s).slice(0, 200)); }catch(e){} };
    var nameOf = function(v){
      try{
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        var t = typeof v;
        if (t === 'function') return 'fn:' + (v.name || '?');
        if (t !== 'object') return t + ':' + String(v).slice(0, 40);
        if (v === window) return 'window';
        if (v === window.console) return 'console';
        var c = v.constructor && v.constructor.name;
        return 'obj:' + (c || '?');
      }catch(e){ return '?'; }
    };
    // 1) Function.prototype.toString —— 原生性检测必经之路
    var T = Function.prototype.toString;
    Function.prototype.toString = new Proxy(T, {
      apply: function(t, self, args){
        var src = '';
        try { src = Reflect.apply(t, self, args); } catch(e){ src = 'ERR'; }
        try {
          if (/native code/.test(src) === false || /console|log|setInterval|defineProperty|getOwnPropertyDescriptor|toString/i.test(String(self && self.name || ''))) {
            push('toString[' + nameOf(self) + ']=' + src.replace(/\\s+/g,' ').slice(0, 90));
          }
        } catch(e){}
        return src;
      }
    });
    // 2) Object.getOwnPropertyDescriptor / getOwnPropertyNames / Reflect.ownKeys
    var G = Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor = new Proxy(G, {
      apply: function(t, self, args){ try{ push('gopd(' + nameOf(args[0]) + ', ' + String(args[1]) + ')'); }catch(e){} return Reflect.apply(t, self, args); }
    });
    var N = Object.getOwnPropertyNames;
    Object.getOwnPropertyNames = new Proxy(N, {
      apply: function(t, self, args){ try{ push('gopn(' + nameOf(args[0]) + ')'); }catch(e){} return Reflect.apply(t, self, args); }
    });
    var RK = Reflect.ownKeys;
    Reflect.ownKeys = new Proxy(RK, {
      apply: function(t, self, args){ try{ push('ownKeys(' + nameOf(args[0]) + ')'); }catch(e){} return Reflect.apply(t, self, args); }
    });
    // 3) Object.getPrototypeOf
    var GP = Object.getPrototypeOf;
    Object.getPrototypeOf = new Proxy(GP, {
      apply: function(t, self, args){ try{ push('getProto(' + nameOf(args[0]) + ')'); }catch(e){} return Reflect.apply(t, self, args); }
    });
  }catch(e){ try{ window.__spyErr = String(e && e.message); }catch(_){} }
})();
`;

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11s-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1440,900', `--user-agent=${UA}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 80; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const reqs = [];
  cdp.on(async (m) => {
    if (m.method === 'Network.requestWillBeSent' && /yuanrenxue\.cn\/(api|a)\//.test(m.params.request.url)) {
      reqs.push(m.params.request.url); log('  [req]', m.params.request.url.slice(0, 220));
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'MacIntel' });
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });

  log(`[*] 打开 ${PAGE_URL}（间谍探针）`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  const probe = await evalIn(`JSON.stringify({
    url: location.href,
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    spyErr: window.__spyErr || null,
    trLen: (window.__tr || []).length,
    trap: /Developer tools detected|多重跳转/.test(document.body.innerHTML)
  })`);
  log('\n[page]', probe.error || probe.value);

  const tr = await evalIn(`JSON.stringify((window.__tr || []).slice(0, 200))`);
  if (!tr.error) {
    const lines = JSON.parse(tr.value);
    log(`\n[探针日志 ${lines.length} 条]`);
    const counts = new Map();
    for (const l of lines) { const k = l.split('(')[0]; counts.set(k, (counts.get(k) || 0) + 1); }
    for (const [k, n] of counts) log(`   x${n}  ${k}`);
    const interesting = lines.filter((l) => /toString\[/.test(l));
    if (interesting.length) { log('\n[toString 明细]'); for (const l of [...new Set(interesting)].slice(0, 40)) log('   ', l.slice(0, 180)); }
  } else log('读取探针日志失败', tr.error);

  log('\n[请求]', JSON.stringify(reqs));
  ws.close(); chrome.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
