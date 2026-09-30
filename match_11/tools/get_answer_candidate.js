/**
 * 抓页面控制台真正打印的 "RandomString: X"，然后计算
 *   answer = window.SecretKey(X + "3f73bd8671faaa92")
 * 用法：node tools/get_answer_candidate.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9374;
const WAIT_MS = Number(process.argv[2] || 22000);
const SUFFIX = '3f73bd8671faaa92';
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

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11ans-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let v = null;
  for (let i = 0; i < 80; i++) { try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  if (!v) throw new Error('DevTools 端口未就绪');

  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);

  const printed = [];
  cdp.on(async (m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = m.params.args.map(argToStr).join(' ');
      if (/RandomString/i.test(line)) { printed.push(line); log('  <', line.slice(0, 120)); }
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(WAIT_MS);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  const randoms = [...new Set(printed.map((l) => (l.match(/RandomString:?\s*(\S+)/) || [])[1]).filter(Boolean))];
  log('[*] 控制台打印过的 RandomString:', JSON.stringify(randoms));

  const info = await ev(`JSON.stringify({
    secretkey: typeof window.secretkey,
    SecretKey: typeof window.SecretKey,
    liveRandom: (function(){ try { return new window.DevtoolsTrap().random_str; } catch(e){ return 'ERR'; } })(),
    genRandom: (function(){ try { return window.randomString(16); } catch(e){ return 'ERR'; } })()
  })`);
  log('[*] 页面状态:', info.error || info.value);

  const cands = randoms.length ? randoms : [JSON.parse(info.value).liveRandom];
  const out = await ev(`(function(){
    var fn = (typeof window.SecretKey === 'function') ? window.SecretKey : null;
    if (!fn) return 'no SecretKey';
    var res = [];
    ${JSON.stringify(cands)}.forEach(function(rs){
      try { res.push({ rs: rs, ans: String(fn(rs + ${JSON.stringify(SUFFIX)})) }); }
      catch(e){ res.push({ rs: rs, err: e.message }); }
    });
    return JSON.stringify(res);
  })()`);
  log('[*] 候选答案:', out.error || out.value);
  if (!out.error) {
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'answer_candidates.json'), out.value);
    log('[*] 已写入 docs/answer_candidates.json');
  }
  ws.close(); chrome.kill(); await sleep(300);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
