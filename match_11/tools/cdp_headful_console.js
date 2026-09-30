/**
 * 第11题需要在"控制台真的打开"的环境下才能拿到 secretkey。
 * 这里启动有头 Chrome（--auto-open-devtools-for-tabs，DevTools 默认停靠 → 触发"已打开"判定），
 * 通过 CDP 捕获 Runtime.consoleAPICalled / Log.entryAdded，拿到 VM 偷偷打印的内容。
 *
 * 用法：node tools/cdp_headful_console.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9337;
const WAIT_MS = Number(process.argv[2] || 15000);
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

const argToString = (a) => {
  if (!a) return 'undefined';
  if (a.type === 'string') return a.value;
  if ('value' in a) return JSON.stringify(a.value);
  return a.description || a.type;
};

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11h-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check',
    '--auto-open-devtools-for-tabs',
    '--window-size=1440,900', '--window-position=40,40',
    '--remote-allow-origins=*',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 100; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
  }
  if (!version) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const consoleMsgs = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const line = `[console.${m.params.type}] ` + m.params.args.map(argToString).join(' ');
      consoleMsgs.push(line);
      log('  <', line.slice(0, 400));
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.source !== 'deprecation') { consoleMsgs.push(`[log.${e.level}] ${e.text}`); log('  <', `[log.${e.level}] ${e.text}`.slice(0, 400)); }
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) log('  [nav]', m.params.frame.url);
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });

  log(`[*] 打开 ${PAGE_URL}（有头 + 自动开 DevTools）`);
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
    keys: Object.getOwnPropertyNames(window).filter(function(k){ return /secret/i.test(k); }),
    SecretKeyVal: (function(){ try { return typeof window.SecretKey; } catch(e){ return 'err'; } })()
  })`);
  log('\n[page]', probe.error || probe.value);

  const outerInner = await evalIn(`JSON.stringify([window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight])`);
  log('[尺寸 inner/outer]', outerInner.value);

  log('\n[*] 控制台消息共', consoleMsgs.length, '条');

  const call = await evalIn(`(function(){
    if (typeof window.secretkey !== 'function') return 'no-secretkey-fn';
    var out = [];
    var suffix = ${JSON.stringify(SUFFIX)};
    var lines = ${JSON.stringify(consoleMsgs)};
    var cands = [''];
    for (var i=0;i<lines.length;i++){
      var m = lines[i].match(/[A-Za-z0-9_\\-]{4,120}/g);
      if (m) cands = cands.concat(m);
    }
    cands = cands.filter(function(v,idx){ return cands.indexOf(v) === idx; });
    for (var j=0;j<cands.length && j<30;j++){
      try { out.push(cands[j].slice(0,60) + ' => ' + JSON.stringify(window.secretkey(cands[j] + suffix))); }
      catch(e){ out.push(cands[j].slice(0,60) + ' => ERR ' + e.message); }
    }
    return JSON.stringify(out);
  })()`);
  log('\n[*] secretkey 尝试:', call.error || call.value);

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().catch((e) => { log('[-]', e.message); process.exit(1); });
