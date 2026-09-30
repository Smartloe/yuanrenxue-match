/**
 * Q18 决定性实验：window.myenc 是 VM 暴露的加密/签名函数。
 * 抓一次真实的 page=2 请求 (t, v)，再在页面里调用 myenc(2, t) 比对；
 * 若一致（或能推导出 v），就可以直接为 page=5 生成签名并通关。
 *
 * 用法：node tools/q18_myenc.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9542);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18me2-'));
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
      if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 160);
      return r.result.value;
    };
    // 真实点击第 2 页，拿到真实 (t, v)
    const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="2"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(5000);

    const signed = reqs.find((u) => /page=2&t=/.test(u));
    log('真实请求:', signed ? signed.slice(signed.indexOf('?')) : '未捕获');
    let t2 = null, v2 = null;
    if (signed) {
      const m = signed.match(/[?&]t=([^&]+)&v=([^&]+)/);
      if (m) { t2 = m[1]; v2 = decodeURIComponent(m[2]); }
    }
    log('t =', t2, '| v =', v2);
    log('v 解码后长度:', v2 ? Buffer.from(v2, 'base64').length : '-');

    log('\n=== 确定性检查 ===');
    log('myenc(5) 两次:', await ev('String(window.myenc(5))'), '/', await ev('String(window.myenc(5))'));
    log('myenc(5,"x") 两次:', await ev('String(window.myenc(5,"x"))'), '/', await ev('String(window.myenc(5,"x"))'));

    log('\n=== 与真实签名比对 ===');
    if (t2) {
      for (const [label, expr] of [
        ['myenc(2,t)', `String(window.myenc(2, ${JSON.stringify(t2)}))`],
        ['myenc("2",t)', `String(window.myenc("2", ${JSON.stringify(t2)}))`],
        ['myenc(2)', `String(window.myenc(2))`],
        ['myenc(t)', `String(window.myenc(${JSON.stringify(t2)}))`],
        ['myenc(2,t,"")', `String(window.myenc(2, ${JSON.stringify(t2)}, ""))`],
      ]) {
        const r = await ev(`(function(){try{return ${expr}}catch(e){return 'EXC:'+e.message}})()`);
        log(`  ${label} →`, String(r).slice(0, 120), (String(r) === v2 ? '  ★与 v 相同!' : ''));
      }
    }
    log('\n=== 参数个数扫描 ===');
    for (let n = 0; n <= 4; n++) {
      const args = ['2', '1790700000', 'x', 'y'].slice(0, n).join(',');
      const r = await ev(`(function(){try{return String(window.myenc(${args}))}catch(e){return 'EXC:'+e.message}})()`);
      log(`  myenc(${args}) →`, String(r).slice(0, 120));
    }
    ws.close();
  } finally {
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
