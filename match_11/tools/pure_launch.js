/**
 * 完全不用 CDP 启动页面（URL 作为启动参数，有头 Chrome），等一会儿再"事后"连上去读状态，
 * 排除 CDP 本身对盾的判定造成影响。
 *
 * 用法：node tools/pure_launch.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9360;
const WAIT_MS = Number(process.argv[2] || 25000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11pure-'));
  const chrome = spawn(CHROME, [
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--window-size=1200,800', '--window-position=80,80',
    PAGE_URL,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  // 等页面自然跑一会儿（此期间完全不连 CDP）
  await sleep(WAIT_MS);

  let version = null;
  for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser, '（页面已自然运行', WAIT_MS, 'ms 后才连上）');

  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('yuanrenxue'));
  if (!page) { log('[-] 未找到题目页面，tabs=', JSON.stringify(tabs.map((t) => t.url.slice(0, 60)))); chrome.kill(); return; }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m.result); }
  });
  const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(resolve, 8000); });

  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      secretkey: typeof window.secretkey,
      SecretKey: typeof window.SecretKey,
      match1: (window.match1 === undefined ? null : String(window.match1)),
      trap: /Developer tools detected/.test(document.body.innerHTML),
      globals: Object.getOwnPropertyNames(window).filter(function(k){ return /secret|risk|trap|wlz|random/i.test(k); })
    })`,
    returnByValue: true,
  });
  log('[page]', r && r.result ? r.result.value : JSON.stringify(r));

  ws.close(); chrome.kill(); await sleep(300);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
