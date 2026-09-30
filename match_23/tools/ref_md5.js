/**
 * 23.js 中“异化 MD5”的纯 JS 复刻（差分对拍用）。
 *
 * 与原版 MD5 的差异：
 *   1. add32 被替换成一个位运算混合函数（按分支不同有 3 套常量）；
 *   2. 初始 IV 由环境感知决定（instanceof 检测）；
 *   3. 移位表由 successAlert 是否存在决定。
 */

// —— 异化 add32：三个分支（浏览器走第 1 支） ——
function addCanvasNode(a, b) {
  a >>>= 0; b >>>= 0;
  const g = 0x7fffffc0 & a, e = 0x7fffffa3 & b;
  const t = 0x61fb6dc & a, p = 0x3ce68b00 & b;
  const c = ((0x3fffffc1 & a) + (0x400bbfcf & b)) >>> 0;
  if (t & p) return (((0x7ffff63c ^ c) ^ g) ^ e) >>> 0;
  if (t | p) {
    return (0x3ff837d0 & c)
      ? ((((0xc0057e40 ^ c) ^ g) ^ e) >>> 0)
      : ((((0x4000c350 ^ c) ^ g) ^ e) >>> 0);
  }
  return ((c ^ g) ^ e) >>> 0;
}
function addCanvasNonNode(a, b) {
  a >>>= 0; b >>>= 0;
  const g = 0x7fffffc0 & a, e = 212313555 & b;
  const t = 102123324 & a, p = 102123424 & b;
  const c = ((1077231761 & a) + (1071511823 & b)) >>> 0;
  if (t & p) return (((2147231148 ^ c) ^ g) ^ e) >>> 0;
  if (t | p) {
    return (1032681824 & c)
      ? ((((3221003472 ^ c) ^ g) ^ e) >>> 0)
      : ((((1073791824 ^ c) ^ g) ^ e) >>> 0);
  }
  return ((c ^ g) ^ e) >>> 0;
}
function addCatch(a, b) {
  a >>>= 0; b >>>= 0;
  const g = 2147213584 & a, e = 2123201555 & b;
  const t = 1021121724 & a, p = 1020041824 & b;
  const c = ((1073741510 & a) + (1074511823 & b)) >>> 0;
  if (t & p) return (((2147401148 ^ c) ^ g) ^ e) >>> 0;
  if (t | p) {
    return (127321124 & c)
      ? ((((323385472 & c) ^ g) ^ e) >>> 0)
      : ((((1073591824 ^ c) ^ g) ^ e) >>> 0);
  }
  return ((c ^ g) ^ e) >>> 0;
}

const MUT_K = [
  0xd76aa478, 0x52e641d9, 0x242070db, 0xc1bdceee,
  0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0x0f0d284e, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
  0xd62f105d, 0x02441453, 0xd8a1e681, 0x44ec933e,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
  0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
  0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4294954, 0x432a6f0f, 0xab561297, 0xfc93a039,
  0x57506143, 0x5c00a204, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2cbb20, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd318bf5, 0x2ad7d2bb, 0xeb86c7d9,
];

// successAlert 存在（浏览器）→ 标准移位表
const S_STD = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
// successAlert 缺失 → 被异化的移位表
const S_ALT = [7, 8, 5, 7, 7, 8, 5, 7, 7, 8, 5, 7, 7, 8, 5, 7,
  15, 14, 20, 4, 15, 14, 20, 4, 15, 14, 20, 4, 15, 14, 20, 4,
  11, 22, 8, 9, 11, 22, 8, 9, 11, 22, 8, 9, 11, 22, 8, 9,
  20, 13, 6, 10, 20, 13, 6, 10, 20, 13, 6, 10, 20, 13, 6, 10];

const IV_BROWSER = [6587657875, 4957228979, 8817540734, 1247527878].map((v) => v >>> 0);
const IV_FALLBACK = [6587557875, 6587557875, 8817540734, 6587557875].map((v) => v >>> 0);

function rol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

function md5Mut(str, { add = addCanvasNode, iv = IV_BROWSER, s = S_STD } = {}) {
  const bytes = Buffer.from(String(str), 'utf8');
  const bitLen = bytes.length * 8;
  const total = (((bytes.length + 8) >> 6) + 1) * 64;
  const buf = Buffer.alloc(total);
  bytes.copy(buf);
  buf[bytes.length] = 0x80;
  buf.writeUInt32LE(bitLen >>> 0, total - 8);
  buf.writeUInt32LE(Math.floor(bitLen / 0x100000000) >>> 0, total - 4);

  let [A0, B0, C0, D0] = iv.map((v) => v >>> 0);
  const X = new Uint32Array(16);
  const F = (i, b, c, d) => {
    if (i < 16) return ((b & c) | (~b & d)) >>> 0;
    if (i < 32) return ((b & d) | (c & ~d)) >>> 0;
    if (i < 48) return (b ^ c ^ d) >>> 0;
    return (c ^ (b | ~d)) >>> 0;
  };
  const G = (i) => (i < 16 ? i : i < 32 ? (5 * i + 1) % 16 : i < 48 ? (3 * i + 5) % 16 : (7 * i) % 16);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) X[i] = buf.readUInt32LE(off + i * 4);
    let a = A0, b = B0, c = C0, d = D0;
    const sa = a, sb = b, sc = c, sd = d;
    for (let i = 0; i < 64; i++) {
      // a = add(rol(add(a, add(add(F(b,c,d), X), K)), s), b)
      const t1 = add(F(i, b, c, d), X[G(i)]);
      const t2 = add(t1, MUT_K[i]);
      const t3 = add(a, t2);
      const t4 = rol(t3, s[i]);
      const n = add(t4, b);
      const nd = c; c = b; b = n; a = d; d = nd; // (a,b,c,d) <- (d_old, n, b, c)
      void 0;
    }
    A0 = add(a, sa); B0 = add(b, sb); C0 = add(c, sc); D0 = add(d, sd);
  }
  const out = Buffer.alloc(16);
  out.writeUInt32LE(A0 >>> 0, 0); out.writeUInt32LE(B0 >>> 0, 4);
  out.writeUInt32LE(C0 >>> 0, 8); out.writeUInt32LE(D0 >>> 0, 12);
  return out.toString('hex');
}

module.exports = { md5Mut, addCanvasNode, addCanvasNonNode, addCatch, MUT_K, S_STD, S_ALT, IV_BROWSER, IV_FALLBACK };
