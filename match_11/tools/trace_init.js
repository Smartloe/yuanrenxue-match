/**
 * 从"盾初始化那一刻"开始追踪：在页面脚本之前给 window.DevtoolsTrap / SecretKey / secretkey
 * 装 accessor，一旦被赋值就立刻把原型方法包上日志，从而看到 onInit 与后续每次调用的完整序列。
 *
 * 用法：node tools/trace_init.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9422;
const WAIT_MS = Number(process.argv[2] || 18000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EARLY = `(function(){
  try{
    var rec = [];
    window.__ilog = rec;
    var t0 = Date.now();
    var push = function(s){ try{ if (rec.length < 2000) rec.push((Date.now()-t0) + 'ms ' + s); }catch(e){} };

    var wrapProto = function(cls, tag){
      try{
        var P = cls && cls.prototype;
        if (!P || P.__wrapped) return;
        P.__wrapped = true;
        var names = Object.getOwnPropertyNames(P).filter(function(n){ return n !== 'constructor'; });
        names.forEach(function(n){
          var orig = P[n];
          try{
            P[n] = function(){
              var args = Array.prototype.slice.call(arguments);
              var r, err = null;
              try { r = orig.apply(this, args); } catch(e){ err = String(e && e.message).slice(0,60); }
              var fired = null;
              try { fired = this && this.triggeredMap ? Object.keys(this.triggeredMap).filter(function(k){ return this.triggeredMap[k]; }, this) : null; } catch(e){}
              push(tag + '.' + n + '(' + args.length + ') -> ' + (err ? 'ERR:' + err : String(r).slice(0,40)) + ' triggered=' + (this && this.triggered) + ' fired=' + JSON.stringify(fired));
              if (err) throw new Error(err);
              return r;
            };
          }catch(e){ push(tag + '.' + n + ' wrap失败'); }
        });
        push(tag + ' 原型已包 (' + names.length + ' 个方法)');
      }catch(e){ push(tag + ' wrap异常 ' + e.message); }
    };

    // 给 DevtoolsTrap / SecretKey / secretkey 装 setter：一旦被赋值立刻记录并包原型
    ['DevtoolsTrap','SecretKey','secretkey','randomString','initDevtoolsTrap'].forEach(function(name){
      var store;
      try{
        Object.defineProperty(window, name, {
          configurable: true, enumerable: true,
          get: function(){ return store; },
          set: function(v){
            store = v;
            push('window.' + name + ' = ' + typeof v + (typeof v === 'function' ? ' (name=' + (v.name||'') + ',len=' + v.length + ')' : ''));
            if (name === 'DevtoolsTrap') wrapProto(v, 'DevtoolsTrap');
          }
        });
      }catch(e){ push('定义 ' + name + ' accessor 失败: ' + e.message); }
    });
  }catch(e){ window.__ierr = String(e.message); }
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11ti-'));
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
    if (r.exceptionDetails) return 'EXC';
    return r.result.value;
  };
  log('[*] early 错误:', await ev('String(window.__ierr||"none")'));
  const lg = await ev('JSON.stringify((window.__ilog||[]).slice(0,400))');
  let rows = [];
  try { rows = JSON.parse(lg); } catch { rows = []; }
  log(`\n[*] 初始化期日志 ${rows.length} 条（前 150 条）`);
  for (const r of rows.slice(0, 150)) log('   ', r);
  log('\n[*] 页面状态:', await ev(`JSON.stringify({secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,match1:String(window.match1),env:(function(){try{return new window.DevtoolsTrap().checkEnv();}catch(e){return 'ERR';}})()})`));
  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
