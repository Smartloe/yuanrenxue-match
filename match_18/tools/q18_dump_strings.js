/**
 * Q18：把 JSVMP 运行时物化出来的字符串全部抓下来（钩 decodeURIComponent / atob / btoa），
 * 然后用"单字节异或暴力"把混淆字符串还原成可读文本，寻找：
 *   - 参数名（page / t / v / 18data）
 *   - 可能的 AES/HMAC 密钥
 *   - 明文格式线索
 *
 * 用法：node tools/q18_dump_strings.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9532);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EARLY = `(function(){
  var rec = [];
  window.__strs = rec;
  var hex = function(s){ var o=''; for (var i=0;i<s.length;i++){ var h=s.charCodeAt(i).toString(16); o += (h.length<2?'0':'')+h; } return o; };
  var push = function(tag, s){
    try {
      if (typeof s !== 'string' || s.length < 3 || s.length > 200) return;
      if (rec.length > 20000) return;
      rec.push(tag + '|' + hex(s));
    } catch(e){}
  };
  var d = decodeURIComponent;
  decodeURIComponent = function(s){ var r = d.apply(window, arguments); push('d', r); return r; };
  var b = atob;
  atob = function(s){ var r = b.apply(window, arguments); push('a', r); return r; };
  var bc = btoa;
  btoa = function(s){ push('b', String(s)); return bc.apply(window, arguments); };
  var e = encodeURIComponent;
  encodeURIComponent = function(s){ push('e', String(s)); return e.apply(window, arguments); };
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx18ds-'));
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
    // 真实点击第 2 页，触发签名路径
    const box = JSON.parse(await ev(`(function(){var el=document.querySelector('#pgxPages .pgx-page[data-page="2"]');var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(5000);

    const raw = JSON.parse(await ev('JSON.stringify(window.__strs||[])') || '[]');
    log('捕获条目:', raw.length);
    const items = raw.map((x) => { const [tag, hex] = x.split('|'); return { tag, buf: Buffer.from(hex, 'hex') }; });

    // 单字节异或暴力：找可读结果
    const readable = new Map();
    const score = (s) => { let n = 0; for (const ch of s) { const c = ch.charCodeAt(0); if ((c >= 32 && c < 127)) n++; } return n / s.length; };
    for (const it of items) {
      for (let k = 1; k < 256; k++) {
        const out = Buffer.from(it.buf.map((b) => b ^ k));
        const s = out.toString('latin1');
        if (!/^[\x20-\x7e]+$/.test(s)) continue;
        if (!/[a-zA-Z]{3}/.test(s)) continue;
        if (score(s) < 0.99) continue;
        if (!readable.has(s)) readable.set(s, { key: k, tag: it.tag, len: s.length });
      }
    }
    const list = [...readable.entries()].map(([s, meta]) => ({ s, ...meta }));
    log('异或后可读字符串数:', list.length);
    const interesting = list.filter((x) => /page|18data|token|key|aes|hmac|sha|time|user|agent|hash|sign|secret|encrypt|mode|pad|yuan|^v$|^t$/i.test(x.s));
    log('\n=== 关键字相关 ===');
    interesting.slice(0, 80).forEach((x) => log(`  [xor 0x${x.key.toString(16).padStart(2, '0')}] ${JSON.stringify(x.s)}`));
    log('\n=== 长度 8-64 的可读串（可能是密钥/盐） ===');
    list.filter((x) => x.len >= 8 && x.len <= 64).slice(0, 60).forEach((x) => log(`  [xor 0x${x.key.toString(16).padStart(2, '0')}] len=${x.len} ${JSON.stringify(x.s)}`));
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'q18_strings.json'), JSON.stringify({ total: raw.length, readable: list }, null, 2));
    log('\n已写 docs/q18_strings.json');
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
