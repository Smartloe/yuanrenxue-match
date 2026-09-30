/**
 * 通过"不开 Runtime 域 + 只抓网络"的方式拿到 VM 自己算出的 m：
 *   - 不 enable Runtime（避免 console 参数被 CDP 序列化，从而被控制台检测发现）
 *   - 只 enable Page / Network / Fetch（Fetch 只拦 Document，用来挡住检测失败时的跳转）
 *   - 观察是否出现 /api/question/11?page=..&m=... 请求
 *
 * 用法：node tools/cdp_pass.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9342;
const WAIT_MS = Number(process.argv[2] || 15000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11p-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1440,900', `--user-agent=${UA}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 80; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const apiReqs = [];
  let blocked = 0;
  cdp.on(async (m) => {
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      if (/yuanrenxue\.cn\/(api|a)\//.test(r.url)) {
        apiReqs.push({ id: m.params.requestId, url: r.url, method: r.method });
        log('  [req]', r.method, r.url.slice(0, 240));
      }
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        blocked++; log('  [拦截跳转]', request.url);
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else {
        try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
      }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  // 让页面看起来"可见且聚焦"（真实浏览器特征）
  try { await cdp.send('Page.bringToFront'); } catch { /* ignore */ }
  try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* ignore */ }
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'MacIntel' });
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  // 只拦 Document，避免给 XHR 增加延迟
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });

  log(`[*] 打开 ${PAGE_URL}（不开 Runtime 域）`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  // Runtime.evaluate 命令本身不订阅事件，用来读状态是安全的
  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  const probe = await evalIn(`JSON.stringify({
    url: location.href,
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    trap: /Developer tools detected|多重跳转/.test(document.body.innerHTML),
    match1: (typeof window.match1 === 'undefined' ? null : String(window.match1).slice(0, 200)),
    vis: document.visibilityState,
    focus: document.hasFocus(),
    outer: [window.outerWidth, window.outerHeight, window.innerWidth, window.innerHeight],
    ua: navigator.userAgent.slice(-40),
    plugins: navigator.plugins.length,
    chromeObj: typeof window.chrome,
    hasTrap: typeof window.DevtoolsTrap,
    logSrc: (function(){ try { return Function.prototype.toString.call(console.log); } catch(e){ return 'err'; } })()
  })`);
  log('\n[page]', probe.error || probe.value);
  log('[拦截跳转]', blocked, '次');

  // 抓 /api/question/ 的响应
  for (const r of apiReqs) {
    if (!/\/api\/question\//.test(r.url)) continue;
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: r.id });
      log(`\n[resp] ${r.url.slice(0, 200)}\n${String(body.body).slice(0, 600)}`);
    } catch (e) { log('[resp 取不到]', r.url.slice(0, 120), e.message); }
  }

  // 若有 secretkey，用 m 里的时间窗口参数复算
  const mGuess = apiReqs.map((r) => (r.url.match(/[?&]m=([^&]+)/) || [])[1]).filter(Boolean);
  log('\n[URL 中的 m]', JSON.stringify(mGuess));

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
