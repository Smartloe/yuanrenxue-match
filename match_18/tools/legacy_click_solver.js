/**
 * 猿人学第18题 —— jsvmp - 洞察先机
 *
 * 机制：
 *   1. 数据接口 /api/v/question/18data?page=N 需要一次性签名：
 *        /api/v/question/18data?page=2&t=<服务端秒级时间>&v=<VM 计算出的签名>
 *      第 1 页免签名（页面的第一次请求），之后的页码由页面里的 JSVMP 生成 t/v；
 *      JSVMP 通过重写 Date.now 同步请求 /api/getTime 拿服务端时间来算签名。
 *   2. 关键坑：JSVMP 校验点击事件的 isTrusted —— 用 JS 的 element.click() 会失败
 *      （表现为 open 包装器内部出错、请求根本不发出）。必须用**真实输入事件**。
 *   3. 第 5 页要求 User-Agent: yuanrenxue。
 *
 * 解法：CDP 驱动 Chrome，用 Input.dispatchMouseEvent 真点分页按钮，逐页抓取渲染结果。
 *
 * 用法：node main.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9496);
const HOST = 'https://match.yuanrenxue.cn';
const Q = 18;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1500,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); } }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);
    const seen = [];
    let captureMode = false;          // 打开后：拦截带签名的请求，改写成 page=5 并让请求失败（签名不被消费）
    let page5SignedUrl = null;
    cdp.on(async (m) => {
      if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) seen.push(m.params.request.url.replace(HOST, ''));
      if (m.method === 'Fetch.requestPaused') {
        const { requestId, request } = m.params;
        if (captureMode && /18data/.test(request.url) && /[?&]t=/.test(request.url)) {
          page5SignedUrl = request.url.replace(/page=\d+/, 'page=5');
          try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
          return;
        }
        try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*18data*', requestStage: 'Request' }] });
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    // 关键：签名与 UA 绑定，必须在页面加载前就把 UA 设成 yuanrenxue，
    // 这样 VM 生成的签名才能在带 UA=yuanrenxue 重放第 5 页时通过校验
    await cdp.send('Network.setUserAgentOverride', { userAgent: 'yuanrenxue' });
    await cdp.send('Page.navigate', { url: `${HOST}/match/${Q}` });

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return null;
      return r.result.value;
    };
    const nums = async () => {
      const txt = await ev(`(function(){var el=document.querySelector('#pgxList');return el?el.innerText:'';})()`);
      return (String(txt || '').match(/\d+/g) || []).map(Number).slice(0, 10);
    };
    const clickReal = async (selector) => {
      const box = await ev(`(function(){var b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;var r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`);
      if (!box) return false;
      const { x, y } = JSON.parse(box);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    };

    // 等第 1 页
    let first = [];
    for (let i = 0; i < 25; i++) { await sleep(1000); first = await nums(); if (first.length >= 10) break; }
    const pages = [first];
    console.log(`[+] 第1页 ${JSON.stringify(first)}`);

    for (let p = 2; p <= 5; p++) {
      // 注意：不能改 UA —— JSVMP 发现 UA 变化就不会给请求签名。
      // 首页照常点，签名由 VM 生成；第 5 页签名拿到后我们用正确的 UA 去重放。
      const ok = await clickReal(`#pgxPages .pgx-page[data-page="${p}"]`);
      if (!ok) throw new Error(`第${p}页按钮没找到`);
      let d = [];
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        d = await nums();
        if (d.length >= 10 && JSON.stringify(d) !== JSON.stringify(pages[pages.length - 1])) break;
      }
      if (p === 5 && d.length < 10) {
        // 再点一次第 4 页：VM 会为它现场签名；拦截后把 page 改成 5 并让请求失败，
        // 这样签名没被消费，可以拿去带 UA=yuanrenxue 重放（签名不绑定页码）
        console.log('[·] 再点第4页以获取一个未消费的签名 …');
        captureMode = true;
        await clickReal('#pgxPages .pgx-page[data-page="4"]');
        for (let i = 0; i < 15 && !page5SignedUrl; i++) await sleep(1000);
        captureMode = false;
        if (!page5SignedUrl) throw new Error('没拿到未消费的签名 URL');
        console.log('[·] 重放（UA=yuanrenxue）:', page5SignedUrl.slice(page5SignedUrl.indexOf('?')));
        // 必须【在浏览器里】重放：Node 的 TLS 指纹会被服务端拒绝（与第19题同理）
        const body = await ev(`(async function(){
          var r = await fetch(${JSON.stringify(page5SignedUrl)}, { headers: { 'x-requested-with': 'XMLHttpRequest' } });
          return await r.text();
        })()`);
        let j; try { j = JSON.parse(String(body)); } catch (e) { throw new Error('第5页重放返回非 JSON: ' + String(body).slice(0, 150)); }
        if (!Array.isArray(j.data)) throw new Error('第5页重放失败: ' + JSON.stringify(j).slice(0, 150));
        d = j.data;
      }
      pages.push(d);
      console.log(`[+] 第${p}页${p === 5 ? '（UA=yuanrenxue 重放）' : ''} ${JSON.stringify(d)}`);
    }
    console.log('\n[*] 带签名的请求:'); seen.forEach((s) => console.log('   ', s));

    const all = pages.flat(); const total = all.reduce((a, b) => a + b, 0);
    console.log(`\n[*] 共 ${all.length} 个数，总和 = ${total}`);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ pages, total, count: all.length }, null, 2));
    ws.close();
    if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
    const res = await fetch(`${HOST}/a/${Q}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'application/json, text/javascript, */*; q=0.01',
        cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, origin: HOST, 'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ answer: String(total) }).toString(),
    });
    const text = await res.text(); console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
    const r = JSON.parse(text);
    const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
    if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
  } finally { chrome.kill(); await sleep(200); }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
