/**
 * Q18 关键实验：钩住 String.fromCharCode（含 .apply），在"真实点击第2页"的窗口内
 * 按顺序抓下所有由字符码拼出的字符串（尤其是 16/32 字节的二进制串，很可能就是 AES 的 key/IV）。
 *
 * 用法：node tools/q18_hook_charcodes.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9522);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EARLY = `(function(){
  var rec = [];
  window.__cc = rec;
  var hex = function(s){ var o=''; for (var i=0;i<s.length;i++){ var h=s.charCodeAt(i).toString(16); o += (h.length<2?'0':'')+h; } return o; };
  var push = function(tag, s){
    try { if (typeof s === 'string' && s.length >= 4 && s.length <= 96) rec.push({ tag: tag, len: s.length, hex: hex(s), ascii: /^[\x20-\x7e]*$/.test(s) ? s : null }); } catch(e){}
  };
  var d = decodeURIComponent;
  decodeURIComponent = function(s){ var r = d.apply(window, arguments); push('decode', r); return r; };
  var b = atob;
  atob = function(s){ var r = b.apply(window, arguments); push('atob', r); return r; };
  var u = unescape;
  if (typeof u === 'function') unescape = function(s){ var r = u.apply(window, arguments); push('unescape', r); return r; };
  var e = encodeURIComponent;
  encodeURIComponent = function(s){ var r = e.apply(window, arguments); push('encode', String(s)); return r; };
  var bc = btoa;
  btoa = function(s){ push('btoa', String(s)); return bc.apply(window, arguments); };
})();`;

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18cc-'));
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
    const urls = [];
    cdp.on((m) => { if (m.method === 'Network.requestWillBeSent' && /18data/.test(m.params.request.url)) urls.push(m.params.request.url); });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
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
    await sleep(6000);

    const rec = JSON.parse(await ev('JSON.stringify(window.__cc||[])') || '[]');
    log('签名窗口内字符串物化调用数:', rec.length);
    log('按 tag 统计:', JSON.stringify(rec.reduce((m, r) => (m[r.tag] = (m[r.tag] || 0) + 1, m), {})));
    log('\n长度 8-64 的条目（可能有 key/IV/明文）:');
    rec.filter((r) => r.len >= 8 && r.len <= 64).slice(0, 60).forEach((r) => log(`   [${r.tag}] len=${r.len} ${r.ascii ? JSON.stringify(r.ascii) : 'hex=' + r.hex}`));
    log('\n长度 16 的条目（AES 密钥长度）:');
    const l16 = rec.filter((r) => r.len === 16);
    log('   共', l16.length, '条');
    [...new Set(l16.map((r) => r.ascii || 'hex:' + r.hex))].slice(0, 30).forEach((x) => log('   ', x));
    log('\n长度 32 的条目:');
    const l32 = rec.filter((r) => r.len === 32);
    log('   共', l32.length, '条');
    [...new Set(l32.map((r) => r.ascii || 'hex:' + r.hex))].slice(0, 20).forEach((x) => log('   ', x));
    log('\n长度 12-24 的全部去重条目:');
    [...new Set(rec.filter((r) => r.len >= 12 && r.len <= 24).map((r) => (r.ascii ? 'A:' + r.ascii : 'H:' + r.hex)))].slice(0, 60).forEach((x) => log('   ', x));
    log('\n本次 18data 请求:', urls.map((u) => u.slice(u.indexOf('?'))).join(' | '));
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
