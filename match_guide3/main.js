/**
 * 猿人学新手试炼3：点亮灵根
 *
 * 机制：页面在 `debugger` 处暂停；单步（F10）时 `get_question_3_result` 会在第 11 次 tick 后变成函数，`get_question_3_result("yrx_No.1")` 的返回值就是答案。
 * 解法：CDP Debugger 域自动单步，变量变函数后求值（_shared/debug_scope.js guide3）
 *
 * 用法：node main.js [--no-submit]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 1) 先用 CDP 驱动浏览器自动完成"人工调试"取值
execFileSync(process.execPath, [path.join(ROOT, '_shared/debug_scope.js'), 'guide3'], { stdio: 'inherit' });
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));
const ANSWER = raw.answer;

const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(HOST + '/a/guide3', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: HOST + '/match/guide3', origin: HOST,
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
