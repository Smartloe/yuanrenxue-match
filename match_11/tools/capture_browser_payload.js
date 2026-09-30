/**
 * 抓取"浏览器里实际解码出的内层载荷"：
 * 把外层文件改写成 `window.__DECODED__ = (<原解码表达式>);`（不 eval），
 * 页面加载后用 Runtime 读出来与 Node 版对比，找出差异。
 *
 * 用法：node tools/capture_browser_payload.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9414;
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const VM_URL_PART = 'yrx_check_devtools_jsvmp';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const raw = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');
const head = 'var yxr = eval(';
const origArg = raw.slice(head.length, raw.lastIndexOf(');'));
const patchedOuter = 'window.__DECODED__ = (' + origArg + ');\n;window.__captureDone=true;\n';
log('[*] 抓取版外层文件已生成，长度', patchedOuter.length);

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11cap-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1440,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);
  cdp.on(async (m) => {
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.includes(VM_URL_PART)) {
        try {
          await cdp.send('Fetch.fulfillRequest', {
            requestId, responseCode: 200,
            responseHeaders: [{ name: 'content-type', value: 'application/javascript; charset=utf-8' }],
            body: Buffer.from(patchedOuter, 'utf8').toString('base64'),
          });
        } catch { /* ignore */ }
        return;
      }
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
        return;
      }
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(8000);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  log('[*] captureDone:', JSON.stringify(await ev('String(window.__captureDone)')));
  const meta = await ev(`(function(){
    var v = window.__DECODED__;
    return JSON.stringify({ type: typeof v, len: v ? v.length : -1, head: v ? String(v).slice(0, 80) : null });
  })()`);
  log('[*] 浏览器载荷信息:', meta.error || meta.value);

  // 分块取出，避免一次性传输过大
  const lenR = await ev('window.__DECODED__ ? window.__DECODED__.length : 0');
  const len = lenR.value || 0;
  if (len > 0) {
    let out = '';
    const CHUNK = 60000;
    for (let off = 0; off < len; off += CHUNK) {
      const part = await ev(`window.__DECODED__.substr(${off}, ${CHUNK})`);
      if (part.error) { log('[-] 分块读取失败:', part.error); break; }
      out += part.value;
    }
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'browser_payload.js'), out);
    const nodePayload = fs.readFileSync(path.join(__dirname, '..', 'docs', 'eval_payload_2.js'), 'utf8');
    const h = (s) => crypto.createHash('md5').update(s).digest('hex');
    log(`[*] 浏览器载荷 ${out.length} 字节 md5=${h(out).slice(0, 12)}`);
    log(`[*] Node  载荷 ${nodePayload.length} 字节 md5=${h(nodePayload).slice(0, 12)}`);
    log(`[*] 是否一致: ${out === nodePayload}`);
    if (out !== nodePayload) {
      let i = 0;
      while (i < Math.min(out.length, nodePayload.length) && out[i] === nodePayload[i]) i++;
      log(`[*] 首个差异位置: ${i}`);
      log('    浏览器:', JSON.stringify(out.slice(Math.max(0, i - 40), i + 60)));
      log('    Node  :', JSON.stringify(nodePayload.slice(Math.max(0, i - 40), i + 60)));
    }
    log('[*] 已写入 docs/browser_payload.js');
  }

  ws.close(); ch.kill(); await sleep(300);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
