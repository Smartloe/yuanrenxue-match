/**
 * 通用"5 页求和"题求解器（浏览器驱动版）——可复用模块
 *
 * 适用：页面用自己的混淆 JS 生成参数（window.matchnumber / window.matchN 等）再去请求
 *       /api/question/N?page=P&pageSize=10&kw=，每页渲染 10 个数字，答案 = 5 页总和。
 *
 * 做法：用真实 Chrome 打开 /match/N，让页面自己的 JS 生成参数并请求，
 *       再用 CDP 真实输入事件点击分页按钮（部分题目会校验 event.isTrusted），
 *       从 #pgxList 抓取渲染出来的数字；第 5 页按题面要求把 UA 换成 yuanrenxue。
 *
 * 作为模块：
 *   const { solve } = require('../_shared/solve_pages');
 *   solve({ q: 5, submit: false });
 * 作为 CLI：
 *   node _shared/solve_pages.js --q 5 [--submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://match.yuanrenxue.cn';
const UA_YRX = 'yuanrenxue';
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
}

/**
 * @param {object} opts
 * @param {number|string} opts.q        题号（match/<q>）
 * @param {boolean} [opts.submit]       是否提交（默认 false，只取数）
 * @param {string}  [opts.dir]          题目目录（默认 ROOT/match_<q>）
 * @param {number}  [opts.port]         CDP 端口
 * @param {(s:string)=>void} [opts.log] 日志输出
 */
async function solve(opts = {}) {
  const q = opts.q;
  if (q === undefined) throw new Error('缺少 q');
  const log = opts.log || ((s) => process.stdout.write(s + '\n'));
  const dir = path.resolve(ROOT, opts.dir || `match_${q}`);
  const port = Number(opts.port || (9600 + (Number(q) || 0)));
  const submit = !!opts.submit;
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  const cfgPath = path.join(dir, 'config/session.json');
  const cfg = fs.existsSync(cfgPath)
    ? JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    : JSON.parse(fs.readFileSync(path.join(ROOT, 'match_23/config/session.json'), 'utf8'));
  if (!fs.existsSync(cfgPath)) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `yrx${q}-`));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--window-size=1500,1100', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

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
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', { name: 'sessionid', value: cfg.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
    await cdp.send('Page.navigate', { url: `${HOST}/match/${q}` });

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return null;
      return r.result.value;
    };
    const scrape = async () => {
      const txt = await ev(`(function(){var el=document.querySelector('#pgxList');return el?el.innerText:'';})()`);
      return (String(txt || '').match(/\d+/g) || []).map(Number).slice(0, 10);
    };
    const clickReal = async (p) => {
      // 先把按钮滚到视口内（有些题目分页在折叠线以下，直接点会落空）
      const box = await ev(`(function(){
        var el=document.querySelector('#pgxPages .pgx-page[data-page="${p}"]');
        if(!el) return null;
        try{ el.scrollIntoView({block:'center', inline:'center'}); }catch(e){ el.scrollIntoView(); }
        var r=el.getBoundingClientRect();
        return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height});
      })()`);
      if (!box) return false;
      const { x, y } = JSON.parse(box);
      if (!(x > 0 && y > 0)) return false;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    };

    // 等首页数据
    let first = [];
    for (let i = 0; i < 30; i++) { await sleep(1000); first = await scrape(); if (first.length >= 10) break; }
    if (!first.length) log('[!] 首页没有抓到数字，稍后可能仍能取到其它页');

    const pages = [first];
    for (let p = 2; p <= 5; p++) {
      if (p === 5) await cdp.send('Network.setUserAgentOverride', { userAgent: UA_YRX });
      let nums = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        const ok = await clickReal(p);
        if (!ok) log(`[!] 第${p}页按钮未找到`);
        for (let i = 0; i < 20; i++) {
          await sleep(1000);
          nums = await scrape();
          if (nums.length >= 10 && JSON.stringify(nums) !== JSON.stringify(pages[pages.length - 1])) break;
        }
        if (nums.length >= 10) break;
        log(`[!] 第${p}页第${attempt}次尝试没取到数据，重试…`);
        await sleep(1500);
      }
      pages.push(nums);
      log(`[+] 第${p}页 ${JSON.stringify(nums)}`);
    }

    const all = pages.flat().filter((n) => Number.isFinite(n));
    const total = all.reduce((a, b) => a + b, 0);
    log(`[*] 共 ${all.length} 个数，总和 = ${total}`);
    ws.close();

    const out = { question: q, pages, total, count: all.length, at: new Date().toISOString() };
    if (submit) {
      const res = await fetch(`${HOST}/a/${q}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json, text/javascript, */*; q=0.01',
          cookie: cfg.cookie, referer: `${HOST}/match/${q}`, origin: HOST,
          'user-agent': UA_YRX, 'x-requested-with': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ answer: String(total) }).toString(),
      });
      const text = await res.text();
      log(`[*] 提交 → HTTP ${res.status} ${text}`);
      try { out.response = JSON.parse(text); } catch { out.raw = text; }
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
    } else {
      // 不提交：只写 docs/last_run.json，避免覆盖已有的通关回执
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs/last_run.json'), JSON.stringify(out, null, 2));
      if (!fs.existsSync(path.join(dir, 'result.json'))) {
        fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
      }
    }
    return out;
  } finally {
    chrome.kill();
    await sleep(200);
  }
}

module.exports = { solve, HOST, UA_YRX };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const q = argv[argv.indexOf('--q') + 1];
  solve({ q, submit: argv.includes('--submit') })
    .catch((e) => { console.error('[-]', e.message); process.exit(1); });
}
