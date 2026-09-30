/**
 * 任务提示"恢复控制台的全部功能"：VM 会把 console.log 换成自己的版本（并做 Proxy/原生性检测）。
 * 这里在页面脚本之前抓住原生 console，并持续把被改写的方法还原成原生函数，
 * 看 VM 是否因此走正常分支（注入真的 window.secretkey，并发出取数请求）。
 *
 * 用法：node tools/cdp_restore.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9344;
const WAIT_MS = Number(process.argv[2] || 16000);
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

// 关键：只把 console 各方法"还原成原生"，不做任何 Proxy/包装
const RESTORE_SCRIPT = `
(function(){
  try{
    var native = window.console;
    var saved = {};
    ['log','info','warn','error','debug','trace','dir','table','clear','group','groupEnd','assert','count','time','timeEnd'].forEach(function(n){
      if (native && typeof native[n] === 'function') saved[n] = native[n];
    });
    window.__savedConsole = saved;
    var n = 0;
    var timer = setInterval(function(){
      n++;
      try{
        for (var k in saved) {
          if (window.console[k] !== saved[k]) window.console[k] = saved[k];
        }
      }catch(e){}
      if (n > 4000) clearInterval(timer);
    }, 5);
  }catch(e){}
})();
`;

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11r-'));
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
  const consoleMsgs = [];
  cdp.on(async (m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = '[' + m.params.type + '] ' + m.params.args.map((a) => (!a ? 'undefined' : (a.type === 'string' ? a.value : ('value' in a ? JSON.stringify(a.value) : (a.description || a.type))))).join(' ');
      consoleMsgs.push(line);
      log('  <', line.slice(0, 240));
    }
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      if (/yuanrenxue\.cn\/(api|a)\//.test(r.url)) { apiReqs.push({ id: m.params.requestId, url: r.url }); log('  [req]', r.url.slice(0, 260)); }
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        blocked++; log('  [拦截跳转]', request.url);
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');           // 用来观察页面到底打印了什么（配合"还原原生 console"）
  await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'MacIntel' });
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RESTORE_SCRIPT });
  try { await cdp.send('Page.bringToFront'); } catch { /* ignore */ }

  log(`[*] 打开 ${PAGE_URL}（持续还原原生 console，不做任何包装）`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

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
    match1: (typeof window.match1 === 'undefined' ? null : String(window.match1).slice(0, 160)),
    logNative: /native code/.test(Function.prototype.toString.call(console.log)),
    logRestored: (window.console.log === (window.__savedConsole && window.__savedConsole.log))
  })`);
  log('\n[page]', probe.error || probe.value);
  log('[拦截跳转]', blocked, '次');
  log('[控制台]', consoleMsgs.length, '条，去重', new Set(consoleMsgs).size);
  const rs = [...new Set(consoleMsgs.map((l) => (l.match(/RandomString[:\s]+(\S+)/) || [])[1]).filter(Boolean))];
  log('[RandomString]', JSON.stringify(rs));

  for (const r of apiReqs) {
    if (!/\/api\/question\//.test(r.url)) continue;
    try { const b = await cdp.send('Network.getResponseBody', { requestId: r.id }); log(`\n[resp] ${r.url.slice(0, 180)}\n${String(b.body).slice(0, 500)}`); } catch { /* ignore */ }
  }
  log('\n[URL 中的 m]', JSON.stringify(apiReqs.map((r) => (r.url.match(/[?&]m=([^&]+)/) || [])[1]).filter(Boolean)));

  ws.close(); chrome.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
