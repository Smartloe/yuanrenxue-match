/**
 * 对比实验：一次拦截 JSVMP 脚本（基线），一次正常加载，
 * diff 出盾在 window 上新增的属性 —— 看"检测通过"时到底暴露了什么。
 *
 * 用法：node tools/cdp_diff_globals.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9370;
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
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

async function runOnce(blockJs, pageUrl = PAGE_URL) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11diff-'));
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

  cdp.on(async (m) => {
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (blockJs && request.url.includes('yrx_check_devtools_jsvmp')) {
        try { await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/javascript' }], body: Buffer.from('/* blocked */').toString('base64') }); } catch { /* ignore */ }
        return;
      }
      const nav = request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11');
      if (nav) { try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ } return; }
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: pageUrl });
  await sleep(15000);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) return null;
    return r.result.value;
  };
  const props = await ev('JSON.stringify(Object.getOwnPropertyNames(window))');
  const ua = await ev('navigator.userAgent');
  ws.close(); chrome.kill(); await sleep(400);
  return { props: JSON.parse(props), ua, port: PORT };
}

(async () => {
  log('[*] 第一轮：拦截 JSVMP（基线）');
  const base = await runOnce(true);
  log('    基线属性数:', base.props.length);

  log('[*] 第二轮：正常加载');
  const full = await runOnce(false);
  log('    正常属性数:', full.props.length);

  const bset = new Set(base.props);
  const added = full.props.filter((k) => !bset.has(k));
  log('\n[盾新增的全局属性]', JSON.stringify(added, null, 1));

  // 对每个新增属性看类型/值
  log('\n[新增属性详情]');
  for (const k of added) {
    log(`  ${k}`);
  }
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'globals_diff.json'), JSON.stringify({ base: base.props, full: full.props, added }, null, 2));
  log('\n已写入 docs/globals_diff.json');
})().catch((e) => { log('[-]', e.message); process.exit(1); });
