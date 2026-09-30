/**
 * 在“浏览器等价”的最小环境下加载 23.js，取出其中的 md5。
 *
 * 关键点：23.js 里的 md5 会做环境感知（instanceof EventTarget/Window/Document、
 * successAlert 是否存在）来决定初始 IV 与移位表，因此必须在与 Chrome 相同的分支下执行。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSandbox({ browserEnv = true, hasSuccessAlert = true } = {}) {
  const sandbox = {};
  const out = { writes: [] };

  class EventTargetStub {}
  class WindowStub extends EventTargetStub {}
  class DocumentStub {}
  class NodeStub {}

  const documentStub = new DocumentStub();
  // 必须返回 instanceof Node 的对象，否则会走 add32 的“非 Node”分支
  documentStub.createElement = () => Object.assign(new NodeStub(), {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, fillText() {}, measureText: () => ({ width: 1 }) }),
    toDataURL: () => 'data:image/png;base64,',
  });
  documentStub.querySelector = () => null;
  documentStub.addEventListener = () => {};
  documentStub.cookie = '';
  documentStub.documentElement = {};
  documentStub.body = {};

  const navigatorStub = { userAgent: 'yuanrenxue', platform: 'MacIntel', languages: ['zh-CN'] };
  const locationStub = { href: 'https://match.yuanrenxue.cn/match/23', search: '', protocol: 'https:' };

  const jQuery = function () {
    const chain = new Proxy(function () {}, {
      get: (t, p) => (p === 'val' ? () => '' : () => chain),
      apply: () => chain,
    });
    return chain;
  };
  jQuery.ajax = () => {};
  jQuery.trim = (s) => String(s == null ? '' : s).trim();
  jQuery.param = () => '';

  Object.assign(sandbox, {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, table() {} },
    document: documentStub,
    navigator: navigatorStub,
    location: locationStub,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, RegExp, Error, TypeError, String, Number, Boolean,
    Array, Object, Function, eval,
    Uint8Array, Uint8ClampedArray, Int8Array, Int32Array, ArrayBuffer, DataView,
    Promise, Symbol, Map, Set, WeakMap, WeakSet, Proxy, Reflect,
    XMLHttpRequest: function () {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Node: NodeStub,
    EventTarget: EventTargetStub,
    $: jQuery,
    __out: out,
  });

  let windowObj;
  if (browserEnv) {
    // Chrome：window instanceof EventTarget/Window 为真；WindowProperties 未定义
    sandbox.Window = WindowStub;
    sandbox.Document = DocumentStub;
    windowObj = new WindowStub();
  } else {
    windowObj = sandbox;
  }
  Object.assign(windowObj, {
    document: documentStub, navigator: navigatorStub, location: locationStub,
    jQuery, $: jQuery, setTimeout, setInterval: () => 0,
    console: sandbox.console,
  });
  sandbox.window = windowObj;
  sandbox.self = windowObj;
  sandbox.globalThis = sandbox;

  if (hasSuccessAlert) {
    // alert.js 在页面里定义了 successAlert，缺失会走“异化”分支
    sandbox.successAlert = function () {};
    sandbox.failedAlert = function () {};
    windowObj.successAlert = sandbox.successAlert;
  }

  return sandbox;
}

function loadMd5(opts) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'static', '23.js'), 'utf8');
  const sandbox = makeSandbox(opts);
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: '23.js', timeout: 60000 });
  } catch (e) {
    fs.writeSync(2, '[load error] ' + e.message + '\n');
  }
  return sandbox.md5;
}

module.exports = { loadMd5, makeSandbox };

if (require.main === module) {
  const md5 = loadMd5({ browserEnv: true, hasSuccessAlert: true });
  fs.writeSync(1, 'typeof md5=' + typeof md5 + '\n');
  for (const s of ['', 'abc', 'a', 'message digest', 'abcdefghijklmnopqrstuvwxyz']) {
    fs.writeSync(1, JSON.stringify(s) + ' -> ' + md5(s) + '\n');
  }
}
