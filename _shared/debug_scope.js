/**
 * 新手试炼 guide3/guide4：用 CDP Debugger 域自动化"断点调试"
 *   - guide3：等 tick 走满后，在断点栈帧上执行 get_question_3_result("yrx_No.1")
 *   - guide4：在暂停的调用栈各栈帧里查变量 tempered_mark
 *
 * 用法：node tools/debug_scope.js guide3
 *       node tools/debug_scope.js guide4
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://match.yuanrenxue.cn';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv[2] || 'guide3';
const PORT = Number(process.env.CDP_PORT || (9760 + (which === 'guide4' ? 1 : 0)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'match_23/config/session.json'), 'utf8'));

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
    const url = `${HOST}/match/${which}`;

    if (which === 'guide4') {
      // 停在 debugger 后遍历调用栈查变量
      let pausedFrames = null;
      cdp.on((m) => { if (m.method === 'Debugger.paused') pausedFrames = m.params.callFrames; });
      // stepOver 之后会再次触发 Debugger.paused，上面的回调会刷新 pausedFrames
      await cdp.send('Page.enable');
      await cdp.send('Network.enable');
      await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
      await cdp.send('Debugger.enable');
      await cdp.send('Page.navigate', { url });
      for (let i = 0; i < 30 && !pausedFrames; i++) await sleep(500);
      if (!pausedFrames) { console.log('[-] 没等到 debugger 暂停'); return; }
      console.log('[*] 调用栈层数:', pausedFrames.length);
      const scan = async (tag) => {
        for (const [i, fr] of pausedFrames.entries()) {
          const r = await cdp.send('Debugger.evaluateOnCallFrame', {
            callFrameId: fr.callFrameId,
            expression: '(function(){try{return typeof tempered_mark !== "undefined" ? String(tempered_mark) : null}catch(e){return null}})()',
            returnByValue: true, silent: true,
          });
          const val = r.result && r.result.value;
          if (val) {
            console.log(`  ★ ${tag}：帧#${i} ${fr.functionName || '(anonymous)'} → tempered_mark = ${JSON.stringify(val)}`);
            fs.writeFileSync(path.join(ROOT, `match_${which}/answer.json`), JSON.stringify({ tempered_mark: val, frame: i, functionName: fr.functionName }, null, 2));
            return val;
          }
        }
        return null;
      };
      let found = await scan('暂停时');
      // 题目机制：变量要在单步若干次后才出现在作用域里
      for (let step = 1; step <= 60 && !found; step++) {
        try { await cdp.send('Debugger.stepOver'); } catch { break; }
        await sleep(150);
        if (!pausedFrames) break;
        found = await scan('第' + step + '步');
      }
      if (!found) console.log('[-] 单步 60 次仍未找到 tempered_mark');
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }

    // guide3：先在断点处单步，等 get_question_3_result 变成函数后调用
    let paused = null;
    cdp.on((m) => { if (m.method === 'Debugger.paused') paused = m.params; });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Debugger.enable');
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 30 && !paused; i++) await sleep(500);
    if (!paused) { console.log('[-] 没等到 debugger 暂停'); return; }
    const frameId = paused.callFrames[0].callFrameId;
    console.log('[*] 已暂停于', paused.callFrames[0].functionName || '(anonymous)');
    for (let step = 0; step < 40; step++) {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: frameId,
        expression: 'typeof get_question_3_result',
        returnByValue: true, silent: true,
      });
      const t = r.result && r.result.value;
      if (t === 'function') {
        const ans = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: frameId,
          expression: 'get_question_3_result("yrx_No.1")',
          returnByValue: true, silent: true,
        });
        const val = ans.result && ans.result.value;
        console.log('[*] 单步', step, '次后 get_question_3_result 是函数，返回值 =', JSON.stringify(val));
        fs.writeFileSync(path.join(ROOT, `match_${which}/answer.json`), JSON.stringify({ answer: val }, null, 2));
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
      await cdp.send('Debugger.stepOver');
      await sleep(120);
    }
    console.log('[-] 单步 40 次仍未拿到函数');
    await cdp.send('Debugger.resume').catch(() => {});
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(200);
  }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
