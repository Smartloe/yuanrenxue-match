/**
 * 自检：把 utils/crypto.js 的纯 JS 实现与原始 challenge30.wasm 对拍。
 * 覆盖所有边界长度 + 3000 组随机输入 + 真实 token 明文。
 *
 * 运行：node test/fuzz.js
 */

const fs = require('fs');
const path = require('path');
const { encrypt: jsEncrypt, makeToken } = require('../utils/crypto');

const wasmBytes = fs.readFileSync(path.join(__dirname, '../wasm/challenge30.wasm'));

let rndSeq = [];
const importObject = { env: { random_byte: () => (rndSeq.length ? rndSeq.shift() : 1) } };

function wasmEncrypt(inputBytes, r) {
  rndSeq = [r];
  const mod = new WebAssembly.Module(wasmBytes);
  const inst = new WebAssembly.Instance(mod, importObject);
  const { memory, encrypt } = inst.exports;
  const mem = new Uint8Array(memory.buffer);
  const ptr = 1024;
  mem.set(inputBytes, ptr);
  encrypt(ptr, inputBytes.length);
  return Array.from(mem.slice(ptr, ptr + inputBytes.length + 1));
}

function randBytes(n) {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}

let pass = 0;
let fail = 0;

function check(inp, r) {
  const a = wasmEncrypt(inp, r);
  const b = Array.from(jsEncrypt(inp, r));
  if (a.length === b.length && a.every((v, i) => v === b[i])) pass++;
  else {
    fail++;
    if (fail <= 3) {
      console.log(`MISMATCH len=${inp.length} r=${r}`);
      console.log('  wasm =', a.join(','));
      console.log('  js   =', b.join(','));
    }
  }
}

for (const len of [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 35, 36, 64, 100, 255, 256, 300]) {
  for (let t = 0; t < 20; t++) check(randBytes(len), Math.floor(Math.random() * 256));
}

for (let t = 0; t < 3000; t++) {
  check(randBytes(Math.floor(Math.random() * 80)), Math.floor(Math.random() * 256));
}

// 真实明文（长度固定 35），并校验已知真实 token
for (const now of ['1758988888888', '1790488553269', '1790610138912']) {
  for (let page = 1; page <= 5; page++) {
    const inp = new TextEncoder().encode(`/api/question/30${now}30(!)${page}`);
    if (inp.length !== 35) throw new Error('明文长度应为 35，实际 ' + inp.length);
    check(inp, 1);
  }
}

const known = [
  ['1790488553269', 1, '019e0dc022fd31a49d4bd034c6e2263156acc369a7b0ae6b12c1a698d76075982536e09f'],
  ['1790520181020', 1, '019e0dc022fd31a49d4bd034c6e2263156acc369a7ec2a5901812718ece375982536e09f'],
  ['1790520183022', 2, '019e0dc022fd31a49d4bd034c6e2263156acc369a7ec2a590181a618ec6375982536e05c'],
  ['1790520185031', 3, '019e0dc022fd31a49d4bd034c6e2263156acc369a7ec2a5901814218ad2375982536e01f'],
];
let knownOk = 0;
for (const [now, page, want] of known) {
  const got = makeToken(now, page);
  if (got === want) knownOk++;
  else console.log(`KNOWN TOKEN MISMATCH now=${now} page=${page}\n  want=${want}\n  got =${got}`);
}

console.log(`对拍通过 ${pass} 组，失败 ${fail} 组；真实 token 命中 ${knownOk}/${known.length}`);
process.exit(fail === 0 && knownOk === known.length ? 0 : 1);
