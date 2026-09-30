/**
 * challenge30.wasm 的纯 JS 等价实现
 *
 * 原始 WASM 模块只有 696 字节，导出 memory + encrypt(ptr, len)，
 * 导入 env.random_byte() -> i32。encrypt 就地把 ptr 处 len 字节加密为 len+1 字节。
 *
 * 本文件是 WASM 字节码的逐指令翻译，不依赖 WebAssembly，可直接在浏览器/Node 中运行。
 */

// 由 body1（查表函数）反汇编得到的常量表
const TAB = [55, 169, 92, 225, 130, 77, 22, 183];

/**
 * body0：8 位循环左移。s 只有低 3 位有效。
 *   ((v << (s&7)) | (v >>> (8-(s&7)))) & 255
 */
function rol8(v, s) {
  const k = s & 7;
  return ((v << k) | (v >>> (8 - k))) & 0xff;
}

/** body1：x % 8 查表 */
function t8(x) {
  return TAB[x % 8];
}

/**
 * body2：单字节核心变换。
 *   v = b ^ t8(i + r)
 *   v = (v + 61 + i*23 + r*41) & 255
 *   v = rol8(v, i + r + 3)
 *   v = v ^ ((i*49 + r*71) & 255)
 *   v = (v + (i ^ r) * 19) & 255
 */
function mix(b, i, r) {
  let v = b ^ t8(i + r);
  v = (v + 61 + i * 23 + r * 41) & 0xff;
  v = rol8(v, i + r + 3);
  v = v ^ ((i * 49 + r * 71) & 0xff);
  v = (v + (i ^ r) * 19) & 0xff;
  return v;
}

/**
 * body3：encrypt(ptr, len)
 *
 * 1. R = random_byte() & 255；len == 0 时只写 mem[0] = R 后返回
 * 2. 倒序右移一字节：mem[i+1] = mem[i]（i 从 len-1 到 0），末字节被挤掉
 * 3. mem[0] = R
 * 4. 位置相关异或：mem[1+i] ^= (i*91 + 167) & 255
 * 5. 4 轮（round = 0..3）：
 *      a. mem[1+i] = mix(mem[1+i], i, round)
 *      b. 双指针对撞 i=0,j=len-1，当 (i+j+round) 为偶数时交换 mem[1+i] 与 mem[1+j]
 * 6. 末轮整体异或：mem[1+i] ^= R
 *
 * @param {Uint8Array|number[]} input 明文
 * @param {number} r random_byte() 的返回值，本题页面写死为 1
 * @returns {Uint8Array} 密文，长度 = input.length + 1
 */
function encrypt(input, r = 1) {
  const len = input.length;
  const R = r & 0xff;
  const out = new Uint8Array(len + 1);

  if (len === 0) {
    out[0] = R;
    return out;
  }

  for (let i = len - 1; i >= 0; i--) {
    out[i + 1] = input[i];
  }
  out[0] = R;

  for (let i = 0; i < len; i++) {
    out[1 + i] ^= (i * 91 + 167) & 0xff;
  }

  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < len; i++) {
      out[1 + i] = mix(out[1 + i], i, round);
    }
    for (let i = 0, j = len - 1; i < j; i++, j--) {
      if (((i + j + round) & 1) === 0) {
        const t = out[1 + i];
        out[1 + i] = out[1 + j];
        out[1 + j] = t;
      }
    }
  }

  for (let i = 0; i < len; i++) {
    out[1 + i] ^= R;
  }

  return out;
}

/**
 * 生成题目 token。
 * 明文 = "/api/question/30" + now + "30" + "(!)" + page
 *
 * @param {number|string} now  13 位毫秒时间戳，必须与 URL 上的 now 参数一致
 * @param {number} page        页码
 * @returns {string} 72 位小写 hex
 */
function makeToken(now, page) {
  const plain = `/api/question/30${now}30(!)${page}`;
  const input = new TextEncoder().encode(plain);
  return Buffer.from(encrypt(input, 1)).toString('hex');
}

module.exports = { encrypt, makeToken, rol8, t8, mix };
