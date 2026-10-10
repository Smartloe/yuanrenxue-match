/**
 * 猿人学第31题 —— 混元 · 对称迷局，另辟蹊径（WASM + AES-CBC 混淆）
 *
 * 机制（逆向结论，详见 README.md）：
 *   - /match/31/js/31.js 内含 base64 的 WASM（嵌入 aes_init/max_len/encrypt/decrypt/memory），
 *     用 AES-CBC 生成请求参数 token；WASM 内部再调用 36 个 js.K0..K19 / js.E0..E15 导入函数，
 *     算法被拆散在 JS 与 WASM 两侧，故不可脱离页面单独复算。
 *   - GET /api/question/31?page=P&pageSize=10&kw=&m=&token=<64字符base64>&now=<ms>
 *     * token 与「页码 + now」双向绑定：换页码或换 now 一律 403 token failed；
 *     * 因此每页必须由页面自身 JS 现算 token —— 本脚本用真实鼠标事件点击分页按钮触发。
 *   - 第 5 页服务端强校验 User-Agent：不是 yuanrenxue 时返回
 *     {"data":["请","将","UA","改","为","yuan","ren","xue","哦"]}，只有 UA=yuanrenxue 才给 10 个数字。
 *   - 数据按 sessionid 生成（未登录与登录后数字完全不同），答案 = 5 页 50 个数之和。
 *
 * 用法：
 *   node main.js              # 取数（写 docs/last_run.json）
 *   node main.js --submit     # 取数并提交（写 result.json）
 *   node main.js --headed     # 用有头浏览器（无头环境被风控时可加）
 *
 * 依赖：本机 Chrome for Testing（ms-playwright 缓存），无第三方 npm 依赖。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = 31;
const HOST = 'https://match.yuanrenxue.cn';
const UA_YRX = 'yuanrenxue';
// 无头 Chrome 默认 UA 含 "HeadlessChrome"，会被站点风控（token failed / 403），
// 必须在页面 JS 生成 token 之前把 UA 改成正常 Chrome 标识（JS 侧与请求头一致才有效）。
const UA_BROWSER = process.env.UA_BROWSER
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const DIR = __dirname;
const ROOT = path.resolve(DIR, '..');
const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
}

async function main() {
  const submit = process.argv.includes('--submit');
  const headed = process.argv.includes('--headed');
  const cfgPath = path.join(DIR, 'config/session.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const port = 9631;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx31-'));

  const args = [
    headed ? '--headless=old' : '--headless=new',
    `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1920,1080', 'about:blank',
  ];
  // 有头模式：去掉 headless 开关
  const spawnArgs = headed
    ? [args[1], args[2], ...args.slice(3), '--disable-blink-features=AutomationControlled', 'about:blank']
    : args;
  const chrome = spawn(CHROME, spawnArgs, { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) {
      try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(300); }
    }
    if (!ver) throw new Error('Chrome 未就绪');

    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    const cdp = new CDP(ws);

    const seen = [];   // /api/question/31 的响应状态
    cdp.on((m) => {
      if (m.method === 'Network.responseReceived' && String(m.params.response.url).includes('/api/question/31')) {
        seen.push({ url: m.params.response.url.slice(0, 130), status: m.params.response.status });
      }
    });

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    // 关键：先伪装成正常 Chrome UA（同时影响 navigator.userAgent 与请求头），再导航
    await cdp.send('Network.setUserAgentOverride', { userAgent: UA_BROWSER });
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: `${HOST}/match/${Q}` });

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.exceptionDetails ? null : r.result.value;
    };
    // 抓当前页 10 个六位数字（#pgxList 内 span.pgx-num）
    const scrape = async () => {
      const arr = await ev(`JSON.parse(JSON.stringify([...document.querySelectorAll('#pgxList .pgx-num')].map(function(e){return e.innerText.trim()})))`);
      return (Array.isArray(arr) ? arr : []).filter((t) => /^\d{6}$/.test(t)).map(Number).slice(0, 10);
    };
    const dbg = () => ev(`(document.getElementById('pgxDebug')||{}).innerText||''`);

    const clickReal = async (p) => {
      const box = await ev(`(function(){
        var el=document.querySelector('#pgxPages .pgx-page[data-page="${p}"]');
        if(!el) return null;
        try{ el.scrollIntoView({block:'center',inline:'center'}); }catch(e){ el.scrollIntoView(); }
        var r=el.getBoundingClientRect();
        return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});
      })()`);
      if (!box) return false;
      const { x, y } = JSON.parse(box);
      if (!(x > 0 && y > 0)) return false;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    };

    // 等首页（该题混淆极重，给足 90s）
    let first = [];
    for (let i = 0; i < 90; i++) { await sleep(1000); first = await scrape(); if (first.length >= 10) break; }
    if (first.length < 10) {
      const d = await dbg();
      log('[!] 首页未取到数字。诊断：');
      log('    #pgxList 文本 = ' + JSON.stringify(await ev(`(document.querySelector('#pgxList')||{}).innerText||''`)));
      log('    pgxDebug = ' + JSON.stringify(d));
      log('    接口响应 = ' + JSON.stringify(seen.slice(-5), null, 2));
      log('    提示：可加 --headed 再用有头浏览器重试');
    }
    const pages = [first];

    for (let p = 2; p <= 5; p++) {
      if (p === 5) {
        // 末页：只改 HTTP 请求头 UA，保持页面 JS 侧 UA 不变（token 仍需页面现算）
        await cdp.send('Network.setExtraHTTPHeaders', { headers: { 'User-Agent': UA_YRX } });
      }
      const prev = pages[pages.length - 1];
      let nums = [];
      for (let attempt = 1; attempt <= 3 && nums.length < 10; attempt++) {
        await clickReal(p);
        for (let i = 0; i < 45; i++) {
          await sleep(1000);
          nums = await scrape();
          if (nums.length >= 10 && JSON.stringify(nums) !== JSON.stringify(prev)) break;
        }
        if (nums.length >= 10) break;
        log(`[!] 第${p}页第${attempt}次未取到，重试…`);
        await sleep(1500);
      }
      pages.push(nums);
      log(`[+] 第${p}页 ${JSON.stringify(nums)}`);
    }
    if (pages[4] && pages[4].length >= 10) await cdp.send('Network.setExtraHTTPHeaders', { headers: {} });

    const all = pages.flat().filter((n) => Number.isFinite(n));
    const total = all.reduce((a, b) => a + b, 0);
    log(`[*] 共 ${all.length} 个数，合计 = ${total}`);
    ws.close();

    const out = { question: String(Q), pages, total, count: all.length, at: new Date().toISOString() };
    if (submit) {
      if (all.length !== 50) throw new Error('数据不完整，拒绝提交');
      const res = await fetch(`${HOST}/a/${Q}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json, text/javascript, */*; q=0.01',
          cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, origin: HOST,
          'user-agent': UA_YRX, 'x-requested-with': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ answer: String(total) }).toString(),
      });
      const text = await res.text();
      log(`[*] 提交 → HTTP ${res.status} ${text}`);
      try { out.response = JSON.parse(text); } catch { out.raw = text; }
      fs.writeFileSync(path.join(DIR, 'result.json'), JSON.stringify(out, null, 2));
    } else {
      fs.mkdirSync(path.join(DIR, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(DIR, 'docs/last_run.json'), JSON.stringify(out, null, 2));
    }
    return out;
  } finally {
    chrome.kill();
    await sleep(300);
  }
}

main().catch((e) => { console.error('[-]', e.message); process.exit(1); });
