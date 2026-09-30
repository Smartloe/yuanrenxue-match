/**
 * 猿人学第 23 题 —— 异化 MD5 的纯 JS 复刻
 *
 * 与标准 MD5 的四处差异（均从混淆源码中还原）：
 *   1. 初始 IV 由「环境感知」决定：
 *        _t = window instanceof EventTarget ? 0x188a7ae93 : 0x26beca73
 *        _u = window instanceof Window      ? 0x127794fb3 : 0x26beca73
 *        _v = typeof WindowProperties !== 'undefined' ? ... : 0x20d90fe7e
 *        _w = document instanceof Document  ? 0x4a5bc3c6  : 0x26beca73
 *      Chrome 里取 (0x188a7ae93, 0x127794fb3, 0x20d90fe7e, 0x4a5bc3c6)。
 *   2. 64 个加法常量 K 表被改写了 10 个（见 MUT_K）。
 *   3. add32 被换成一个位运算混合函数（见 add32），而不是 (a+b)>>>0。
 *   4. 移位表：页面里 successAlert 由 alert.js 定义 → 走标准移位表；
 *      若缺失则走另一套异化移位表（本题浏览器环境是标准表）。
 *   另外明文先经过一个非标准 UTF-8 编码（charCodeAt，不合并代理对）。
 */

// —— 加法常量表（异化版；与标准 MD5 不同的位置已标注） ——
const MUT_K = [
  0xd76aa478, 0x52e641d9 /*std e8c7b756*/, 0x242070db, 0xc1bdceee,
  0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0x0f0d284e /*std ffff5bb1*/, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
  0xd62f105d, 0x02441453, 0xd8a1e681, 0x44ec933e /*std e7d3fbc8*/,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
  0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
  0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4294954 /*std f4292244*/, 0x432a6f0f /*std 432aff97*/, 0xab561297 /*std ab9423a7*/, 0xfc93a039,
  0x57506143 /*std 655b59c3*/, 0x5c00a204 /*std 8f0ccc92*/, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2cbb20 /*std fe2ce6e0*/, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd318bf5 /*std bd3af235*/, 0x2ad7d2bb, 0xeb86c7d9 /*std eb86d391*/,
];

// successAlert 存在时使用的移位表（标准 MD5 移位）
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// Chrome 下环境感知得到的初始 IV
const IV = [0x188a7ae93, 0x127794fb3, 0x20d90fe7e, 0x4a5bc3c6].map((v) => v >>> 0);

/**
 * 异化 add32（源码里 funcEverybodyProgram 的浏览器分支）：
 *   document.createElement('canvas') instanceof Node === true
 * 注意它不是 (a+b)>>>0，而是下面这串位运算。
 */
function add32(a, b) {
  a >>>= 0; b >>>= 0;
  const g = 0x7fffffc0 & a;
  const e = 0x7fffffa3 & b;
  const t = 0x61fb6dc & a;
  const p = 0x3ce68b00 & b;
  const c = ((0x3fffffc1 & a) + (0x400bbfcf & b)) >>> 0;
  if (t & p) return (((0x7ffff63c ^ c) ^ g) ^ e) >>> 0;
  if (t | p) {
    return (0x3ff837d0 & c)
      ? ((((0xc0057e40 ^ c) ^ g) ^ e) >>> 0)
      : ((((0x4000c350 ^ c) ^ g) ^ e) >>> 0);
  }
  return ((c ^ g) ^ e) >>> 0;
}

/** 源码里的 UTF-8 编码（funcBankTobacco）：按 charCodeAt 编码，不合并代理对 */
function utf8Encode(str) {
  const s = String(str).replace(/\r\n/g, '\n');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) out += String.fromCharCode(c);
    else if (c > 127 && c < 2048) {
      out += String.fromCharCode((c >> 6) | 192);
      out += String.fromCharCode((c & 63) | 128);
    } else {
      out += String.fromCharCode((c >> 12) | 224);
      out += String.fromCharCode(((c >> 6) & 63) | 128);
      out += String.fromCharCode((c & 63) | 128);
    }
  }
  return out;
}

/** 明文 → 32 位字数组（funcGravitySilly，小端 + MD5 填充） */
function toWordArray(str) {
  const words = [];
  const len = str.length;
  const paddedLen = len + 8;
  const blocks = (paddedLen - (paddedLen % 64)) / 64;
  const total = 16 * (blocks + 1);
  const arr = new Array(total - 1);
  let i = 0;
  while (len > i) {
    const word = (i - (i % 4)) / 4;
    const shift = (i % 4) * 8;
    arr[word] = arr[word] | (str.charCodeAt(i) << shift);
    i++;
  }
  const word = (i - (i % 4)) / 4;
  const shift = (i % 4) * 8;
  arr[word] = arr[word] | (128 << shift);
  arr[total - 2] = len << 3;
  arr[total - 1] = len >>> 29;
  return arr;
}

const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const toHexLE = (n) => {
  let s = '';
  for (let i = 0; i < 4; i++) {
    const b = (n >>> (8 * i)) & 255;
    s += ('0' + b.toString(16)).slice(-2);
  }
  return s;
};

/** 异化 MD5 */
function md5(input) {
  const words = toWordArray(utf8Encode(input));
  let a0 = IV[0], b0 = IV[1], c0 = IV[2], d0 = IV[3];

  for (let off = 0; off < words.length; off += 16) {
    const sa = a0, sb = b0, sc = c0, sd = d0;
    let a = a0, b = b0, c = c0, d = d0;

    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (b & d) | (c & ~d); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }

      // 顺序与源码一致：add(a, add(add(F, X), K)) → rol → add(., b)
      const t1 = add32(f >>> 0, words[off + g] >>> 0);
      const t2 = add32(t1, MUT_K[i]);
      const t3 = add32(a, t2);
      const t4 = rol(t3, SHIFT[i]);
      const n = add32(t4, b);

      const nd = c; c = b; b = n; a = d; d = nd;
    }

    a0 = add32(a, sa); b0 = add32(b, sb); c0 = add32(c, sc); d0 = add32(d, sd);
  }

  return (toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0)).toLowerCase();
}

/** token = md5(接口路径 + now + page) */
function makeToken(apiPath, now, page) {
  return md5(apiPath + now + page);
}

module.exports = { md5, makeToken, add32, utf8Encode, toWordArray, MUT_K, SHIFT, IV };
