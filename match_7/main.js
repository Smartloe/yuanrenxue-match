/**
 * 猿人学第7题 —— 动态字体，随风漂移
 *
 * 机制：/api/question/7 每次返回 {woff, data}：
 *   - woff 是一份**每页都不一样**的动态字体（码点→数字的映射被打乱）；
 *   - data 里的数字用 `&#xXXXX;` 实体表示，只有配合该字体才看得出真实数字。
 *
 * 解法：用浏览器把该页字体的 10 个码点渲染成位图 → 归一化特征 →
 *       与预置的 10 个数字模板（config/templates7.json，来自人工标注的一页）做最近邻匹配
 *       → 得到 码点→数字 映射 → 还原 data → 求和。
 * 第 5 页要求 UA=yuanrenxue。
 *
 * 用法：node main.js [--no-submit]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { feature, dist2, assign } = require('./utils/glyph');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9482);
const HOST = 'https://match.yuanrenxue.cn';
const Q = 7;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const TPL = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/templates7.json'), 'utf8'));
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const H = (ua) => ({ cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, 'user-agent': ua, 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
    });
  }
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx7s-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1200,800', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); } }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');

    const renderPage = async (woff, cps) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(async function(){
          var bin = atob(${JSON.stringify(woff)}); var bytes = new Uint8Array(bin.length);
          for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
          var url = URL.createObjectURL(new Blob([bytes], {type:'font/woff'}));
          var fam = 'q7' + Math.random().toString(36).slice(2);
          var ff = new FontFace(fam, "url(" + url + ") format('woff')");
          await ff.load(); document.fonts.add(ff);
          var cps = ${JSON.stringify(cps)};
          var W = 40, H = 56, out = [];
          var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var ctx = cv.getContext('2d');
          for (var k=0;k<cps.length;k++){
            ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#000'; ctx.font = '40px ' + fam; ctx.textBaseline='middle'; ctx.textAlign='center';
            ctx.fillText(String.fromCharCode(cps[k]), W/2, H/2);
            var d = ctx.getImageData(0,0,W,H).data; var gray=[];
            for (var j=0;j<W*H;j++) gray.push(Math.round(0.299*d[j*4]+0.587*d[j*4+1]+0.114*d[j*4+2]));
            out.push({cp:cps[k], gray:gray});
          }
          return JSON.stringify({W:W,H:H,glyphs:out});
        })()`, returnByValue: true, awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error('渲染字体失败');
      return JSON.parse(r.result.value);
    };

    const pages = []; let total = 0; const allValues = [];
    for (let p = 1; p <= 5; p++) {
      const ua = p === 5 ? 'yuanrenxue' : UA_BROWSER;
      const j = await (await fetch(`${HOST}/api/question/${Q}?page=${p}&pageSize=10&kw=`, { headers: H(ua) })).json();
      if (!j.woff) throw new Error(`第${p}页异常: ${JSON.stringify(j).slice(0, 120)}`);
      const cps = [...new Set((j.data.join('').match(/&#x[0-9a-f]+/gi) || []).map((c) => parseInt(c.slice(3), 16)))];
      const info = await renderPage(j.woff, cps);
      // 码点 → 数字：代价矩阵 + 匈牙利算法求最小代价**排列**（10 个码点必然是 0-9 的一个排列）
      const DIGITS = ['0','1','2','3','4','5','6','7','8','9'];
      const feats = info.glyphs.map((g) => feature(g.gray, info.W, info.H));
      const cost = feats.map((f) => DIGITS.map((d) => Math.min(...TPL.filter((t) => t.digit === d).map((t) => dist2(f, t.feat)))));
      const asg = assign(cost);
      const map = {};
      info.glyphs.forEach((g, i) => { map[g.cp] = DIGITS[asg[i]]; });
      const avg = asg.reduce((s2, di, i) => s2 + cost[i][di], 0) / asg.length;
      console.log(`[·] 第${p}页 匹配平均代价 ${avg.toFixed(1)}，映射=${info.glyphs.map((g) => g.cp.toString(16) + ':' + map[g.cp]).join(' ')}`);
      const values = j.data.map((s) => Number(s.replace(/&#x([0-9a-f]+);?/gi, (_, h) => map[parseInt(h, 16)])));
      pages.push(values); allValues.push(...values); total += values.reduce((a, b) => a + b, 0);
      console.log(`[+] 第${p}页 ${JSON.stringify(values)}  小计=${values.reduce((a, b) => a + b, 0)}`);
    }
    console.log(`\n[*] 共 ${allValues.length} 个数，总和 = ${total}`);
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ pages, total, count: allValues.length }, null, 2));
    ws.close();
    if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
    const res = await fetch(`${HOST}/a/${Q}`, {
      method: 'POST',
      headers: { ...H('yuanrenxue'), 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST },
      body: new URLSearchParams({ answer: String(total) }).toString(),
    });
    const text = await res.text(); console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
    const r = JSON.parse(text);
    const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
    if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
  } finally { chrome.kill(); await sleep(200); }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
