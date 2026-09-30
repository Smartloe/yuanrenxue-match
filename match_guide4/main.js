/**
 * 猿人学新手试炼4：练气锻体
 *
 * 机制：页面在深层调用栈里断住，变量 `tempered_mark` 只在某个栈帧（实测 layer_35）的作用域中可见。
 * 解法：CDP Debugger 暂停后遍历调用栈各帧作用域取值（_shared/debug_scope.js guide4）
 *
 * 用法：node main.js [--no-submit]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 1) 先用 CDP 驱动浏览器自动完成"人工调试"取值
execFileSync(process.execPath, [path.join(ROOT, '_shared/debug_scope.js'), 'guide4'], { stdio: 'inherit' });
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));
const ANSWER = raw.tempered_mark;

const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(HOST + '/a/guide4', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: HOST + '/match/guide4', origin: HOST,
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
