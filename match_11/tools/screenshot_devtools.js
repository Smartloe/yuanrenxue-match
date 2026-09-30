/**
 * 挂真 DevTools 前端，然后给"前端那个标签页"截图，
 * 直接看真人打开控制台时 Console 里到底打印了什么。
 * （用改写版 VM：摘掉 debugger 探针，避免 DevTools 挂上后卡死）
 *
 * 用法：node tools/screenshot_devtools.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9418;
const WAIT_MS = Number(process.argv[2] || 15000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const VM_URL_PART = 'yrx_check_devtools_jsvmp';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 生成"摘掉 debugger"的改写版
const raw = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');
const patched = raw.split('function(){debugger}()').join('function(){}()');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'patched_jsvmp_nodbg.js'), patched);

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11shot-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    '--window-size=1600,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);
  cdp.on(async (m) => {
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.includes(VM_URL_PART)) {
        try {
          await cdp.send('Fetch.fulfillRequest', {
            requestId, responseCode: 200,
            responseHeaders: [{ name: 'content-type', value: 'application/javascript; charset=utf-8' }],
            body: Buffer.from(patched, 'utf8').toString('base64'),
          });
        } catch { /* ignore */ }
        return;
      }
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
        return;
      }
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(3000);

  // 打开真 DevTools 前端
  const dtUrl = `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${t.id}&panel=console`;
  const dt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`, { method: 'PUT' })).json();
  log('[*] DevTools 前端 target:', String(dt.url).slice(0, 70));
  await sleep(4000);

  // 连到前端 target，截图
  const dtWs = new WebSocket(dt.webSocketDebuggerUrl);
  await new Promise((r, j) => { dtWs.addEventListener('open', r); dtWs.addEventListener('error', j); });
  const dtCdp = new CDP(dtWs);
  await dtCdp.send('Page.enable');
  try { await dtCdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }); } catch { /* ignore */ }
  await sleep(WAIT_MS);

  const shot = await dtCdp.send('Page.captureScreenshot', { format: 'png' });
  const out = path.join(__dirname, '..', 'docs', 'devtools_console_panel.png');
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  log('[*] 已截图:', out, fs.statSync(out).size, 'bytes');

  // 顺便看看页面状态（不开 Runtime 域，用 evaluate 命令即可）
  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) return 'EXC';
    return r.result.value;
  };
  log('[*] 页面状态:', await ev(`JSON.stringify({secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,match1:String(window.match1),suffix:(function(){var m=document.body.innerText.match(/secretkey\\([^)]*"([0-9a-f]{16})"/);return m?m[1]:null;})()})`));

  ws.close(); dtWs.close(); ch.kill(); await sleep(300);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
