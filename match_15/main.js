/**
 * 猿人学第15题 —— 备周则意怠-常见则不疑（WebAssembly）
 *
 * 机制：页面加载 /static/new_match/question/15/main.wasm，导出 encode(t1,t2)：
 *         t1 = floor(Date.now()/1000/2)
 *         t2 = t1 - random(1..50)
 *         m  = encode(t1,t2) + '|' + t1 + '|' + t2
 *       数据接口 /api/question/15 需要这个 m。
 * Node 原生支持 WebAssembly，直接实例化即可（无任何依赖）。
 *
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const H = (extra = {}) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/15`, 'user-agent': 'yuanrenxue',
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01', ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let encode;
async function loadWasm() {
  const bytes = fs.readFileSync(path.join(__dirname, 'static/main.wasm'));
  const inst = await WebAssembly.instantiate(await WebAssembly.compile(bytes), {});
  encode = inst.exports.encode;
}
function makeM() {
  const t1 = parseInt(Date.parse(new Date()) / 1000 / 2);
  const t2 = parseInt(Date.parse(new Date()) / 1000 / 2 - Math.floor(Math.random() * 50 + 1));
  return `${encode(t1, t2)}|${t1}|${t2}`;
}

(async () => {
  await loadWasm();
  const values = []; let total = 0;
  for (let p = 1; p <= 5; p++) {
    const m = makeM();
    const res = await fetch(`${HOST}/api/question/15?page=${p}&pageSize=10&kw=&m=${encodeURIComponent(m)}`, { headers: H() });
    const j = await res.json();
    if (!Array.isArray(j.data)) throw new Error(`第${p}页失败: ${JSON.stringify(j).slice(0, 150)}`);
    values.push(...j.data); total += j.data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页 ${JSON.stringify(j.data)}`);
    if (p < 5) await sleep(400);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${total}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
  const res = await fetch(`${HOST}/a/15`, {
    method: 'POST',
    headers: H({ 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST }),
    body: new URLSearchParams({ answer: String(total) }).toString(),
  });
  const text = await res.text(); console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
