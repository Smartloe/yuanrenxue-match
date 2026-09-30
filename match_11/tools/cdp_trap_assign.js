/**
 * 预先给 window.secretkey / SecretKey / randomString 装 accessor，
 * 记录盾在什么时候给它们赋值、赋的是什么（是否出现真函数）。
 * 用法：node tools/cdp_trap_assign.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9368;
const WAIT_MS = Number(process.argv[2] || 20000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOOK = `
(function(){
  try{
    var log = [];
    window.__assignLog = log;
    var names = ['secretkey','SecretKey','secretKey','randomString','_secretkey','key'];
    var store = {};
    window.__store = store;
    names.forEach(function(n){
      try{
        Object.defineProperty(window, n, {
          configurable: true,
          enumerable: true,
          get: function(){ return store[n]; },
          set: function(v){
            store[n] = v;
            try{ log.push(n + ' = ' + (typeof v) + ' ' + (typeof v === 'function' ? Function.prototype.toString.call(v).slice(0, 60) : String(v).slice(0, 80)) + ' @' + Date.now()); }catch(e){}
          }
        });
      }catch(e){}
    });
    // 记录 Object.defineProperty 对 window 的写入
    var dp = Object.defineProperty;
    Object.defineProperty = new Proxy(dp, {
      apply: function(t, self, args){
        try{ if (args[0] === window) log.push('defineProperty(' + String(args[1]) + ') @' + Date.now()); }catch(e){}
        return Reflect.apply(t, self, args);
      }
    });
  }catch(e){}
})();`;

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

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11ta-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let v = null;
  for (let i = 0; i < 80; i++) { try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 150);
    return r.result.value;
  };
  log('[赋值日志]');
  const lg = await ev('JSON.stringify(window.__assignLog || [])');
  let lines = [];
  try { lines = JSON.parse(lg); } catch { lines = [lg]; }
  for (const l of lines) log('   ', l);
  log('\n[当前状态]', await ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    storeKeys: Object.keys(window.__store||{}),
    trapMap: (function(){ try{ var i=new window.DevtoolsTrap(); return JSON.stringify(i.triggeredMap)+' | random_str='+i.random_str; }catch(e){ return 'ERR '+e.message; } })()
  })`));
  ws.close(); chrome.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
