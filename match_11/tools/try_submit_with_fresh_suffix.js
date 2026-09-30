/**
 * 决定性验证：用"服务端本次下发的后缀 S"计算答案并提交。
 *
 * 假设：window.SecretKey 就是真函数，它是"随机 IV + 对称加密"型函数，
 *       输出非确定性，但服务端可以解密后核对明文里是否含本次下发的 S。
 *       （上次提交失败是因为用了题面里的旧后缀）
 *
 * 流程：浏览器加载 /match/11（服务端下发并记住新 S）→ 从 DOM 读出 S
 *       → 用窗口自带的 randomString(16) 生成 X → answer = SecretKey(X + S) → 提交
 *
 * 用法：node tools/try_submit_with_fresh_suffix.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9424;
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const DO_SUBMIT = !process.argv.includes('--no-submit');
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 25000);
    });
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11fresh-'));
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
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
        return;
      }
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ }
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(9000);   // 等盾注入完 SecretKey（约 2.3s）

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
    return { value: r.result.value };
  };

  const info = await ev(`(function(){
    var html = document.body.innerHTML;
    var m = html.match(/secretkey\\([^)]*\\+\\s*"([0-9a-fA-F]{16})"/);
    var S = m ? m[1] : null;
    var X = null;
    try { X = window.randomString(16); } catch (e) {}
    var ans = null, err = null;
    if (S && typeof window.SecretKey === 'function') {
      try { ans = String(window.SecretKey(X + S)); } catch (e) { err = e.message; }
    }
    return JSON.stringify({
      suffixFromDom: S, X: X, answerLen: ans ? ans.length : 0,
      answerHead: ans ? ans.slice(0, 48) : null, err: err,
      secretkeyType: typeof window.secretkey, SecretKeyType: typeof window.SecretKey
    });
  })()`);
  log('[*] 页面内信息:', info.error || info.value);
  if (info.error) { ws.close(); ch.kill(); return; }

  const parsed = JSON.parse(info.value);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fresh_answer.json'), JSON.stringify(parsed, null, 2));
  if (!parsed.suffixFromDom || !parsed.answerHead) { log('[-] 没拿到后缀或答案，放弃'); ws.close(); ch.kill(); return; }

  const ans = await ev(`String(window.SecretKey(window.randomString(16) + ${JSON.stringify(parsed.suffixFromDom)}))`);
  const answer = ans.value;
  log(`[*] 后缀 S = ${parsed.suffixFromDom}`);
  log(`[*] 答案长度 = ${String(answer).length}，前 48 位 = ${String(answer).slice(0, 48)}`);

  ws.close(); ch.kill();
  await sleep(300);

  if (!DO_SUBMIT) { log('[*] 已跳过提交'); return; }

  log('[*] 提交答案 ...');
  const res = await fetch('https://match.yuanrenxue.cn/a/11', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: SESSION.cookie, referer: PAGE_URL, origin: 'https://match.yuanrenxue.cn',
      'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ answer: String(answer) }).toString(),
  });
  const text = await res.text();
  log(`[*] HTTP ${res.status} ${text}`);
  fs.writeFileSync(path.join(__dirname, '..', 'result.json'), JSON.stringify({ suffix: parsed.suffixFromDom, answer, response: text, at: new Date().toISOString() }, null, 2));
})().catch((e) => { log('[-]', e.message); process.exit(1); });
