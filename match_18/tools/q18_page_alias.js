/**
 * Q18 实验：在 VM 的 open 包装器之上再包一层，改写 URL 里的页码，
 * 观察 ① VM 是否仍签名 ② 服务端最终返回哪一页的数据。
 *
 * 目的：让 VM 以 page=4 去签名，但服务端解析出 page=5 → 拿到第 5 页数据。
 *
 * 用法：node tools/q18_page_alias.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9520);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
      else if (m.method) for (const h of this.handlers) h(m);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18al-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1500,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  let ws;
  try {
    for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);
    const reqs = [];        // {url, requestId}
    const bodies = new Map();
    cdp.on(async (m) => {
      if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) reqs.push({ url: m.params.request.url.replace('https://match.yuanrenxue.cn', ''), id: m.params.requestId });
      if (m.method === 'Network.loadingFinished' && reqs.some((r) => r.id === m.params.requestId)) bodies.set(m.params.requestId, true);
    });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return null;
      return r.result.value;
    };
    const click = async (p) => {
      const box = await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="${p}"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`);
      const { x, y } = JSON.parse(box);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };

    const variants = [
      ['baseline 不改写', null],
      ['page=4 → page=4&page=5', `u.replace('page=4','page=4&page=5')`],
      ['page=4 → page=4&realpage=5', `u.replace('page=4','page=4&realpage=5')`],
      ['page=4 → page=04', `u.replace('page=4','page=04')`],
    ];
    for (const [name, expr] of variants) {
      await cdp.send('Page.navigate', { url: 'https://match.yuanrenxue.cn/match/18' });
      await sleep(7000);
      if (expr) {
        await ev(`(function(){var cur=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var nu=(${expr})(String(u));return cur.call(this,m,nu);};window.__rp=true;})()`);
      }
      reqs.length = 0;
      await click(4);
      await sleep(5000);
      const list = await ev(`(document.querySelector('#pgxList')||{}).innerText||''`);
      log(`\n[${name}]`);
      log('  请求 :', reqs.map((r) => r.url.slice(r.url.indexOf('?'))).join(' | ') || '无');
      log('  页面 :', String(list).replace(/\n/g, ' ').slice(0, 110));
      if (reqs.length) {
        try {
          const b = await cdp.send('Network.getResponseBody', { requestId: reqs[reqs.length - 1].id });
          log('  响应 :', String(b.body).slice(0, 130));
        } catch { log('  响应 : (取不到)'); }
      }
    }
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
