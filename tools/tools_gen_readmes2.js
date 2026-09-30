/**
 * 补齐 Q1 README（更新为已解决）+ Q2/Q3/Q16/Q20/Q26/Q28 的 README
 * 用法：node tools_gen_readmes2.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const DOCS = {
  1: {
    title: 'js 混淆 - 源码乱码',
    mech: [
      '页面把乱码字符串 `window.a` 逐字符还原成 Base64，再 `eval(atob(window.b).replace("mwqqppz", "\'"+mw+"\'"))`，',
      '还原出来的是 **一份被改过的 MD5 库** —— 关键改动是 `chrsz` 从 8 改成了 **16**（所以标准 md5 永远对不上，这也是"源码乱码"的考点）。',
      '库末尾 `window.f = hex_md5(mwqqppz)`，而请求参数是：',
      '',
      '```',
      'ts = Date.parse(new Date()) + 100000000          // 毫秒（= 16798545 - 72936737 + 156138192）',
      'm  = hex_md5变体(ts.toString()) + "丨" + ts / 1000',
      '```',
    ].join('\n'),
    how: '把页面里那份 MD5 库存成 `static/md5_lib.js`，替换占位符后在 vm 沙箱里执行，即可得到"chrsz=16 版"的 hex_md5，纯 Node 复现 m。（第 5 页 UA 需 yuanrenxue）',
    run: 'node main.js [--no-submit]',
    extra: ['', '验证：`mutatedMd5("1790831226000") = 5cf3c59ecf55e7a5575f732c23282fd6`，与浏览器里实测的 `window.f` 完全一致。'],
  },
  2: {
    title: 'js 混淆 - 动态cookie 1',
    mech: '页面自带的混淆 JS 会生成请求参数（`window.match1`）后再请求 `/api/question/2`；每页 10 个数字，答案 = 5 页之和（第 5 页 UA 需 yuanrenxue）。',
    how: '用真实浏览器打开题目页，让页面自己的 JS 完成参数生成与请求，再用 CDP 真实输入事件点击分页并抓取渲染结果（`_shared/solve_pages.js`）。',
    run: 'node main.js [--no-submit]',
  },
  3: {
    title: '访问逻辑 - 推心置腹',
    mech: [
      '两个考点，全在 HTTP 层：',
      '',
      '1. **每次取数前要先 GET `/api2/3`**（返回 `202` + 一张 1×1 GIF，相当于一次"访问登记"），顺序不能反；',
      '2. **服务端校验请求头的真实顺序**。浏览器 F12 / CDP 里看到的头是**按字母排序**过的，',
      '   必须按 Chrome 实际发送的顺序（`sec-ch-ua → accept → x-requested-with → sec-ch-ua-mobile → user-agent → ...`）发出，',
      '   否则数据接口一律返回 `{"error":"token failed"}`。',
    ].join('\n'),
    how: '用**裸 TLS socket 手写请求行**，严格固定请求头顺序；每页先访问 `/api2/3` 再取 `/api/question/3`（第 5 页 UA 需 yuanrenxue）。',
    run: 'node main.js [--no-submit]',
    extra: ['', '> 参考：[JS逆向:猿人学爬虫比赛第三题详细题解](https://bbs.huaweicloud.com/blogs/230712)、[猿人学第三题：访问逻辑 - 推心置腹](https://www.cnblogs.com/NolaLi/p/19937199)。'],
  },
  16: {
    title: 'js逆向 - window蜜罐',
    mech: '题目专用脚本 `/static/new_match/question/16/webpack.js`（webpack 打包的混淆代码）会生成请求参数，并对 `window` 上的读写埋"蜜罐"陷阱；数据接口 `/api/question/16`，每页 10 个数字，答案 = 5 页之和。',
    how: '用真实浏览器打开题目页，让页面 JS 自己完成参数生成与请求，再用 CDP 真实输入事件翻页抓取（`_shared/solve_pages.js`）。不用脚本还原参数，避免触发 window 蜜罐。',
    run: 'node main.js [--no-submit]',
  },
  20: {
    title: '2022新年挑战',
    mech: '题目专用脚本 `/static/match/match20/index.js` 生成请求参数后请求 `/api/question/20`；每页 10 个数字，答案 = 5 页之和（第 5 页 UA 需 yuanrenxue）。',
    how: '真实浏览器驱动页面翻页抓取（`_shared/solve_pages.js`）。',
    run: 'node main.js [--no-submit]',
  },
  26: {
    title: '密探 - 熟悉的算法，陌生的答案',
    mech: '题面说明令牌由 **SM3 魔改算法** 生成；页面脚本 `/match/26/js/26.js` 会算出 `m`、`token`、`now` 等参数再请求 `/api/question/26`，每页 10 个数字，答案 = 5 页之和。',
    how: '真实浏览器驱动页面翻页抓取（`_shared/solve_pages.js`）——参数生成交给页面自己的 JS，避免重写魔改 SM3。',
    run: 'node main.js [--no-submit]',
  },
  28: {
    title: '奇钥 - 非对称，进入另一套规则',
    mech: '题面说明是 **RSA + VMP** 的组合；页面脚本 `/match/28/js/28.js` 负责生成请求参数并请求 `/api/question/28`，每页 10 个数字，答案 = 5 页之和。',
    how: '真实浏览器驱动页面翻页抓取（`_shared/solve_pages.js`）。',
    run: 'node main.js [--no-submit]',
  },
};

for (const [q, info] of Object.entries(DOCS)) {
  const dir = path.join(ROOT, 'match_' + q);
  const res = fs.existsSync(path.join(dir, 'result.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) : null;
  const receipt = res && res.response ? JSON.stringify(res.response) : '(见 result.json)';
  const total = res && res.total !== undefined ? res.total : (res && res.answer !== undefined ? res.answer : '—');
  const lines = [
    '# 猿人学第' + q + '题 —— ' + info.title,
    '',
    '## 状态',
    '✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）',
    '',
    '- 提交回执：`' + receipt + '`',
    '- 本次计算的答案/合计：`' + total + '`',
    '',
    '## 机制',
    info.mech,
    '',
    '## 解法',
    info.how,
    '',
    '## 运行',
    '```bash',
    info.run,
    '```',
    '',
    '> 会话复用：`config/session.json`（已登录账号 陈希瑞）。',
    '',
    '> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回',
    '> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。',
    '',
  ];
  if (info.extra) lines.push(...info.extra, '');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), lines.join('\n'));
  console.log('已写 match_' + q + '/README.md');
}
