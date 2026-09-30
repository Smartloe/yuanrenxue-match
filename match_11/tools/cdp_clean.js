/**
 * 零注入的干净 Chrome 测试：不注入任何脚本、不包装 console，
 * 只用 CDP 原生能力（Runtime.consoleAPICalled）读取页面输出，
 * 并用 Fetch 域拦截"跳转回首页"，避免页面在检测失败时跑掉。
 *
 * 目的：判断在真实 Chrome 里 VM 是否会走正常分支（注入真的 window.secretkey）。
 *
 * 用法：node tools/cdp_clean.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9340;
const WAIT_MS = Number(process.argv[2] || 14000);
const SUFFIX = '3f73bd8671faaa92';
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

const argToStr = (a) => (!a ? 'undefined' : (a.type === 'string' ? a.value : ('value' in a ? JSON.stringify(a.value) : (a.description || a.type))));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11c-'));
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

  const consoleMsgs = [];
  const navs = [];
  let blocked = 0;
  cdp.on(async (m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = `[console.${m.params.type}] ` + m.params.args.map(argToStr).join(' ');
      consoleMsgs.push(line);
      log('  <', line.slice(0, 300));
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) { navs.push(m.params.frame.url); log('  [nav]', m.params.frame.url); }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      const isDoc = m.params.resourceType === 'Document';
      if (isDoc && request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        blocked++;
        log('  [拦截跳转]', request.url);
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else {
        try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
      }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'MacIntel' });
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  log(`[*] 打开 ${PAGE_URL}（零注入，跳转会被拦截）`);
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  const probe = await evalIn(`JSON.stringify({
    url: location.href,
    webdriver: navigator.webdriver,
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    trap: /Developer tools detected|多重跳转/.test(document.body.innerHTML),
    logNative: (function(){ try { return /native code/.test(Function.prototype.toString.call(console.log)); } catch(e){ return 'err:'+e.message; } })(),
    keys: Object.getOwnPropertyNames(window).filter(function(k){ return /secret/i.test(k); })
  })`);
  log('\n[page]', probe.error || probe.value);
  log('[拦截跳转次数]', blocked, '| 导航历史', JSON.stringify(navs));
  log('[控制台消息]', consoleMsgs.length, '条，去重', new Set(consoleMsgs).size, '条');

  // 找 RandomString，并尝试调用 secretkey
  const randoms = [...new Set(consoleMsgs.map((l) => (l.match(/RandomString:\s*(\S+)/) || [])[1]).filter(Boolean))];
  log('[RandomString 候选]', JSON.stringify(randoms));
  const attempt = await evalIn(`(function(){
    var rs = ${JSON.stringify(randoms)};
    var out = [];
    var fn = (typeof window.secretkey === 'function') ? window.secretkey : null;
    out.push('secretkey 是函数: ' + !!fn);
    if (!fn) return JSON.stringify(out);
    for (var i = 0; i < rs.length; i++) {
      try { out.push(rs[i] + ' => ' + String(fn(rs[i] + ${JSON.stringify(SUFFIX)})).slice(0, 200)); }
      catch (e) { out.push(rs[i] + ' => ERR ' + e.message); }
    }
    return JSON.stringify(out);
  })()`);
  log('\n[调用 secretkey]', attempt.error || attempt.value);

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
