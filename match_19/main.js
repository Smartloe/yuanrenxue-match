/**
 * 猿人学第19题 —— 乌拉乌拉乌拉
 *
 * 机制：数据接口 /api/question/19 会校验 **TLS/HTTP2 指纹**（JA3/JA4）。
 *       Node fetch、curl、python-requests 一律返回 {"error":"token failed"}，
 *       只有真实浏览器指纹才放行（题面另要求第 5 页 UA 必须是 yuanrenxue）。
 *
 * 因此本脚本用 CDP 驱动本机 Chrome，借它的网络栈取数：
 *   - 1~4 页：浏览器默认 UA
 *   - 第 5 页：Network.setUserAgentOverride 改成 yuanrenxue
 * 提交接口不校验指纹，仍用 Node 直接 POST。
 *
 * 用法：node main.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9442);
const HOST = 'https://match.yuanrenxue.cn';
const PAGE_URL = `${HOST}/match/19`;
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 25000);
    });
  }
}

async function collectViaBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx19-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) {
      try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); }
    }
    if (!ver) throw new Error('Chrome DevTools 端口未就绪');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: PAGE_URL });
    await sleep(6000);

    const evalIn = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval 失败');
      return r.result.value;
    };

    const values = [];
    for (let p = 1; p <= 5; p++) {
      if (p === 5) await cdp.send('Network.setUserAgentOverride', { userAgent: 'yuanrenxue' });  // 第5页 UA 必须换
      const raw = await evalIn(`(async function(){
        var r = await fetch('/api/question/19?page=${p}&pageSize=10&kw=', {headers:{'x-requested-with':'XMLHttpRequest'}});
        return JSON.stringify({status:r.status, body: await r.text()});
      })()`);
      const parsed = JSON.parse(raw);
      const json = JSON.parse(parsed.body);
      if (!Array.isArray(json.data) || typeof json.data[0] !== 'number') {
        throw new Error(`第${p}页异常: ${parsed.status} ${parsed.body.slice(0, 120)}`);
      }
      values.push(...json.data);
      console.log(`[+] 第${p}页${p === 5 ? '（UA=yuanrenxue）' : ''} ${JSON.stringify(json.data)}`);
    }
    ws.close();
    return values;
  } finally {
    chrome.kill();
    await sleep(200);
  }
}

(async () => {
  const values = await collectViaBrowser();
  const sum = values.reduce((a, b) => a + b, 0);
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${sum}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total: sum, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');

  const res = await fetch(`${HOST}/a/19`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: PAGE_URL, origin: HOST, 'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ answer: String(sum) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
