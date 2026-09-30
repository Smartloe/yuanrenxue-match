/**
 * 猿人学新手试炼5：强化修为
 *
 * 机制：页面用 XHR 请求 /api/guide5；对该请求下 XHR 断点，暂停后在调用栈作用域里能看到值为 `yrx_xhr_*` 的变量。
 * 解法：CDP DOMDebugger.setXHRBreakpoint + 扫描作用域（_shared/guide_capture.js guide5）
 *
 * 用法：node main.js [--no-submit]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 1) 先用 CDP 驱动浏览器自动完成"人工调试"取值
execFileSync(process.execPath, [path.join(ROOT, '_shared/guide_capture.js'), 'guide5'], { stdio: 'inherit' });
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));
const ANSWER = raw.find(function(h){return /^yrx_xhr_/.test(h.value)}).value;

const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(HOST + '/a/guide5', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: HOST + '/match/guide5', origin: HOST,
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
