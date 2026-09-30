/**
 * 用 CDP 驱动本机 Chrome 做动态侦察：加载题目页面，抓取所有网络请求与响应。
 * 不依赖任何 npm 包（Node 内置 WebSocket + fetch）。
 *
 * 用法：node tools/cdp_recon.js <url> [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9333;
const URL_TO_OPEN = process.argv[2] || 'https://match.yuanrenxue.cn/match/11';
const WAIT_MS = Number(process.argv[3] || 12000);

const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  on(fn) { this.handlers.push(fn); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); }
      }, 30000);
    });
  }
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', (d) => {
    const s = String(d);
    if (/error|Error/.test(s) && !/DevTools listening/.test(s)) log('[chrome]', s.trim().slice(0, 200));
  });

  // 等 DevTools 端口就绪
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
  }
  if (!version) throw new Error('Chrome DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  // 新建页面
  const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const requests = new Map();
  const bodies = [];
  cdp.on((msg) => {
    if (msg.method === 'Network.requestWillBeSent') {
      const r = msg.params.request;
      requests.set(msg.params.requestId, r);
      if (!/\.(png|jpg|jpeg|gif|css|woff2?|ico|svg)/.test(r.url) && !r.url.startsWith('https://hm.baidu.com')) {
        log(`[req] ${r.method} ${r.url.slice(0, 220)}`);
        if (r.postData) log(`      postData: ${r.postData.slice(0, 300)}`);
      }
    }
    if (msg.method === 'Network.responseReceived') {
      bodies.push({ requestId: msg.params.requestId, url: msg.params.response.url, status: msg.params.response.status });
    }
  });

  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  for (const [name, value] of [['sessionid', SESSION.sessionid]]) {
    await cdp.send('Network.setCookie', { name, value, domain: 'match.yuanrenxue.cn', path: '/', httpOnly: false, secure: true });
  }

  log(`[*] 打开 ${URL_TO_OPEN}`);
  await cdp.send('Page.navigate', { url: URL_TO_OPEN });
  await sleep(WAIT_MS);

  // 抓响应体（只看 JSON / 文本接口）
  for (const b of bodies) {
    if (!/yuanrenxue\.cn\/(api|a)\//.test(b.url)) continue;
    try {
      const r = await cdp.send('Network.getResponseBody', { requestId: b.requestId });
      log(`\n[resp ${b.status}] ${b.url.slice(0, 200)}\n${r.body.slice(0, 800)}`);
    } catch (e) { /* 已丢弃 */ }
  }

  // 页面内探查
  const probe = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      match1: typeof window.match1 !== 'undefined' ? window.match1 : null,
      keys: Object.keys(window).filter(k => /yxr|match|dev/i.test(k)).slice(0, 40),
      hasJq: typeof window.jQuery,
      ua: navigator.userAgent,
      w: [window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight],
    })`,
    returnByValue: true,
  });
  log('\n[page]', probe.result.value);

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
