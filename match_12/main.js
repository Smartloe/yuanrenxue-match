/**
 * 猿人学第12题 —— 入门级js
 * 接口：GET /api/question/12?page=N&pageSize=10&kw=&m=<base64("yuanrenxue"+page)>
 * 答案：5 页数值之和
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const HOST = 'https://match.yuanrenxue.cn';
const API = '/api/question/12';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const H = () => ({
  cookie: cfg.cookie, referer: `${HOST}/match/12`, 'user-agent': 'yuanrenxue',
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  const m = Buffer.from('yuanrenxue' + page).toString('base64');
  const url = `${HOST}${API}?page=${page}&pageSize=10&kw=&m=${encodeURIComponent(m)}`;
  const res = await fetch(url, { headers: H() });
  const json = await res.json();
  if (!Array.isArray(json.data)) throw new Error(`第${page}页失败: ${JSON.stringify(json)}`);
  return json.data;
}

(async () => {
  const values = [];
  let sum = 0;
  for (let p = 1; p <= 5; p++) {
    const data = await fetchPage(p);
    values.push(...data);
    sum += data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页 ${JSON.stringify(data)}`);
    if (p < 5) await sleep(500);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${sum}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total: sum, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');
  const res = await fetch(`${HOST}/a/12`, {
    method: 'POST',
    headers: { ...H(), 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST },
    body: new URLSearchParams({ answer: String(sum) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total: sum, count: values.length, values, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
