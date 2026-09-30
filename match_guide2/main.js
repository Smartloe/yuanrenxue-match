/**
 * 猿人学新手试炼2：引气入体
 *
 * 机制：页面会向 /api/user 发一个 POST 请求，请求体里带 sign 参数，答案就是该 sign 的值（页面上有两个 /api/user 请求，要取 POST 的那个）。
 * 解法：CDP 监听网络，抓 POST /api/user 的请求体（_shared/guide_capture.js guide2）
 *
 * 用法：node main.js [--no-submit]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 1) 先用 CDP 驱动浏览器自动完成"人工调试"取值
execFileSync(process.execPath, [path.join(ROOT, '_shared/guide_capture.js'), 'guide2'], { stdio: 'inherit' });
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));
const ANSWER = raw.sign;

const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(HOST + '/a/guide2', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: HOST + '/match/guide2', origin: HOST,
      'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ answer: String(answer) }).toString(),
  });
  return JSON.parse(await res.text());
}

(async () => {
  const answer = ANSWER;
  console.log('[*] 答案 =', answer);
  const out = { answer };
  if (!process.argv.includes('--no-submit')) {
    out.response = await submit(answer);
    console.log('[*] 提交 →', JSON.stringify(out.response));
  }
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(out, null, 2));
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
