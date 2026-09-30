/**
 * 在最小 DOM 垫片下加载原始混淆 23.js，导出全局 md5 供差分分析。
 * 仅用于逆向分析阶段（最终交付不依赖它）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }),
        fillText() {}, measureText: () => ({ width: 1 }), save() {}, restore() {},
      };
    },
    toDataURL: () => 'data:image/png;base64,',
  };
}

function makeSandbox() {
  const sandbox = {};
  const win = {};
  Object.assign(sandbox, {
    window: win, self: win, globalThis: sandbox,
    document: {
      createElement: () => makeCanvas(),
      documentElement: {}, body: {},
      querySelector: () => null,
      addEventListener() {},
      cookie: '',
    },
    navigator: { userAgent: 'yuanrenxue', platform: 'MacIntel', languages: ['zh-CN'] },
    location: { href: 'https://match.yuanrenxue.cn/match/23', search: '', protocol: 'https:' },
    console,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, RegExp, Error, String, Number, Boolean, Array, Object,
    Uint8Array, Uint8ClampedArray, Int32Array, ArrayBuffer, DataView,
    Promise, Symbol, Map, Set, WeakMap, WeakSet, Proxy, Reflect,
    Function, eval,
    XMLHttpRequest: function () {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  win.document = sandbox.document;
  win.navigator = sandbox.navigator;
  win.location = sandbox.location;
  win.setInterval = sandbox.setInterval;
  win.setTimeout = sandbox.setTimeout;
  win.console = console;
  // jQuery 桩：只记录 ajax 调用，不真正发请求
  const $ = function () {
    const chain = new Proxy(function () {}, {
      get: (t, p) => (p === 'val' ? () => '' : p === 'text' || p === 'html' || p === 'css'
        || p === 'on' || p === 'prop' || p === 'add' || p === 'find' || p === 'each'
        || p === 'data' || p === 'toggleClass' ? () => chain : () => chain),
      apply: () => chain,
    });
    return chain;
  };
  $.ajax = (opts) => { sandbox.__ajaxCalls = sandbox.__ajaxCalls || []; sandbox.__ajaxCalls.push(opts); };
  $.trim = (s) => String(s == null ? '' : s).trim();
  $.param = () => '';
  sandbox.$ = $;
  win.$ = $;
  win.jQuery = $;
  return sandbox;
}

const code = fs.readFileSync(path.join(__dirname, '..', 'static', '23.js'), 'utf8');
const sandbox = makeSandbox();
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: '23.js', timeout: 30000 });
} catch (e) {
  console.error('[load error]', e.message);
}
require('fs').writeSync(1, 'typeof md5 = ' + typeof sandbox.md5 + '\n');
if (typeof sandbox.md5 === 'function') {
  try { require('fs').writeSync(1, 'md5(abc) = ' + sandbox.md5('abc') + '\n'); } catch (e) { require('fs').writeSync(1, 'md5 err: ' + e.message + '\n'); }
}
module.exports = { sandbox, md5: sandbox.md5 };
