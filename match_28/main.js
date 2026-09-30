/**
 * 猿人学第28题 —— 奇钥 - 非对称，进入另一套规则
 *
 * 机制：页面用自带的混淆 JS 生成请求参数（window.matchnumber / window.matchN 等），
 *       再请求 /api/question/28?page=N&pageSize=10&kw=，每页 10 个数字，答案 = 5 页之和。
 *       （第 5 页按题面要求需要 User-Agent: yuanrenxue）
 *
 * 解法：用真实浏览器打开题目页，让页面自己的 JS 完成参数生成与请求，
 *       再用真实输入事件点击分页并抓取渲染结果 —— 见 ../_shared/solve_pages.js。
 *
 * 用法：
 *   node main.js            # 取数（结果写 docs/last_run.json）
 *   node main.js --submit   # 取数并提交
 */
const { solve } = require('../_shared/solve_pages');

solve({ q: 28, submit: process.argv.includes('--submit') })
  .then((r) => console.log('[*] 合计 = ' + r.total))
  .catch((e) => { console.error('[-]', e.message); process.exit(1); });
