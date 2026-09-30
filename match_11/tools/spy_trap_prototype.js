/**
 * 给 window.DevtoolsTrap.prototype 的每个方法包一层日志，
 * 观察"活实例"的巡检循环到底在做什么：哪些检查在跑、有没有触发、triggered 状态如何。
 *
 * 用法：node tools/spy_trap_prototype.js [包完后等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9402;
const WAIT_MS = Number(process.argv[2] || 15000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11spy-'));
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
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(9000);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 200);
    return r.result.value;
  };

  log('[*] 给原型方法打日志...');
  log(await ev(`(function(){
    try {
      var P = window.DevtoolsTrap && window.DevtoolsTrap.prototype;
      if (!P) return 'no prototype';
      var names = Object.getOwnPropertyNames(P).filter(function(n){ return n !== 'constructor'; });
      window.__trapLog = [];
      window.__origProto = {};
      names.forEach(function(n){
        var orig = P[n];
        window.__origProto[n] = orig;
        try {
          P[n] = function(){
            var args = Array.prototype.slice.call(arguments);
            var r, err = null;
            try { r = orig.apply(this, args); } catch(e) { err = String(e.message).slice(0, 80); }
            try {
              window.__trapLog.push({ fn: n, ret: (typeof r === 'object' ? JSON.stringify(r) : String(r)).slice(0, 60),
                err: err, triggered: this && this.triggered,
                fired: this && this.triggeredMap ? Object.keys(this.triggeredMap).filter(function(k){ return this.triggeredMap[k]; }, this) : null,
                t: Date.now() });
            } catch(e) {}
            if (err) throw new Error(err);
            return r;
          };
        } catch(e) {
          window.__trapLog.push({ fn: n, wrapErr: String(e.message).slice(0, 80) });
        }
      });
      return 'wrapped ' + names.length + ' methods: ' + names.join(',');
    } catch(e) { return 'ERR ' + e.message; }
  })()`));

  await sleep(WAIT_MS);

  const lg = await ev('JSON.stringify((window.__trapLog||[]).slice(-200))');
  let entries = [];
  try { entries = JSON.parse(lg); } catch { entries = []; }
  log(`\n[*] 巡检日志 ${entries.length} 条（末尾 200 条）`);
  const counts = new Map();
  for (const e of entries) {
    const k = e.fn + (e.err ? '(err)' : '') + ' ret=' + e.ret + ' fired=' + JSON.stringify(e.fired);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [k, n] of counts) log(`   x${n}  ${k}`);
  if (entries.length) {
    log('\n[最后 10 条原始]');
    for (const e of entries.slice(-10)) log('   ', JSON.stringify(e));
  }

  log('\n[*] 页面状态:', await ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    match1: String(window.match1),
    trap: /Developer tools detected/.test(document.body.innerHTML),
    iframes: document.querySelectorAll('iframe').length
  })`));

  ws.close(); ch.kill(); await sleep(200);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
