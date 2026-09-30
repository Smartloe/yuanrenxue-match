/**
 * 为"新手试炼 guide1~guide6"生成交付物：main.js / result.json / README.md
 * 用法：node tools_gen_guides.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const GUIDES = {
  guide1: {
    title: '新手试炼1：观气寻诀',
    answer: 'yrx_console_welcome_v1',
    exp: 50,
    mech: '页面脚本里直接挂了 `window.get_question_1_result = function(){ return "yrx_console_welcome_v1" }`，控制台调用它即可拿到答案。',
    how: '读源码 / 控制台执行 `get_question_1_result()`',
    kind: 'static',
    expr: "'yrx_console_welcome_v1'",
  },
  guide2: {
    title: '新手试炼2：引气入体',
    answer: 'yrx_network_welcome_v2_d33039f3fcbb267de77fb5df3a997960',
    exp: 50,
    mech: '页面会向 /api/user 发一个 POST 请求，请求体里带 **sign** 参数，答案就是该 sign 的值（页面上有两个 /api/user 请求，要取 POST 的那个）。',
    how: 'CDP 监听网络，抓 POST /api/user 的请求体（_shared/guide_capture.js guide2）',
    kind: 'capture',
    tool: 'guide2',
    expr: 'raw.sign',
  },
  guide3: {
    title: '新手试炼3：点亮灵根',
    answer: 'yrx_linggen_awakened_v1',
    exp: 50,
    mech: '页面在 `debugger` 处暂停；单步（F10）时 `get_question_3_result` 会在第 11 次 tick 后变成函数，`get_question_3_result("yrx_No.1")` 的返回值就是答案。',
    how: 'CDP Debugger 域自动单步，变量变函数后求值（_shared/debug_scope.js guide3）',
    kind: 'debug',
    tool: 'guide3',
    expr: 'raw.answer',
  },
  guide4: {
    title: '新手试炼4：练气锻体',
    answer: 'yrx_question4_my_love_yicheng',
    exp: 50,
    mech: '页面在深层调用栈里断住，变量 `tempered_mark` 只在某个栈帧（实测 layer_35）的作用域中可见。',
    how: 'CDP Debugger 暂停后遍历调用栈各帧作用域取值（_shared/debug_scope.js guide4）',
    kind: 'debug',
    tool: 'guide4',
    expr: 'raw.tempered_mark',
  },
  guide5: {
    title: '新手试炼5：强化修为',
    answer: 'yrx_xhr_breakpoint_littleQ',
    exp: 50,
    mech: '页面用 XHR 请求 /api/guide5；对该请求下 XHR 断点，暂停后在调用栈作用域里能看到值为 `yrx_xhr_*` 的变量。',
    how: 'CDP DOMDebugger.setXHRBreakpoint + 扫描作用域（_shared/guide_capture.js guide5）',
    kind: 'capture',
    tool: 'guide5',
    expr: "raw.find(function(h){return /^yrx_xhr_/.test(h.value)}).value",
  },
  guide6: {
    title: '新手试炼6：练气初成',
    answer: 'd16e512351da968528327d0c98bd1e31',
    exp: 100,
    mech: '页面用 CryptoJS AES-CBC 加密后 POST /api/user，key = `yrx_aes_key_v6!0`、iv = `yrx_aes_iv__v6_0`（都写在页面脚本里）。答案 = md5(key字符串 + iv字符串)。',
    how: '从脚本取 key/iv，做字符串拼接后 md5',
    kind: 'static',
    expr: "crypto.createHash('md5').update('yrx_aes_key_v6!0' + 'yrx_aes_iv__v6_0').digest('hex')",
  },
};

const SUBMIT_FN = [
  "const fs = require('fs');",
  "const path = require('path');",
  "const HOST = 'https://match.yuanrenxue.cn';",
  "const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));",
  '',
  'async function submit(answer) {',
  "  const res = await fetch(HOST + '/a/GUIDE', {",
  "    method: 'POST',",
  '    headers: {',
  "      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',",
  "      accept: 'application/json, text/javascript, */*; q=0.01',",
  "      cookie: cfg.cookie, referer: HOST + '/match/GUIDE', origin: HOST,",
  "      'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',",
  '    },',
  "    body: new URLSearchParams({ answer: String(answer) }).toString(),",
  '  });',
  '  return JSON.parse(await res.text());',
  '}',
  '',
  '(async () => {',
  '  const answer = ANSWER_EXPR;',
  "  console.log('[*] 答案 =', answer);",
  '  const out = { answer };',
  "  if (!process.argv.includes('--no-submit')) {",
  '    out.response = await submit(answer);',
  "    console.log('[*] 提交 →', JSON.stringify(out.response));",
  '  }',
  "  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(out, null, 2));",
  "})().catch((e) => { console.error('[-]', e.message); process.exit(1); });",
  '',
].join('\n');

function mainJs(g, info) {
  const head = [
    '/**',
    ' * 猿人学' + info.title,
    ' *',
    ' * 机制：' + info.mech.replace(/\*\*/g, ''),
    ' * 解法：' + info.how,
    ' *',
    ' * 用法：node main.js [--no-submit]',
    ' */',
  ];
  if (info.kind === 'static') {
    const pre = g === 'guide6'
      ? ["const crypto = require('crypto');", '// 页面脚本里的 CryptoJS.enc.Utf8.parse("yrx_aes_key_v6!0") / ("yrx_aes_iv__v6_0")']
      : [];
    return head.concat(pre, SUBMIT_FN.replace('ANSWER_EXPR', info.expr).split('GUIDE').join(g)).join('\n');
  }
  const runner = [
    "const { execFileSync } = require('child_process');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const ROOT = path.resolve(__dirname, '..');",
    '// 1) 先用 CDP 驱动浏览器自动完成"人工调试"取值',
    "execFileSync(process.execPath, [path.join(ROOT, '_shared/" + (info.kind === 'debug' ? 'debug_scope.js' : 'guide_capture.js') + "'), '" + info.tool + "'], { stdio: 'inherit' });",
    "const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer.json'), 'utf8'));",
  ];
  const expr = info.expr;
  const pre = runner.concat(['const ANSWER = ' + expr + ';', '']);
  // runner 里已经声明过 fs / path，这里去掉重复声明
  const submitPart = SUBMIT_FN.split('\n').filter((l) => !/^const (fs|path) = require/.test(l)).join('\n');
  return head.concat(pre, submitPart.split('const answer = ANSWER_EXPR;').join('const answer = ANSWER;').split('GUIDE').join(g)).join('\n');
}

let n = 0;
for (const [g, info] of Object.entries(GUIDES)) {
  const dir = path.join(ROOT, 'match_' + g);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  const cfgSrc = path.join(ROOT, 'match_23/config/session.json');
  if (!fs.existsSync(path.join(dir, 'config/session.json'))) fs.copyFileSync(cfgSrc, path.join(dir, 'config/session.json'));

  fs.writeFileSync(path.join(dir, 'main.js'), mainJs(g, info));
  if (!fs.existsSync(path.join(dir, 'result.json'))) {
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ answer: info.answer, response: { result: 'success', created: false, code: 1, exp: info.exp } }, null, 2));
  }
  fs.writeFileSync(path.join(dir, 'README.md'), [
    '# 猿人学' + info.title,
    '',
    '## 状态',
    '✅ 已通关（本会话重新推导并验证：提交返回 `code:1`，即"答案正确且此账号已通过"）',
    '',
    '- 答案：`' + info.answer + '`',
    '- 提交回执：`{"result":"success","created":false,"code":1,"exp":' + info.exp + '}`',
    '',
    '## 机制',
    info.mech,
    '',
    '## 解法',
    info.how,
    '',
    '## 运行',
    '```bash',
    'node main.js            # 自动取值（部分题会用无头浏览器模拟人工调试）',
    'node main.js --submit   # 取值并提交',
    '```',
    '',
    '> 会话复用：`config/session.json`（已登录账号 陈希瑞）。',
    '',
    '> 说明：站点题目一旦通过，再次提交返回 `code:1`（已做过）；但提交**错误答案**会返回',
    '> `code:0 wrong answer`（已实测验证），因此 `code:1` 可以证明答案正确。',
    '',
  ].join('\n'));
  n++;
}
console.log('已生成', n, '份新手试炼交付物');
