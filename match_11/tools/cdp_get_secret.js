/**
 * 在真实 Chrome 中加载第11题，绕过"控制台被禁用"：
 *   - 页面脚本执行前就把 console 包成记录代理（含 VM 后续的改写）
 *   - 记录写入 window.__calls 并同步到 sessionStorage，防止被跳转清空
 *   - 只开 Page/Network 域，避免不必要的 CDP 检测面
 *
 * 用法：node tools/cdp_get_secret.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9336;
const WAIT_MS = Number(process.argv[2] || 15000);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
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

// 注入到每个新文档最前面的脚本
const EARLY_SCRIPT = `
(function(){
  try{
    var calls = [];
    window.__calls = calls;
    var push = function(name, args){
      var line = '[' + name + '] ' + args.map(function(a){
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch(e){ return String(a); }
      }).join(' ');
      calls.push(line);
      try { sessionStorage.setItem('__calls', JSON.stringify(calls.slice(-300))); } catch(e){}
    };
    var real = window.console;
    var rec = function(name, fn){
      return function(){
        push(name, [].slice.call(arguments));
        try { if (typeof fn === 'function') return fn.apply(real, arguments); } catch(e){}
      };
    };
    var names = ['log','info','warn','error','debug','trace','table','dir','group','groupEnd','clear','assert','count','time','timeEnd'];
    var proxy = {};
    names.forEach(function(n){ proxy[n] = rec(n, real && real[n]); });
    window.console = new Proxy(proxy, {
      get: function(t,p){ if (p in t) return t[p]; var v = real ? real[p] : undefined; return typeof v === 'function' ? rec(String(p), v) : v; },
      set: function(t,p,v){ t[p] = typeof v === 'function' ? rec(String(p), v) : v; return true; }
    });
  }catch(e){}
})();
`;

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1440,900',
    `--user-agent=${UA}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 80; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
  }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const navigations = [];
  const apiCalls = [];
  cdp.on((m) => {
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navigations.push(m.params.frame.url);
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (/yuanrenxue\.cn\/(api|a)\//.test(u)) apiCalls.push(`${m.params.request.method} ${u}`);
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'MacIntel' });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY_SCRIPT });
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });

  log(`[*] 打开 ${PAGE_URL}`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception && r.exceptionDetails.exception.description };
    return { value: r.result.value };
  };

  log('\n[*] 导航历史:', JSON.stringify(navigations));
  log('[*] 接口请求:', JSON.stringify(apiCalls, null, 0));

  const probe = await evalIn(`JSON.stringify({
    url: location.href,
    calls: (function(){ try { return JSON.parse(sessionStorage.getItem('__calls')||'[]'); } catch(e){ return window.__calls||[]; } })(),
    secretkeyType: typeof window.secretkey,
    SecretKeyType: typeof window.SecretKey,
    SecretKeyValue: (function(){ try { return typeof window.SecretKey === 'string' ? window.SecretKey : JSON.stringify(window.SecretKey); } catch(e){ return 'err'; } })(),
    secretKeys: Object.getOwnPropertyNames(window).filter(function(k){ return /secret/i.test(k); })
  })`);
  if (probe.error) { log('[-] 探针异常:', probe.error); }
  else {
    const info = JSON.parse(probe.value);
    log('[*] 当前 URL:', info.url);
    log('[*] 含 secret 的全局:', JSON.stringify(info.secretKeys), '| secretkey:', info.secretkeyType, '| SecretKey:', info.SecretKeyType);
    log('[*] console 记录:', info.calls.length, '条');
    for (const c of [...new Set(info.calls)]) log('    ', c.slice(0, 300));
    if (info.SecretKeyValue) log('[*] SecretKey 值:', String(info.SecretKeyValue).slice(0, 300));
  }

  // 如果有 secretkey 函数，尝试直接调用
  const tryCall = await evalIn(`(function(){
    if (typeof window.secretkey !== 'function') return 'no-secretkey-fn';
    var out = [];
    var cands = ['', 'yuanrenxue'];
    try { cands = cands.concat(JSON.parse(sessionStorage.getItem('__calls')||'[]')); } catch(e){}
    var suffix = '3f73bd8671faaa92';
    var res = [];
    for (var i=0;i<cands.length && i<25;i++){
      try { res.push(String(cands[i]).slice(0,60) + ' => ' + JSON.stringify(window.secretkey(cands[i] + suffix))); }
      catch(e){ res.push(String(cands[i]).slice(0,60) + ' => ERR ' + e.message); }
    }
    return JSON.stringify(res);
  })()`);
  if (tryCall.error) log('[-] secretkey 调用异常:', tryCall.error);
  else log('\n[*] secretkey 尝试:', tryCall.value);

  ws.close();
  chrome.kill();
  await sleep(200);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
