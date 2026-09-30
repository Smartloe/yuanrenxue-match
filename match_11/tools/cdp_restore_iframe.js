/**
 * 关键猜想：盾的检测要求 window.console.log 必须等于"从干净 iframe 里取出的原生 console.log"
 * （任务提示"恢复 console.log 功能"）。
 * 做法：在页面里建一个 iframe，把它的原生 console 方法赋回 window.console，
 * 然后等盾的下一次巡检，看是否注入真正的 window.secretkey / 设置 window.match1。
 *
 * 用法：node tools/cdp_restore_iframe.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9358;
const WAIT_MS = Number(process.argv[2] || 20000);
const SETTLE_MS = Number(process.argv[3] || 8000);
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

const RESTORE_EXPR = `(function(){
  try{
    var old = document.getElementById('__clean_iframe__');
    if (old) old.parentNode.removeChild(old);
    var f = document.createElement('iframe');
    f.id = '__clean_iframe__';
    f.style.display = 'none';
    f.src = 'about:blank';
    document.body.appendChild(f);
    var cw = f.contentWindow;
    var names = ['log','info','warn','error','debug','trace','dir','table','group','groupEnd','groupCollapsed','assert','clear','count','countReset','time','timeEnd','timeLog'];
    var done = [];
    for (var i=0;i<names.length;i++){
      var n = names[i];
      try { if (cw.console && typeof cw.console[n] === 'function') { window.console[n] = cw.console[n]; done.push(n); } } catch(e){}
    }
    try { window.console = cw.console; } catch(e){}
    return JSON.stringify({
      done: done,
      sameLog: window.console.log === cw.console.log,
      nativeLog: /native code/.test(Function.prototype.toString.call(window.console.log)),
      consoleSame: window.console === cw.console
    });
  }catch(e){ return 'ERR ' + e.message; }
})()`;

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11ri-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 80; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const reqs = [];
  cdp.on(async (m) => {
    if (m.method === 'Network.requestWillBeSent' && /yuanrenxue\.cn\/(api|a)\//.test(m.params.request.url)) {
      reqs.push(m.params.request.url); log('  [req]', m.params.request.url.slice(0, 240));
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });

  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  log(`[*] 打开 ${PAGE_URL}`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  log('[*] 注入前状态:', (await evalIn(`JSON.stringify({secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,match1:(window.match1===undefined?null:String(window.match1).slice(0,80))})`)).value);

  log('[*] 执行"从干净 iframe 恢复 console"...');
  const r1 = await evalIn(RESTORE_EXPR);
  log('    ', r1.error || r1.value);
  await sleep(SETTLE_MS);

  const probe = await evalIn(`JSON.stringify({
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    match1: (window.match1 === undefined ? null : String(window.match1).slice(0, 200)),
    trap: /Developer tools detected/.test(document.body.innerHTML)
  })`);
  log('[*] 注入后状态:', probe.error || probe.value);

  if (typeof (await evalIn('typeof window.secretkey')).value === 'string') { /* noop */ }
  const hasFn = await evalIn(`(typeof window.secretkey === 'function') ? 'yes' : 'no'`);
  if (hasFn.value === 'yes') {
    const out = await evalIn(`(function(){
      var f = window.secretkey;
      var res = [];
      var cands = ['', 'test'];
      for (var i=0;i<cands.length;i++){
        try { res.push(cands[i] + ' => ' + String(f(cands[i] + '3f73bd8671faaa92'))); } catch(e){ res.push('ERR ' + e.message); }
      }
      return JSON.stringify(res);
    })()`);
    log('[*] secretkey 调用:', out.error || out.value);
  }

  log('[*] 请求:', JSON.stringify(reqs));
  ws.close(); chrome.kill(); await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
