/**
 * 在真实 Chrome 里截获盾"打印到干净 iframe console"的内容（绕过 console.clear）。
 * 手法：页面脚本之前就给 HTMLIFrameElement.prototype.contentWindow 装 getter，
 *      一旦拿到 iframe 的 window，就把它的 console 方法全部包上记录器，并把 clear 变成空操作。
 *
 * 用法：node tools/capture_prints.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9426;
const WAIT_MS = Number(process.argv[2] || 18000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EARLY = `(function(){
  try{
    var rec = [];
    window.__prints = rec;
    var patch = function(win, tag){
      try{
        if (!win || win.__cpatched) return win;
        win.__cpatched = true;
        var c = win.console;
        if (!c) return win;
        var wrap = function(name){
          var orig = c[name];
          if (typeof orig !== 'function') return;
          try{
            c[name] = function(){
              var args = Array.prototype.slice.call(arguments).map(function(a){
                try { return typeof a === 'string' ? a : (a && a.tagName ? '<' + a.tagName + '>' : JSON.stringify(a)); } catch(e){ return String(a); }
              });
              rec.push('[' + tag + '.' + name + '] ' + args.join(' '));
              if (name === 'clear') return undefined;   // 让清屏失效
              try { return orig.apply(c, arguments); } catch(e){}
            };
          }catch(e){}
        };
        ['log','info','warn','error','debug','dir','table','clear','trace','group','groupEnd','groupCollapsed','assert','count','time','timeEnd'].forEach(wrap);
      }catch(e){}
      return win;
    };
    window.__patchIframeConsole = patch;
    var proto = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
    if (proto) {
      ['contentWindow','contentDocument'].forEach(function(prop){
        var d = Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.get) return;
        Object.defineProperty(proto, prop, {
          configurable: true,
          get: function(){
            var v = d.get.call(this);
            if (prop === 'contentWindow') patch(v, 'iframe');
            else if (v && v.defaultView) patch(v.defaultView, 'iframe');
            return v;
          }
        });
      });
    }
    // 顶层 window 的 clear 也失效，避免把控制台清掉
    try { var realClear = console.clear; console.clear = function(){}; } catch(e){}
  }catch(e){ window.__perr = String(e.message); }
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 25000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11pr-'));
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
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };
  log('[*] early 错误:', JSON.stringify((await ev('String(window.__perr||"none")')).value));
  const pr = await ev('JSON.stringify(window.__prints||[])');
  let prints = [];
  try { prints = JSON.parse(pr.value); } catch { /* ignore */ }
  log(`\n[*] 截获到 ${prints.length} 条控制台输出（去重 ${new Set(prints).size} 条）`);
  for (const p of [...new Set(prints)].slice(0, 40)) log('   <', String(p).slice(0, 200));

  log('\n[*] 页面状态:', JSON.stringify((await ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    env: (function(){ try { return new window.DevtoolsTrap().checkEnv(); } catch(e){ return 'ERR'; } })(),
    suffix: (function(){ var m = document.body.innerHTML.match(/\+\s*"([0-9a-f]{16})"/); return m ? m[1] : null; })(),
    iframes: document.querySelectorAll('iframe').length
  })`)).value));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'captured_prints.json'), JSON.stringify(prints, null, 2));
  const stRaw = await ev(`JSON.stringify({
    suffix: (function(){ var m = document.body.innerHTML.match(/\\+\\s*"([0-9a-f]{16})"/); return m ? m[1] : null; })(),
    x: (function(){ var q = (window.__prints||[]).filter(function(s){ return /RandomString/.test(s); }); return q.length ? String(q[0]).replace(/.*RandomString:?\s*/, '') : null; })()
  })`);
  try { log('RESULT ' + stRaw.value); } catch(e) { log('RESULT 解析失败'); }
  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
