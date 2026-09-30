/**
 * 猿人学第13题 —— 入门级cookie
 *
 * 机制：页面先 `$.ajax({url:'/api2/13'})` 拿回一段 JS 并 eval，
 *       该 JS 用混淆字符拼接往 document.cookie 写：
 *         yuanrenxue_cookie = <13位时间戳>|<随机串>
 *       随后数据接口 /api/question/13 就靠这个 cookie 放行。
 *
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOST = 'https://match.yuanrenxue.cn';
const API = '/api/question/13';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const baseHeaders = (extra = {}) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/13`, 'user-agent': 'yuanrenxue',
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01',
  ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取服务端下发的 JS，执行并捕获它要写的 cookie */
async function getCookieFromApi2() {
  const res = await fetch(`${HOST}/api2/13`, { headers: baseHeaders() });
  const js = await res.text();
  const sandbox = { document: {} };
  vm.createContext(sandbox);
  vm.runInContext(js.replace('document.cookie=', '__captured = '), sandbox);
  const raw = String(sandbox.__captured || '');
  const eq = raw.indexOf('=');
  if (eq < 0) throw new Error('没解析出 cookie: ' + raw.slice(0, 120));
  const name = raw.slice(0, eq);
  const value = raw.slice(eq + 1).split(';')[0];
  return { name, value, raw };
}

async function fetchPage(page, cookieHeader) {
  const url = `${HOST}${API}?page=${page}&pageSize=10&kw=`;
  const res = await fetch(url, { headers: baseHeaders({ cookie: cookieHeader }) });
  const json = await res.json();
  if (!Array.isArray(json.data)) throw new Error(`第${page}页失败: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

(async () => {
  const values = [];
  let sum = 0;
  let lastCookie = '';
  for (let p = 1; p <= 5; p++) {
    // 关键：cookie/token 带时间戳，会过期 —— 每页都重新取一次
    const { name, value } = await getCookieFromApi2();
    const cookieHeader = `${cfg.cookie}; ${name}=${value}`;
    lastCookie = `${name}=${value}`;
    const data = await fetchPage(p, cookieHeader);
    values.push(...data);
    sum += data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页 ${JSON.stringify(data)}`);
    if (p < 5) await sleep(500);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${sum}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ cookie: lastCookie, total: sum, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');

  const res = await fetch(`${HOST}/a/13`, {
    method: 'POST',
    headers: baseHeaders({ 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST }),
    body: new URLSearchParams({ answer: String(sum) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
