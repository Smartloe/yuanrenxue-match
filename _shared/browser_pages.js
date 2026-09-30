/**
 * 通用"5 页求和"题求解器 —— 独立 CLI 入口
 * （实现见同目录 solve_pages.js，本文件只是命令行包装）
 *
 * 用法：
 *   node _shared/browser_pages.js --q 5 [--submit]
 */
const { solve } = require('./solve_pages');

const argv = process.argv.slice(2);
const q = argv[argv.indexOf('--q') + 1];
const submit = argv.includes('--submit');

if (!q) {
  console.error('用法: node _shared/browser_pages.js --q <题号> [--submit]');
  process.exit(1);
}

solve({ q, submit })
  .then((r) => console.log('[*] 合计 =', r.total))
  .catch((e) => { console.error('[-]', e.message); process.exit(1); });
