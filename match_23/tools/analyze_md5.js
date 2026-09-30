/**
 * 差分分析：验证「23.js 的 md5」是否等价于「自定义 IV 的标准 MD5」。
 */
const fs = require('fs');
const { loadMd5 } = require('./md5env');

const STD_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];
const STD_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function rol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function add() { let s = 0; for (const a of arguments) s = (s + a) >>> 0; return s; }

function md5ref(str, IV, K = STD_K, S = STD_S) {
  const bytes = Buffer.from(str, 'utf8');
  const bitLen = bytes.length * 8;
  const withPad = Buffer.alloc((((bytes.length + 8) >> 6) + 1) * 64);
  bytes.copy(withPad);
  withPad[bytes.length] = 0x80;
  withPad.writeUInt32LE(bitLen >>> 0, withPad.length - 8);
  withPad.writeUInt32LE(Math.floor(bitLen / 0x100000000) >>> 0, withPad.length - 4);

  let [a0, b0, c0, d0] = IV.map((v) => v >>> 0);
  const X = new Uint32Array(16);

  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) X[i] = withPad.readUInt32LE(off + i * 4);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (B & C) | (~B & D); g = i; }
      else if (i < 32) { f = (B & D) | (C & ~D); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { f = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D;
      D = C;
      C = B;
      B = add(B, rol(add(A, f >>> 0, K[i], X[g]), S[i]));
      A = tmp;
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  const out = Buffer.alloc(16);
  out.writeUInt32LE(a0, 0); out.writeUInt32LE(b0, 4);
  out.writeUInt32LE(c0, 8); out.writeUInt32LE(d0, 12);
  return out.toString('hex');
}

const IV_ENV_BROWSER = [6587657875, 4957228979, 8817540734, 1247527878];
const IV_ENV_NODE = [650037875, 650037875, 8817540734, 6587557875];

const md5 = loadMd5({ browserEnv: true, hasSuccessAlert: true });
const md5NoSucc = loadMd5({ browserEnv: true, hasSuccessAlert: false });

const inputs = ['', 'abc', 'a', 'message digest', 'abcdefghijklmnopqrstuvwxyz',
  '/api/question/2317560000000001', 'The quick brown fox jumps over the lazy dog',
  'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), '中文测试', '1234567890'];

const K_MANGLED_T2 = STD_K.slice();
K_MANGLED_T2[1] = 5685789145 >>> 0;

fs.writeSync(1, 'input | real(succ,browser) | ref(IVb,Kstd) | ref(IVb,KmangledT2) | real(noSucc)\n');
for (const s of inputs) {
  const real = md5(s);
  const ref1 = md5ref(s, IV_ENV_BROWSER, STD_K, STD_S);
  const ref2 = md5ref(s, IV_ENV_BROWSER, K_MANGLED_T2, STD_S);
  const realNs = md5NoSucc(s);
  const tag = (real === ref1 ? 'K-STD!' : real === ref2 ? 'K-T2!' : '      ');
  fs.writeSync(1, `${JSON.stringify(s).slice(0, 30)} | ${real} | ${ref1} | ${ref2} | ${realNs} ${tag}\n`);
}
