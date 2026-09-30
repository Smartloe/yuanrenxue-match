/**
 * Q18 关键实验：VM 用 `page=(\d+)$`（结尾锚定）解析页码，而服务端按第一个 page 参数取页。
 * 因此把第 4 页的请求 URL 改成 `?page=5&page=4`：
 *   - VM 的正则匹配结尾的 page=4 → 正常签名（不会走"page=5 不签名"的分支）
 *   - 服务端 request.args.get('page') 取第一个 → 5
 * 若签名只覆盖 (page, t) 或 url 的一部分，就可能拿到第 5 页数据。
 *
 * 用法：node tools/q18_page5_alias.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9536);
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

const REWRITE = `function(u){
  return String(u).replace('page=4', 'page=5&page=4');
}`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18a5-'));
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
    const reqs = [];
    cdp.on((m) => { if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) reqs.push({ url: m.params.request.url, id: m.params.requestId }); });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: 'https://match.yuanrenxue.cn/match/18' });
    await sleep(8000);

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return null;
      return r.result.value;
    };
    // 在 VM 的 open 包装器之上再包一层（只改写 URL，不改其它参数）
    const ok = await ev(`(function(){
      var cur = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(m, u){
        var nu = (${REWRITE})(String(u));
        return arguments.length >= 3 ? cur.call(this, m, nu, arguments[2]) : cur.call(this, m, nu);
      };
      return true;
    })()`);
    log('已注入改写层:', ok);
    const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="4"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(6000);

    log('\n请求:');
    for (const r of reqs) {
      log('  ', r.url.replace('https://match.yuanrenxue.cn', ''));
      try { const b = await cdp.send('Network.getResponseBody', { requestId: r.id }); log('     →', String(b.body).slice(0, 160)); } catch { log('     → (响应体取不到)'); }
    }
    log('\n页面显示:', String(await ev(`(document.querySelector('#pgxList')||{}).innerText||''`)).replace(/\n/g, ' ').slice(0, 140));
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
