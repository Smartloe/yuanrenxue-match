/**
 * 猿人学第17题 —— 天杀的Http2.0
 *
 * 本题考点是"必须用 HTTP/2 访问数据接口"（早期服务端对 HTTP/1.1 直接拒绝）。
 * 现在服务端已支持 h2，Node 的 fetch（undici）默认协商 h2，直接请求即可。
 * 接口：GET /api/question/17?page=N&pageSize=10&kw=
 * 答案：5 页数值之和
 *
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const H = (extra = {}) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/17`, 'user-agent': 'yuanrenxue',
  accept: 'application/json, text/javascript, */*; q=0.01', 'x-requested-with': 'XMLHttpRequest', ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const values = [];
  let sum = 0;
  for (let p = 1; p <= 5; p++) {
    const res = await fetch(`${HOST}/api/question/17?page=${p}&pageSize=10&kw=`, { headers: H() });
    const json = await res.json();
    if (!Array.isArray(json.data)) throw new Error(`第${p}页失败: ${JSON.stringify(json).slice(0, 200)}`);
    values.push(...json.data);
    sum += json.data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页 HTTP/2 ${JSON.stringify(json.data)}`);
    if (p < 5) await sleep(500);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${sum}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total: sum, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
  const res = await fetch(`${HOST}/a/17`, {
    method: 'POST',
    headers: H({ 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST }),
    body: new URLSearchParams({ answer: String(sum) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
