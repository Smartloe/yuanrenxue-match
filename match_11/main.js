/**
 * 猿人学第11题 —— 一叶障目 · 控制台检测
 *
 * ✅ 解法（已通关，exp 350）：
 *
 *   服务端每次请求 /match/11 会下发一次性后缀 S（16 位 hex，写在题面里并记在会话里）；
 *   页面里的 JSVMP 控制台检测盾在初始化时读出 S、生成并打印随机串 X（"RandomString: X"），
 *   并把真正的签名函数挂到 window.SecretKey（输出带随机性，服务端可验证）。
 *
 *   answer = window.SecretKey(X + S)          ← X、S 必须来自同一次页面加载
 *
 *   两个坑：
 *     1) 盾会立刻 console.clear() 把打印清掉 —— 必须在页面脚本之前劫持 iframe 的 console；
 *     2) 盾会把题面里的后缀从 DOM 抹掉 —— 所以 S 要从网络响应体里取。
 *
 * 用法：
 *   node main.js               # 取值并提交
 *   node main.js --no-submit   # 只取值，不提交
 */

const fs = require('fs');
const path = require('path');
const { extractAnswer } = require('./utils/extract');

const HOST = 'https://match.yuanrenxue.cn';
const SUBMIT_PATH = '/a/11';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(`${HOST}${SUBMIT_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie,
      referer: `${HOST}/match/11`,
      origin: HOST,
      'user-agent': 'yuanrenxue',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ answer: String(answer) }).toString(),
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: { raw: text } }; }
}

async function main() {
  const doSubmit = !process.argv.includes('--no-submit');
  console.log('[*] 题目：第11题 - 一叶障目 · 控制台检测');
  console.log('[*] 流程：读服务端后缀 S → 截获盾打印的 X → answer = SecretKey(X + S)\n');

  const { suffix, printedX, answer } = await extractAnswer({
    session: cfg,
    timeoutMs: 25000,
    log: (m) => console.log(m),
  });

  console.log('\n' + '='.repeat(64));
  console.log(`[*] 后缀 S = ${suffix}`);
  console.log(`[*] 随机串 X = ${printedX}`);
  console.log(`[*] 答案（${String(answer).length} 位）= ${String(answer).slice(0, 64)}...`);
  console.log('='.repeat(64));

  const result = { suffix, printedX, answer, submitted: false };

  if (!doSubmit) {
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result, null, 2));
    console.log('[*] 已跳过提交（--no-submit），结果写入 result.json');
    return;
  }

  const { status, json } = await submit(answer);
  console.log(`[*] POST ${SUBMIT_PATH} → HTTP ${status} ${JSON.stringify(json)}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...result, submitted: true, response: json, at: new Date().toISOString() }, null, 2));

  if (json.code === 2) console.log('[*] ✅ 通关成功');
  else if (json.code === 1) console.log('[*] ⚠️ 该题已通过（重复提交）');
  else { console.log('[-] ❌ 答案未通过'); process.exitCode = 1; }
}

main().catch((e) => { console.error('[-]', e.message); process.exit(1); });
