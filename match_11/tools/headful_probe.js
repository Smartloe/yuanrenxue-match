/**
 * 真·有头 Chrome + 真·DevTools 前端：复现"打开控制台"的完整环境。
 * 观察：是否出现真正的 window.secretkey、控制台打印了什么、是否发出取数请求。
 *
 * 用法：node tools/headful_probe.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9352;
const WAIT_MS = Number(process.argv[2] || 20000);
const NO_DEVTOOLS = process.argv.includes('--no-devtools');
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));

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

const argToStr = (a) => (!a ? 'undefined' : (a.type === 'string' ? a.value : ('value' in a ? JSON.stringify(a.value) : (a.description || a.type))));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11hf-'));
  const chrome = spawn(CHROME, [
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--window-size=1200,800', '--window-position=60,60',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 80; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome(有头):', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const consoleMsgs = [];
  const reqs = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = `[${m.params.type}] ` + m.params.args.map(argToStr).join(' ');
      consoleMsgs.push(line); log('  <', line.slice(0, 220));
    }
    if (m.method === 'Network.requestWillBeSent' && /yuanrenxue\.cn\/(api|a)\//.test(m.params.request.url)) { reqs.push(m.params.request.url); log('  [req]', m.params.request.url.slice(0, 220)); }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  if (!NO_DEVTOOLS) {
    // 挂了 DevTools 才需要跳过断点，否则 VM 的无限 debugger 会卡死页面
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.setSkipAllPauses', { skip: true });
  }
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });

  log(`[*] 打开 ${PAGE_URL}`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(3000);

  if (!NO_DEVTOOLS) {
    const dtUrl = `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${target.id}`;
    log('[*] 打开 DevTools 前端（等同于 F12）');
    try { await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`, { method: 'PUT' }); } catch (e) { log('  前端打开失败:', e.message); }
    await sleep(2000);
    try { await cdp.send('Runtime.enable'); log('[*] Runtime 域已启用（观察控制台）'); } catch (e) { log('Runtime.enable 失败:', e.message); }
  } else {
    log('[*] 不挂 DevTools、不开 Runtime（纯真实用户环境）');
  }

  await sleep(WAIT_MS);

  const evalIn = async (expr) => {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
        return { value: r.result.value };
      } catch (e) { log('  [evaluate 重试]', e.message); await sleep(1500); }
    }
    return { error: 'evaluate 多次失败' };
  };

  const probe = await evalIn(`JSON.stringify({
    url: location.href,
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    match1: (window.match1 === undefined ? null : String(window.match1).slice(0, 200)),
    trap: /Developer tools detected/.test(document.body.innerHTML)
  })`);
  log('\n[page]', probe.error || probe.value);
  log('[请求]', JSON.stringify(reqs));
  log('[控制台] 共', consoleMsgs.length, '条');
  const rs = [...new Set(consoleMsgs.map((l) => (l.match(/RandomString[:\s]+(\S+)/) || [])[1]).filter(Boolean))];
  log('[RandomString]', JSON.stringify(rs));

  if (rs.length) {
    const out = await evalIn(`(function(){
      var fn = (typeof window.secretkey === 'function') ? window.secretkey : (typeof window.SecretKey === 'function' ? window.SecretKey : null);
      if (!fn) return 'no-fn';
      var which = (typeof window.secretkey === 'function') ? 'secretkey' : 'SecretKey';
      var res = [];
      ${JSON.stringify(rs)}.forEach(function(s){ try { res.push(which + '(' + s + ' + suffix) = ' + String(fn(s + '3f73bd8671faaa92'))); } catch(e){ res.push('ERR ' + e.message); } });
      return JSON.stringify(res);
    })()`);
    log('[计算结果]', out.error || out.value);
  }

  ws.close(); chrome.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
