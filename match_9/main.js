/**
 * 猿人学第9题 —— js 混淆 - 动态cookie 2
 *
 * 机制：GET /api/question/9 时，如果 m 不对/过期，服务端返回的**不是 JSON 而是一段 JS**，
 *       页面 `eval(res.data)` 执行它来刷新 m（并提示"预加载 m 成功，请等待页面自动刷新"），
 *       随后 reload 页面再次请求才拿到数据。
 *       页面靠 /static/new_match/question/9/udc.js（jsjiami v5 混淆）生成 window.match1。
 *
 * 解法：真实 Chrome 打开题目页（让 udc.js 生成 m），然后在页面上下文里循环请求：
 *       拿到 JSON 就用，拿到 JS 就 eval 刷新 m 再请求。
 *
 * 用法：node main.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9460);
const HOST = 'https://match.yuanrenxue.cn';
const Q = 9;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx9-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1500,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: `${HOST}/match/${Q}` });
    await sleep(8000);   // 等 udc.js 跑完并生成 m

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { err: (r.exceptionDetails.exception || {}).description };
      return { val: r.result.value };
    };
    console.log('[*] 页面里的 m 候选:', JSON.stringify((await ev(`JSON.stringify({match1:typeof window.match1, match9:typeof window.match9})`)).val));

    const collectFor = (START, END) => `(async function(){
      var START=${START}, END=${END};
      var out = [];
      for (var p = START; p <= END; p++) {
        var data = null;
        for (var i = 0; i < 8; i++) {
          var m = (window.match1 !== undefined ? window.match1 : (window.match9 !== undefined ? window.match9 : ''));
          var r = await fetch('/api/question/${Q}?page=' + p + '&pageSize=10&kw=&m=' + encodeURIComponent(m),
            { headers: { 'x-requested-with': 'XMLHttpRequest' } });
          var t = await r.text();
          var j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
          if (j && Array.isArray(j.data)) { data = j.data; break; }
          try { (0, eval)(t); } catch (e) { return 'eval 失败: ' + e.message + ' | ' + t.slice(0, 120); }   // 预加载 m
          await new Promise(function(res){ setTimeout(res, 400); });
        }
        if (!data) return '第' + p + '页始终拿不到数据';
        out.push(data);
      }
      return JSON.stringify(out);
    })()`;

    const res = await ev(collectFor(1, 4));
    if (res.err) throw new Error(res.err.slice(0, 200));
    if (typeof res.val === 'string' && !res.val.startsWith('[[')) throw new Error(res.val);
    const pages = JSON.parse(res.val);
    pages.forEach((d, i) => console.log(`[+] 第${i + 1}页 ${JSON.stringify(d)}`));
    // 第 5 页：题面要求 UA 换成 yuanrenxue
    await cdp.send('Network.setUserAgentOverride', { userAgent: 'yuanrenxue' });
    await sleep(1500);
    const res5 = await ev(collectFor(5, 5));
    if (res5.err) throw new Error(res5.err.slice(0, 200));
    if (typeof res5.val === 'string' && !res5.val.startsWith('[[')) throw new Error(res5.val);
    const page5 = JSON.parse(res5.val)[0];
    pages.push(page5);
    console.log(`[+] 第5页（UA=yuanrenxue） ${JSON.stringify(page5)}`);
    const all = pages.flat();
    const total = all.reduce((a, b) => a + b, 0);
    console.log(`\n[*] 共 ${all.length} 个数，总和 = ${total}`);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ pages, total, count: all.length }, null, 2));
    ws.close();

    if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
    const sub = await fetch(`${HOST}/a/${Q}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/javascript, */*; q=0.01',
        cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, origin: HOST, 'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ answer: String(total) }).toString(),
    });
    const text = await sub.text();
    console.log(`[*] 提交 → HTTP ${sub.status} ${text}`);
    const r = JSON.parse(text);
    const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
    if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
  } finally {
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
