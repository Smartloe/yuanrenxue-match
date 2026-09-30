/**
 * 把完整 23.js 中的 md5 内部函数（R/S/T/U/V/W/X/Y/Z/a0）暴露出来，
 * 与纯 JS 复刻逐项比对，确认异化点。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./md5env');
const { addCanvasNode, addCanvasNonNode, addCatch } = require('./ref_md5');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', '23.js'), 'utf8');
const injected = src.replace(
  'function md5(P){',
  'function md5(P){try{__probe__({R:R,S:S,T:T,U:U,V:V,W:W,X:X,Y:Y,Z:Z,a0:a0,a1:a1,a2:a2,a3:a3});}catch(e){}'
);

const sandbox = makeSandbox({ browserEnv: true, hasSuccessAlert: true });
let API = null;
sandbox.__probe__ = (o) => { API = o; };
vm.createContext(sandbox);
vm.runInContext(injected, sandbox, { filename: '23.probe.js', timeout: 60000 });
sandbox.md5('probe'); // 触发一次，执行注入的探针
if (!API) { fs.writeSync(2, 'probe 未触发\n'); process.exit(1); }

const { S, T, U, V, W, R } = API;
const rnd = () => Math.floor(Math.random() * 4294967296);

let s1 = 0, s2 = 0, s3 = 0, sAdd = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const a = rnd(), b = rnd();
  const r = S(a, b) >>> 0;
  if (r === addCanvasNode(a, b)) s1++;
  if (r === addCanvasNonNode(a, b)) s2++;
  if (r === addCatch(a, b)) s3++;
  if (r === ((a + b) >>> 0)) sAdd++;
}
fs.writeSync(1, `S(a,b)=canvasNode:${s1} canvasNonNode:${s2} catch:${s3} plainAdd:${sAdd} /${N}\n`);
fs.writeSync(1, `S(1,2)=${S(1, 2) >>> 0} addCanvasNode(1,2)=${addCanvasNode(1, 2)}\n`);

const Fstd = (x, y, z) => ((x & y) | (~x & z)) >>> 0;
const Gstd = (x, y, z) => ((x & z) | (y & ~z)) >>> 0;
const Hstd = (x, y, z) => (x ^ y ^ z) >>> 0;
const Istd = (x, y, z) => (y ^ (x | ~z)) >>> 0;
let ct = 0, cu = 0, cv = 0, cw = 0, cr = 0;
for (let i = 0; i < 5000; i++) {
  const x = rnd(), y = rnd(), z = rnd(), n = 1 + (i % 31);
  if ((T(x, y, z) >>> 0) === Fstd(x, y, z)) ct++;
  if ((U(x, y, z) >>> 0) === Gstd(x, y, z)) cu++;
  if ((V(x, y, z) >>> 0) === Hstd(x, y, z)) cv++;
  if ((W(x, y, z) >>> 0) === Istd(x, y, z)) cw++;
  if ((R(x, n) >>> 0) === (((x << n) | (x >>> (32 - n))) >>> 0)) cr++;
}
fs.writeSync(1, `T~F:${ct} U~G:${cu} V~H:${cv} W~I:${cw} R~rol:${cr} /5000\n`);
