/**
 * 截获 VM 内部 eval 出来的载荷（外层解码器解出来的内层代码）。
 * 混淆文件形如 `var yxr = eval(<解码后的字符串>)`，
 * 只要在沙箱里替换 eval，就能把解码后的源码落盘，便于静态分析。
 *
 * 用法：node tools/dump_eval.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT_DIR = path.join(__dirname, '..', 'docs');
const code = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');

const captured = [];
let sandbox;

sandbox = {
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, dir() {}, table() {}, clear() {}, trace() {} },
  document: {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null }),
    documentElement: {}, body: { appendChild() {}, removeChild() {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    getElementsByTagName: () => [], cookie: '',
  },
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', platform: 'MacIntel', languages: ['zh-CN'] },
  location: { href: 'https://match.yuanrenxue.cn/match/11', search: '', protocol: 'https:' },
  setTimeout, setInterval: () => 0, clearTimeout, clearInterval: () => {},
  Date, Math, JSON, RegExp, Error, TypeError, String, Number, Boolean,
  Array, Object, Function, Promise, Symbol, Map, Set, WeakMap, WeakSet, Proxy, Reflect,
  Uint8Array, Uint8ClampedArray, Int32Array, ArrayBuffer, DataView,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  XMLHttpRequest: function () {},
  Image: function () {},
  Node: function () {},
  EventTarget: function () {},
  jQuery: Object.assign(function () { const c = new Proxy(function () {}, { get: () => () => c, apply: () => c }); return c; }, { ajax: () => ({ done: () => ({ fail: () => ({ always: () => ({}) }) }) }), trim: (s) => String(s || '').trim() }),
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

// 捕获 eval 的入参（VM 解码后的内层源码）
let evalCount = 0;
sandbox.eval = function (src) {
  evalCount++;
  // eval 的入参可能是"代码片段数组"，此时必须 join('') 才是真正的源码
  const isArr = Array.isArray(src);
  const code = isArr ? src.join('') : String(src);
  const p = path.join(OUT_DIR, `eval_payload_${evalCount}.js`);
  try { fs.writeFileSync(p, code); } catch { /* ignore */ }
  fs.writeSync(1, `[+] 捕获 eval #${evalCount}: 类型=${isArr ? 'Array(' + src.length + ')' : typeof src} 源码 ${code.length} 字节 -> ${p}\n`);
  return vm.runInContext(code, context, { filename: `eval_payload_${evalCount}.js`, timeout: 60000 });
};
sandbox.Function = function (...args) {
  const body = args.length ? String(args[args.length - 1]) : '';
  if (body.length > 200 && evalCount < 3) {
    evalCount++;
    const p = path.join(OUT_DIR, `eval_payload_${evalCount}_Function.js`);
    try { fs.writeFileSync(p, body); } catch { /* ignore */ }
    fs.writeSync(1, `[+] 捕获 Function 构造 #${evalCount}: ${body.length} 字节 -> ${p}\n`);
  }
  return Function.apply(null, args);
};
sandbox.Function.prototype = Function.prototype;

const context = vm.createContext(sandbox);

try {
  vm.runInContext(code, context, { filename: 'devtools_jsvmp.js', timeout: 60000 });
} catch (e) {
  fs.writeSync(1, `[!] 顶层执行异常（不影响载荷捕获）: ${String(e.message).slice(0, 200)}\n`);
}
fs.writeSync(1, `[*] eval 调用次数: ${evalCount}\n`);
fs.writeSync(1, `[*] 全局 yxr: ${typeof sandbox.yxr}\n`);
