/**
 * 新手试炼 guide2 / guide5 的运行时取值：
 *   guide2：抓 POST /api/user 请求参数里的 sign
 *   guide5：给 /api/guide5 设 XHR 断点，暂停后在作用域里找 yrx_xhr_* 变量
 *
 * 用法：node _shared/guide_capture.js guide2
 *       node _shared/guide_capture.js guide5
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://match.yuanrenxue.cn';
const which = process.argv[2] || 'guide2';
const PORT = Number(process.env.CDP_PORT || (9780 + (which === 'guide5' ? 1 : 0)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'match_23/config/session.json'), 'utf8'));
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

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `yrx-${which}-`));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1400,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let ws;
  try {
    for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);

    const userReqs = [];
    let paused = null;
    cdp.on((m) => {
      if (m.method === 'Network.requestWillBeSent' && /\/api\/user/.test(m.params.request.url)) {
        userReqs.push({ method: m.params.request.method, url: m.params.request.url, postData: m.params.request.postData || '' });
      }
      if (m.method === 'Debugger.paused') paused = m.params;
    });

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Debugger.enable');           // 让页面认为 DevTools 已打开

    if (which === 'guide5') {
      await cdp.send('DOMDebugger.setXHRBreakpoint', { url: 'api/guide5' });
    }
    await cdp.send('Page.navigate', { url: `${HOST}/match/${which}` });
    await sleep(9000);

    if (which === 'guide2') {
      console.log('[*] 捕获到的 /api/user 请求:');
      userReqs.forEach((r) => console.log(`   ${r.method} ${r.url}  ${r.postData ? 'body=' + r.postData.slice(0, 300) : ''}`));
      const post = userReqs.find((r) => r.method === 'POST' && r.postData);
      if (post) {
        const params = new URLSearchParams(post.postData);
        const sign = params.get('sign');
        console.log('\n[*] POST body 参数:', [...params.keys()].join(', '));
        console.log('[*] sign =', sign);
        if (sign) fs.writeFileSync(path.join(ROOT, `match_${which}/answer.json`), JSON.stringify({ sign, raw: post.postData }, null, 2));
      } else {
        console.log('[-] 没抓到带 body 的 POST /api/user');
      }
      return;
    }

    // guide5：等 XHR 断点命中并扫描作用域
    for (let i = 0; i < 30 && !paused; i++) await sleep(500);
    if (!paused) { console.log('[-] /api/guide5 的 XHR 断点没命中'); return; }
    console.log('[*] 断点命中，调用栈层数:', paused.callFrames.length);
    const hit = [];
    for (const [i, fr] of paused.callFrames.entries()) {
      for (const sc of fr.scopeChain) {
        if (!sc.object || !sc.object.objectId) continue;
        try {
          const props = await cdp.send('Runtime.getProperties', { objectId: sc.object.objectId, ownProperties: true });
          for (const p of (props.result || [])) {
            const v = p.value ? (p.value.value !== undefined ? p.value.value : p.value.description) : '?';
            const nameHit = /yrx_xhr/i.test(p.name);
            // 只认"像答案"的短字符串值，排除 function 源码之类的噪音
            const valHit = typeof v === 'string' && /^yrx_[A-Za-z0-9_]{2,60}$/.test(v);
            if (nameHit || valHit) hit.push({ frame: i, fn: fr.functionName, scope: sc.type, name: p.name, value: String(v).slice(0, 200) });
          }
        } catch { /* ignore */ }
      }
    }
    hit.forEach((h) => console.log('  ★', JSON.stringify(h)));
    if (hit.length) fs.writeFileSync(path.join(ROOT, `match_${which}/answer.json`), JSON.stringify(hit, null, 2));
    await cdp.send('Debugger.resume').catch(() => {});
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
