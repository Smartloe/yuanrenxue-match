/**
 * 长时间轮询：window.SecretKey 是否会在某个时刻被替换成"确定性"版本（真函数）。
 * 同时监控 window.secretkey / window.match1 / iframe 数量 / 盾的 triggered 状态。
 *
 * 用法：node tools/poll_secretkey_replace.js [总时长毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9404;
const TOTAL_MS = Number(process.argv[2] || 60000);
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

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11poll-'));
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

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return null;
    return r.result.value;
  };

  const rows = [];
  const start = Date.now();
  while (Date.now() - start < TOTAL_MS) {
    await sleep(2000);
    const s = await ev(`(function(){
      var f = window.SecretKey, g = window.secretkey;
      var det = null, idOk = null, a = null, b = null;
      if (typeof f === 'function') {
        try { a = String(f('probe')); b = String(f('probe')); det = (a === b); } catch (e) { det = 'ERR'; }
        try { window.__lastSK = window.__lastSK; idOk = (f === window.__skRef); window.__skRef = f; } catch (e) {}
      }
      return JSON.stringify({
        t: Date.now(),
        secretkey: typeof g,
        SecretKey: typeof f,
        replaced: (idOk === false),
        deterministic: det,
        outLen: a ? a.length : 0,
        head: a ? a.slice(0, 24) : null,
        match1: (window.match1 === undefined ? null : String(window.match1).slice(0, 60)),
        iframes: document.querySelectorAll('iframe').length
      });
    })()`);
    if (!s) continue;
    const o = JSON.parse(s);
    rows.push(o);
    if (rows.length % 5 === 0 || o.replaced || o.deterministic) {
      log(`t+${Math.round((o.t - start) / 1000)}s secretkey=${o.secretkey} SecretKey=${o.SecretKey} replaced=${o.replaced} det=${o.deterministic} len=${o.outLen} iframes=${o.iframes} match1=${o.match1}`);
    }
    if (o.secretkey === 'function' || o.match1 || o.deterministic === true) {
      log('🎯 发现目标状态！');
      break;
    }
  }

  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'poll_secretkey.json'), JSON.stringify(rows, null, 1));
  const detCount = rows.filter((r) => r.deterministic === true).length;
  const replCount = rows.filter((r) => r.replaced).length;
  log(`\n[*] 轮询 ${rows.length} 次：确定性次数=${detCount}，函数被替换次数=${replCount}`);
  log('[*] 明细已写入 docs/poll_secretkey.json');
  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
