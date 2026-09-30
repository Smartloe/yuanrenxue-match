/**
 * 对拍：真实混淆 md5（浏览器等价环境） vs 纯 JS 复刻 md5Mut。
 */
const fs = require('fs');
const { loadMd5 } = require('./md5env');
const { md5Mut, addCanvasNode, addCanvasNonNode, addCatch, IV_BROWSER, IV_FALLBACK, S_STD, S_ALT } = require('./ref_md5');

const md5 = loadMd5({ browserEnv: true, hasSuccessAlert: true });

function rndStr(n) {
  let s = '';
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./:';
  for (let i = 0; i < n; i++) s += pool[Math.floor(Math.random() * pool.length)];
  return s;
}

const inputs = [];
for (let n = 0; n <= 130; n++) inputs.push(rndStr(n));
inputs.push('/api/question/2317600000000001', '/api/question/2317600000000002',
  '/api/question/2317600000000003', '/api/question/2317600000000004', '/api/question/2317600000000005');
for (let i = 0; i < 40; i++) inputs.push(rndStr(30 + Math.floor(Math.random() * 300)));
inputs.push('中文测试内容', '😀 emoji 测试');

const variants = [
  ['canvasNode + IVbrowser + Sstd', { add: addCanvasNode, iv: IV_BROWSER, s: S_STD }],
  ['canvasNode + IVbrowser + Salt', { add: addCanvasNode, iv: IV_BROWSER, s: S_ALT }],
  ['canvasNode + IVfallback + Sstd', { add: addCanvasNode, iv: IV_FALLBACK, s: S_STD }],
  ['canvasNonNode + IVbrowser + Sstd', { add: addCanvasNonNode, iv: IV_BROWSER, s: S_STD }],
  ['catch + IVbrowser + Sstd', { add: addCatch, iv: IV_BROWSER, s: S_STD }],
];

const score = variants.map(() => 0);
for (const s of inputs) {
  const real = md5(s);
  variants.forEach(([, opt], k) => { if (md5Mut(s, opt) === real) score[k]++; });
  if (md5Mut(s, variants[0][1]) !== real) {
    fs.writeSync(1, `MISMATCH len=${Buffer.from(s, 'utf8').length} ${JSON.stringify(s).slice(0, 40)}\n  real=${real}\n  ref =${md5Mut(s, variants[0][1])}\n`);
    break;
  }
}
fs.writeSync(1, `\ninputs=${inputs.length}\n`);
variants.forEach(([name], k) => fs.writeSync(1, `${name}: ${score[k]}/${inputs.length}\n`));
