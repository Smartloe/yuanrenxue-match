/**
 * 猿人学第1题 —— js 混淆 - 源码乱码
 *
 * 机制（逆向自页面内联脚本）：
 *   页面把一段"乱码字符串" window.a 逐字符按 (charcode - i - window.c) 还原，
 *   得到 Base64 编码的 **被改过的 MD5 库**，再 eval：
 *       eval(atob(window.b).replace("mwqqppz", "'" + mw + "'"))
 *   库末尾是 `window.f = hex_md5(mwqqppz)`，而库里 **chrsz 被从 8 改成 16**
 *   （所以标准 md5 永远对不上，这也是本题"源码乱码"的考点）。
 *
 *   请求参数：
 *       ts = Date.parse(new Date()) + 100000000          // 毫秒
 *       m  = hex_md5变体(ts.toString()) + "丨" + ts / 1000
 *   然后 GET /api/question/1?page=N&pageSize=10&kw=&m=...（第 5 页 UA 需 yuanrenxue）
 *
 * 纯 Node 实现：把页面里那份 MD5 库（static/md5_lib.js）拿来，替换占位符后直接在
 * vm 沙箱里执行即可得到 hex_md5变体，无需浏览器。
 *
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOST = 'https://match.yuanrenxue.cn';
const Q = 1;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const LIB = fs.readFileSync(path.join(__dirname, 'static/md5_lib.js'), 'utf8');
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const H = (ua) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, 'user-agent': ua,
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 用页面里那份"chrsz=16"的 MD5 库算散列 */
function mutatedMd5(input) {
  const src = LIB.replace('window.f = hex_md5(mwqqppz)', 'window.f = hex_md5(' + JSON.stringify(String(input)) + ')');
  const sandbox = { window: {}, document: {}, console: { log() {} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.f;
}

/** 生成一次请求用的 m */
function makeM() {
  const ts = Math.floor(Date.now() / 1000) * 1000 + 100000000;   // Date.parse(new Date()) 不含毫秒
  return `${mutatedMd5(String(ts))}丨${ts / 1000}`;
}

(async () => {
  const values = []; let total = 0;
  for (let p = 1; p <= 5; p++) {
    const ua = p === 5 ? 'yuanrenxue' : UA_BROWSER;
    const url = `${HOST}/api/question/${Q}?page=${p}&pageSize=10&kw=&m=${encodeURIComponent(makeM())}`;
    const res = await fetch(url, { headers: H(ua) });
    const j = await res.json();
    if (!Array.isArray(j.data)) throw new Error(`第${p}页失败: ${JSON.stringify(j).slice(0, 150)}`);
    values.push(...j.data); total += j.data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页 ${JSON.stringify(j.data)}`);
    if (p < 5) await sleep(400);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${total}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');

  const res = await fetch(`${HOST}/a/${Q}`, {
    method: 'POST',
    headers: { ...H('yuanrenxue'), 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST },
    body: new URLSearchParams({ answer: String(total) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 该题已通过（重复提交）');
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
