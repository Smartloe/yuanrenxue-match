/**
 * Q18：确认 myenc = AES-CBC(key, PKCS7) 后，搜索真实签名 v 对应的"明文"。
 * 抓一次真实 page=2 请求的 (t, v)，在页面里对大量候选明文调用 myenc 并比对。
 *
 * 用法：node tools/q18_find_plaintext.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9548);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
      else if (m.method) for (const h of this.handlers) h(m);
    });
  }
  on(f) { this.handlers.push(f); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 25000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18fp-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1500,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  let ws;
  try {
    for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);
    const reqs = [];
    cdp.on((m) => { if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) reqs.push(m.params.request.url); });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: 'https://match.yuanrenxue.cn/match/18' });
    await sleep(8000);

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return null;
      return r.result.value;
    };
    const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="2"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(5000);

    const signed = reqs.find((u) => /page=2&t=/.test(u));
    const mm = signed && signed.match(/[?&]t=([^&]+)&v=([^&]+)/);
    if (!mm) throw new Error('没拿到真实签名请求');
    const T = mm[1], V = decodeURIComponent(mm[2]);
    const UA = await ev('navigator.userAgent');
    const CK = await ev('document.cookie');
    log('t =', T);
    log('v =', V);
    log('UA =', UA);
    log('cookie =', String(CK).slice(0, 80));

    const page = '2';
    const path1 = '/api/v/question/18data?page=2';
    const path2 = '/api/v/question/18data?page=2&t=' + T;
    const path3 = 'https://match.yuanrenxue.cn/api/v/question/18data?page=2';
    const seps = ['', '&', '|', ',', '_', '-', ':', ';'];
    const cands = new Set();
    for (const s of seps) {
      cands.add(page + s + T);
      cands.add(T + s + page);
      cands.add('page=' + page + s + 't=' + T);
      cands.add('t=' + T + s + 'page=' + page);
      cands.add(page + s + T + s + UA);
      cands.add(UA + s + page + s + T);
      cands.add(page + s + T + s + 'yuanrenxue');
    }
    ['', '&', '?', ' ', '\n'].forEach((s) => {
      cands.add(path1 + s); cands.add(path2 + s); cands.add(path3 + s);
      cands.add(s + path1); cands.add(s + path2);
    });
    cands.add(JSON.stringify({ page: 2, t: Number(T) }));
    cands.add(JSON.stringify({ page: '2', t: T }));
    cands.add(JSON.stringify({ t: Number(T), page: 2 }));
    cands.add(`{"page":2,"t":"${T}"}`);
    cands.add(`{"t":"${T}","page":2}`);
    cands.add(T);
    cands.add(String(T / 1000));
    cands.add(String(Number(T) * 1000));
    cands.add(page);
    cands.add('18data' + page + T);
    cands.add(UA + T + page);

    const list = [...cands];
    log('\n候选明文数:', list.length);
    const res = await ev(`(function(){
      var cands = ${JSON.stringify(list)};
      var out = [];
      for (var i = 0; i < cands.length; i++) {
        try { out.push(String(window.myenc(cands[i]))); } catch(e) { out.push('EXC'); }
      }
      return JSON.stringify(out);
    })()`);
    const arr = JSON.parse(res);
    let hit = 0;
    list.forEach((c, i) => {
      if (arr[i] === V) { hit++; log('★ 命中! myenc(' + JSON.stringify(c) + ') === v'); }
    });
    log(hit ? '命中 ' + hit + ' 个' : '未命中（v 的明文格式不在这批候选里，或签名用的密钥与 myenc 不同）');
    log('\n前 8 个候选的结果示例:');
    list.slice(0, 8).forEach((c, i) => log('   myenc(' + JSON.stringify(c).slice(0, 60) + ') → ' + String(arr[i]).slice(0, 44)));
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
