/**
 * Q18 密集采样：钩 myenc + Date.now，连续点击 12 次，采集
 *   (请求里的 t 秒, 签名时的 Date.now() 毫秒, 明文, 密钥, v)
 * 用来拟合 "token 序列（524m734,524d734,...）" 与时间的关系。
 *
 * 用法：node tools/q18_dense_sample.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9554);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18ds2-'));
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
    cdp.on((m) => { if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) reqs.push(m.params.request.url); });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: 'https://match.yuanrenxue.cn/match/18' });
    await sleep(8000);

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return 'EXC';
      return r.result.value;
    };
    for (let i = 0; i < 20; i++) { if (await ev('typeof window.myenc') === 'function') break; await sleep(500); }
    await ev(`(function(){
      var orig = window.myenc;
      window.__calls = [];
      window.myenc = function(a, b){
        var r = orig.apply(this, arguments);
        try { window.__calls.push({ a: String(a), b: b === undefined ? null : String(b), out: String(r), now: Date.now() }); } catch(e){}
        return r;
      };
      return 'ok';
    })()`);

    const click = async (p) => {
      const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="${p}"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    };

    const samples = [];
    const seq = [2, 3, 4, 2, 3, 4, 2, 3, 4, 2, 3, 4];
    for (const p of seq) {
      await ev('window.__calls = []');
      reqs.length = 0;
      await click(p);
      await sleep(3500);
      const calls = JSON.parse(await ev('JSON.stringify(window.__calls||[])') || '[]');
      const signed = reqs.find((u) => /[?&]t=/.test(u));
      const mm = signed && signed.match(/[?&]t=([^&]+)&v=([^&]+)/);
      const rec = { page: p, t: mm ? mm[1] : null, v: mm ? decodeURIComponent(mm[2]) : null, calls };
      samples.push(rec);
      const c = calls[0];
      log(`p${p} t=${rec.t} now=${c ? c.now : '-'} 明文=${c ? JSON.stringify(c.a) : '-'} key=${c ? c.b : '-'}`);
    }
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'q18_dense_samples.json'), JSON.stringify(samples, null, 2));
    log('\n已保存 docs/q18_dense_samples.json');
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
