/** 对拍：utils/crypto.js 的纯 JS 实现 vs 浏览器等价环境下的真实混淆 md5 */
const fs = require('fs');
const { loadMd5 } = require('./md5env');
const { md5 } = require('../utils/crypto');

const real = loadMd5({ browserEnv: true, hasSuccessAlert: true });
const rndStr = (n) => {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./:';
  let s = ''; for (let i = 0; i < n; i++) s += pool[Math.floor(Math.random() * pool.length)]; return s;
};
const inputs = [];
for (let n = 0; n <= 200; n++) inputs.push(rndStr(n));
for (let i = 0; i < 60; i++) inputs.push(rndStr(1 + Math.floor(Math.random() * 400)));
inputs.push('中文测试', '😀 emoji 测试', '\r\n换行');
for (const p of [1, 2, 3, 4, 5]) inputs.push(`/api/question/23${1760000000000 + p}${p}`);

let ok = 0; const bad = [];
for (const s of inputs) { if (md5(s) === real(s)) ok++; else bad.push(s); }
fs.writeSync(1, `一致 ${ok}/${inputs.length}\n`);
if (bad.length) fs.writeSync(1, '不一致样例: ' + JSON.stringify(bad.slice(0, 5)) + '\n');
process.exit(bad.length ? 1 : 0);
