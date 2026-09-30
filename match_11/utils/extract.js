/**
 * 猿人学第11题 —— 取值模块（可用版）
 *
 * 题目机制（已完全逆向）：
 *   1. 服务端每次请求 /match/11 都会生成一个一次性后缀 S（16 位 hex），写进题面文本，并记住它；
 *   2. 页面里的 JSVMP（WlzShield 控制台检测盾）在初始化时：
 *        - 从题面读出 S，
 *        - 生成并【打印】一个随机串 X（"RandomString: X"），
 *        - 把真正的签名函数挂到 window.SecretKey 上（它的输出带随机性，但服务端能验证）；
 *      ⚠️ 盾会立刻 console.clear()，且会把题面里的后缀从 DOM 抹掉 —— 所以必须在页面脚本之前
 *         劫持 iframe 的 console（既拿到打印，又让 clear 失效）。
 *   3. 答案 = window.SecretKey(X + S)，要求 X、S 来自【同一次页面加载】。
 *
 * 本模块用 CDP 驱动 Chrome 完成上述取值；不依赖任何 npm 依赖。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9436);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 25000);
    });
  }
}

/** 页面脚本执行前注入：劫持 iframe 的 console（记录打印 + 让 clear 失效） */
const EARLY_HOOK = `(function(){
  try{
    var rec = [];
    window.__prints = rec;
    var patch = function(w){
      try{
        if (!w || w.__printPatched) return w;
        w.__printPatched = true;
        var c = w.console;
        if (!c) return w;
        ['log','info','warn','error','debug','dir','table','clear','trace','group','groupEnd','groupCollapsed','assert','count','time','timeEnd']
          .forEach(function(n){
            var orig = c[n];
            if (typeof orig !== 'function') return;
            c[n] = function(){
              var a = [].slice.call(arguments).map(function(x){ return typeof x === 'string' ? x : String(x); });
              rec.push(n + ': ' + a.join(' '));
              if (n === 'clear') return undefined;      // 让盾的清屏失效
              try { return orig.apply(c, arguments); } catch(e){}
            };
          });
      }catch(e){}
      return w;
    };
    var proto = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
    if (proto) {
      var d = Object.getOwnPropertyDescriptor(proto, 'contentWindow');
      if (d && d.get) Object.defineProperty(proto, 'contentWindow', {
        configurable: true,
        get: function(){ return patch(d.get.call(this)); }
      });
    }
    try { console.clear = function(){}; } catch(e){}
  }catch(e){ window.__hookErr = String(e.message); }
})();`;

/**
 * 打开题目页并取出 (S, X, answer)
 * @returns {Promise<{suffix:string, printedX:string, answer:string}>}
 */
async function extractAnswer({ session, timeoutMs = 20000, log = () => {} } = {}) {
  const sess = session || JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) {
      try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); }
    }
    if (!ver) throw new Error('Chrome DevTools 端口未就绪');

    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    const cdp = new CDP(ws);

    let docRequestId = null;
    cdp.on(async (m) => {
      if (m.method === 'Network.responseReceived' && m.params.type === 'Document'
        && m.params.response.url.includes('/match/11')) docRequestId = m.params.requestId;
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
    await cdp.send('Network.setCookie', { name: 'sessionid', value: sess.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY_HOOK });
    await cdp.send('Page.navigate', { url: PAGE_URL });

    const evalIn = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { error: (r.exceptionDetails.exception || {}).description };
      return { value: r.result.value };
    };

    const deadline = Date.now() + timeoutMs;
    let S = null;
    let X = null;
    while (Date.now() < deadline) {
      await sleep(1000);
      if (!S && docRequestId) {
        try {
          const body = await cdp.send('Network.getResponseBody', { requestId: docRequestId });
          const m = body.body.match(/\+ "([0-9a-f]{16})"/);       // 题面里的后缀
          if (m) { S = m[1]; log(`[*] 服务端下发后缀 S = ${S}`); }
        } catch { /* 响应体可能已释放 */ }
      }
      const p = await evalIn(`(function(){
        var q = (window.__prints || []).filter(function(s){ return /RandomString/.test(s); });
        return JSON.stringify({
          x: q.length ? String(q[0]).replace(/.*RandomString:\\s*/, '').trim() : null,
          hasFn: typeof window.SecretKey === 'function'
        });
      })()`);
      if (p.error) continue;
      const info = JSON.parse(p.value);
      if (info.x && !X) { X = info.x; log(`[*] 盾打印的随机串 X = ${X}`); }
      if (S && X && info.hasFn) break;
    }
    if (!S) throw new Error('没拿到服务端后缀 S');
    if (!X) throw new Error('没拿到盾打印的随机串 X');

    const ans = await evalIn(`(function(){
      try { return String(window.SecretKey(${JSON.stringify(X)} + ${JSON.stringify(S)})); }
      catch(e){ return 'ERR ' + e.message; }
    })()`);
    if (ans.error || String(ans.value).startsWith('ERR')) throw new Error('计算答案失败: ' + (ans.error || ans.value));
    ws.close();
    return { suffix: S, printedX: X, answer: ans.value, page: PAGE_URL };
  } finally {
    chrome.kill();
    await sleep(200);
  }
}

module.exports = { extractAnswer, PAGE_URL };

if (require.main === module) {
  extractAnswer({ timeoutMs: Number(process.argv[2] || 20000), log: (m) => process.stdout.write(m + '\n') })
    .then((r) => process.stdout.write('结果: ' + JSON.stringify({ suffix: r.suffix, printedX: r.printedX, answerLen: r.answer.length }) + '\n'))
    .catch((e) => { process.stderr.write('[-] ' + e.message + '\n'); process.exit(1); });
}
