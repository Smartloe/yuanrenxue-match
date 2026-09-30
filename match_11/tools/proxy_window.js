/**
 * 在 Node 沙箱里用 Proxy 包住 window 运行原始混淆文件，
 * 记录 VM 对 window 的每一次读写 —— 找出它到底在什么条件下写 SecretKey / secretkey。
 *
 * 用法：node tools/proxy_window.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'static', 'devtools_jsvmp.js'), 'utf8');
const out = [];
const log = (...a) => { if (out.length < 4000) out.push(a.join(' ')); };

function makeEl() {
  return {
    style: {}, id: '', src: '', name: '',
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getContext: () => null, toDataURL: () => 'data:,', contentWindow: undefined, contentDocument: undefined,
    innerHTML: '', textContent: '', parentNode: null, firstChild: null, children: [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    contains() { return false; }, closest() { return null; },
  };
}

const sandbox = {};
Object.assign(sandbox, {
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, dir() {}, table() {}, clear() {}, trace() {}, group() {}, groupEnd() {} },
  document: {
    createElement: (t) => {
      const el = makeEl();
      if (String(t).toLowerCase() === 'iframe') {
        // 给 iframe 一个"干净"的 contentWindow
        const w = makeCleanWindow();
        Object.defineProperty(el, 'contentWindow', { get: () => w, configurable: true });
        Object.defineProperty(el, 'contentDocument', { get: () => w.document, configurable: true });
      }
      return el;
    },
    documentElement: makeEl(), body: makeEl(), head: makeEl(),
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {}, createEvent: () => ({ initEvent() {} }),
    cookie: 'sessionid=test-session', readyState: 'complete', visibilityState: 'visible',
    hasFocus: () => true, write() {}, writeln() {}, open() {}, close() {},
  },
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', platform: 'MacIntel', languages: ['zh-CN', 'zh'], plugins: { length: 5 }, webdriver: false, hardwareConcurrency: 8, deviceMemory: 8 },
  location: { href: 'https://match.yuanrenxue.cn/match/11', search: '', hash: '', protocol: 'https:', host: 'match.yuanrenxue.cn', hostname: 'match.yuanrenxue.cn', pathname: '/match/11', assign() {}, replace() {}, reload() {} },
  screen: { width: 1440, height: 900, availWidth: 1440, availHeight: 875, colorDepth: 24, pixelDepth: 24 },
  localStorage: makeStorage(), sessionStorage: makeStorage(),
  performance: { now: () => Date.now() - startTs, timing: {}, memory: {} },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16), cancelAnimationFrame: () => {},
  Date, Math, JSON, RegExp, Error, TypeError, String, Number, Boolean, Array, Object, Function, Promise, Symbol,
  Map, Set, WeakMap, WeakSet, Proxy, Reflect, Uint8Array, Uint8ClampedArray, Int32Array, ArrayBuffer, DataView,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  XMLHttpRequest: function () {}, Image: function () {}, Node: function () {}, EventTarget: function () {},
  HTMLElement: function () {}, HTMLIFrameElement: function () {}, HTMLImageElement: function () {},
  Event: function () {}, KeyboardEvent: function () {}, MouseEvent: function () {},
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  alert() {}, confirm: () => false, prompt: () => null,
  jQuery: undefined,
});
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.frames = [];
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}
function makeCleanWindow() {
  const w = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, dir() {}, clear() {}, table() {} },
    document: sandbox.document, navigator: sandbox.navigator, location: sandbox.location,
    postMessage() {}, addEventListener() {}, removeEventListener() {},
  };
  w.window = w; w.self = w; w.top = w;
  return w;
}

const startTs = Date.now();
const context = vm.createContext(sandbox);

// 关键：window 用 Proxy 包住，记录所有读写
const watched = new Set(['SecretKey', 'secretkey', 'randomString', 'initDevtoolsTrap', 'DevtoolsTrap', 'match1', 'onInit', 'secretKey']);
const winProxy = new Proxy(sandbox, {
  get(t, p, r) {
    const v = Reflect.get(t, p, r);
    if (typeof p === 'string' && watched.has(p)) log(`[get window.${p}] -> ${typeof v}`);
    return v;
  },
  set(t, p, v, r) {
    if (typeof p === 'string' && (watched.has(p) || /secret|random|trap/i.test(p))) {
      log(`[set window.${p}] = ${typeof v} ${typeof v === 'function' ? (String(v).slice(0, 40)) : String(v).slice(0, 60)}`);
    }
    return Reflect.set(t, p, v, r);
  },
  has(t, p) { return Reflect.has(t, p); },
});
sandbox.window = winProxy;
sandbox.self = winProxy;

try {
  vm.runInContext(code, context, { filename: 'devtools_jsvmp.js', timeout: 60000 });
} catch (e) {
  log('[顶层异常] ' + String(e.message).slice(0, 200));
}

setTimeout(() => {
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'window_proxy_log.txt'), out.join('\n'));
  process.stdout.write(`[窗口读写日志 ${out.length} 条] 已写入 docs/window_proxy_log.txt\n`);
  process.stdout.write(out.slice(0, 60).join('\n') + '\n');
  process.exit(0);
}, 15000);
