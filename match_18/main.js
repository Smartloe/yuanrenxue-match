/**
 * Q18 通关尝试：伪造第 5 页签名
 *
 * 已知（本会话逆向所得）：
 *   v = myenc("<页码>|<token窗口>", key)，key = hex(t) 重复两次（t = 服务端秒级时间）
 *   token 窗口与页码无关，只随时间推进；myenc 是 VM 暴露出来的 AES-CBC+PKCS7 函数
 * 做法：
 *   1. 加载前把 UA 设为 yuanrenxue（第 5 页的 UA 要求）
 *   2. 钩住 myenc，真实点击第 4 页，拿到"当前 token 窗口"
 *   3. 取服务端时间 → t，算出 key = hex(t)×2
 *   4. 用 myenc("5|<token窗口>", key) 生成 page=5 的 v
 *   5. 在浏览器里请求 /api/v/question/18data?page=5&t=..&v=..（借浏览器 TLS 指纹）
 *
 * 用法：node forge.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9556);
const HOST = 'https://match.yuanrenxue.cn';
const Q = 18;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'session.json'), 'utf8'));
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18forge-'));
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
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Network.setUserAgentOverride', { userAgent: 'yuanrenxue' });
    await cdp.send('Page.navigate', { url: `${HOST}/match/${Q}` });
    await sleep(8000);

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 160);
      return r.result.value;
    };
    for (let i = 0; i < 20; i++) { if (await ev('typeof window.myenc') === 'function') break; await sleep(500); }
    await ev(`(function(){
      var orig = window.myenc;
      window.__last = null;
      window.myenc = function(a, b){ var r = orig.apply(this, arguments); try { window.__last = { plain: String(a), key: String(b) }; } catch(e){} return r; };
      return 'hooked';
    })()`);

    const click = async (p) => {
      const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="${p}"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    };

    await click(4);
    for (let i = 0; i < 20 && !(await ev('window.__last && window.__last.plain')); i++) await sleep(400);
    const cap = JSON.parse((await ev('JSON.stringify(window.__last)')) || 'null');
    if (!cap) throw new Error('没能从 myenc 拿到明文样本');
    log('[*] 捕获到的明文:', cap.plain);
    const tokens = cap.plain.slice(cap.plain.indexOf('|') + 1);

    const nowMs = Number(String(await ev(`(async function(){var r=await fetch('/api/getTime');return await r.text();})()`)).trim());
    const t = Math.floor(nowMs / 1000);
    const key = t.toString(16).padStart(8, '0').repeat(2);
    const plain5 = `5|${tokens}`;
    log(`[*] 服务端时间 ms=${nowMs} → t=${t}，key=${key}`);
    log('[*] 伪造明文:', plain5);

    const v = await ev(`String(window.myenc(${JSON.stringify(plain5)}, ${JSON.stringify(key)}))`);
    log('[*] 伪造 v =', v);

    const url = `/api/v/question/${Q}data?page=5&t=${t}&v=${encodeURIComponent(v)}`;
    const body = await ev(`(async function(){
      var r = await fetch(${JSON.stringify(url)}, { headers: { 'x-requested-with': 'XMLHttpRequest' } });
      return r.status + ' ' + (await r.text());
    })()`);
    log('[*] 响应:', String(body).slice(0, 300));

    let data = null;
    const bodyTxt = String(body).replace(/^\d+\s/, '');
    try { const j = JSON.parse(bodyTxt); if (Array.isArray(j.data) && typeof j.data[0] === 'number') data = j.data; } catch { /* ignore */ }
    if (!data) { log('[-] 伪造签名未被接受'); return; }
    log('\n✅ 成功拿到第 5 页数据:', JSON.stringify(data));
    fs.writeFileSync(path.join(__dirname, 'docs', 'page5.json'), JSON.stringify(data));
    if (process.argv.includes('--no-submit')) return;

    // 依次取 1~4 页（页面自己会签名），读出渲染结果
    const pages = [];
    for (const p of [1, 2, 3, 4]) {
      await click(p);
      let nums = [];
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        const txt = await ev(`(document.querySelector('#pgxList')||{}).innerText||''`);
        nums = (String(txt).match(/\d+/g) || []).map(Number).slice(0, 10);
        if (nums.length === 10) break;
      }
      pages.push(nums);
      log(`[*] 第${p}页（页面渲染）`, JSON.stringify(nums));
    }
    pages.push(data);
    const all = pages.flat();
    const total = all.reduce((a, b) => a + b, 0);
    log(`\n[*] 共 ${all.length} 个数，总和 = ${total}`);
    const res = await fetch(`${HOST}/a/${Q}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'application/json, text/javascript, */*; q=0.01',
        cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, origin: HOST, 'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ answer: String(total) }).toString(),
    });
    const text = await res.text();
    log(`[*] 提交 → HTTP ${res.status} ${text}`);
    try { fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ pages, total, count: all.length, response: JSON.parse(text) }, null, 2)); } catch { /* ignore */ }
    if (JSON.parse(text).code === 2) log('[*] ✅ 通关');
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
