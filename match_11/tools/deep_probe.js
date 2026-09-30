/**
 * 深度探查第11题 VM 的行为：hook XMLHttpRequest / fetch / 导航 / console，
 * 并 dump VM 暴露的全局（SecretKey / secretkey 等）。
 *
 * 用法：node tools/deep_probe.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 15000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const events = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => events.push({ kind: 'jsdomError', msg: String(e.message).slice(0, 200), stack: String(e.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 300) }));
vc.on('error', (...a) => events.push({ kind: 'console.error', msg: a.map(String).join(' ').slice(0, 200) }));

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // 1) console 全程记录
    window.__calls = [];
    const real = window.console;
    const rec = (name, fn) => function (...args) {
      window.__calls.push(`[${name}] ` + args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' '));
      try { if (typeof fn === 'function') return fn.apply(real, args); } catch { /* ignore */ }
    };
    const proxy = {};
    for (const n of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group', 'groupEnd', 'clear', 'assert', 'count', 'time', 'timeEnd']) proxy[n] = rec(n, real && real[n]);
    window.console = new Proxy(proxy, {
      get: (t, p) => (p in t ? t[p] : (typeof real[p] === 'function' ? rec(String(p), real[p]) : real[p])),
      set: (t, p, v) => { t[p] = typeof v === 'function' ? rec(String(p), v) : v; return true; },
    });

    // 1.5) iframe 内 console 也要包住（VM 常用 iframe 取原生 console 绕过钩子）
    const patchConsole = (win) => {
      if (!win || win.__consolePatched) return win;
      win.__consolePatched = true;
      try {
        const r2 = win.console;
        const rec2 = (name, fn) => function (...args) {
          window.__calls.push(`[iframe.${name}] ` + args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' '));
          try { if (typeof fn === 'function') return fn.apply(r2, args); } catch { /* ignore */ }
        };
        const px = {};
        for (const n of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group', 'groupEnd', 'clear', 'assert']) px[n] = rec2(n, r2 && r2[n]);
        win.console = new Proxy(px, {
          get: (t, p) => (p in t ? t[p] : (typeof r2[p] === 'function' ? rec2(String(p), r2[p]) : r2[p])),
          set: (t, p, v) => { t[p] = typeof v === 'function' ? rec2(String(p), v) : v; return true; },
        });
      } catch { /* ignore */ }
      return win;
    };
    for (const proto of [window.HTMLIFrameElement && window.HTMLIFrameElement.prototype].filter(Boolean)) {
      for (const prop of ['contentWindow', 'contentDocument']) {
        const d = Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.get) continue;
        Object.defineProperty(proto, prop, {
          configurable: true,
          get() {
            const v = d.get.call(this);
            if (prop === 'contentWindow') patchConsole(v);
            else if (v && v.defaultView) patchConsole(v.defaultView);
            return v;
          },
        });
      }
    }

    // 2) XHR / fetch 记录
    const XHR = window.XMLHttpRequest;
    window.XMLHttpRequest = class extends XHR {
      open(method, url, ...rest) {
        this.__m = method; this.__u = url;
        events.push({ kind: 'xhr.open', msg: `${method} ${url}` });
        return super.open(method, url, ...rest);
      }
      send(body) {
        events.push({ kind: 'xhr.send', msg: `${this.__m} ${this.__u} body=${String(body).slice(0, 200)}` });
        return super.send(body);
      }
      setRequestHeader(k, v) { events.push({ kind: 'xhr.header', msg: `${k}: ${String(v).slice(0, 120)}` }); return super.setRequestHeader(k, v); }
    };
    if (window.fetch) {
      const of = window.fetch;
      window.fetch = function (input, init) {
        events.push({ kind: 'fetch', msg: `${(init && init.method) || 'GET'} ${typeof input === 'string' ? input : (input && input.url)}` });
        return of.apply(this, arguments);
      };
    }

    // 3) 导航企图
    const loc = window.location;
    for (const m of ['assign', 'replace', 'reload']) {
      try {
        loc[m] = function (u) { events.push({ kind: 'nav.' + m, msg: String(u).slice(0, 200) }); };
      } catch { /* Unforgeable */ }
    }
    try {
      Object.defineProperty(window, 'onbeforeunload', { set() { events.push({ kind: 'beforeunload', msg: 'set' }); }, get: () => null, configurable: true });
    } catch { /* ignore */ }
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  log('=== 事件 ===');
  const seen = new Map();
  for (const e of events) {
    const k = e.kind + '|' + e.msg;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [k, n] of seen) log(`  x${n}  ${k}`.slice(0, 320));

  log('\n=== console 记录 ===');
  const lines = [...new Set(w.__calls || [])];
  log(`共 ${(w.__calls || []).length} 条，去重 ${lines.length} 条`);
  for (const l of lines.slice(0, 30)) log('  ', l.slice(0, 300));

  log('\n=== 全局 ===');
  log('typeof secretkey =', typeof w.secretkey);
  log('typeof SecretKey =', typeof w.SecretKey);
  try { log('SecretKey 值 =', typeof w.SecretKey === 'string' ? w.SecretKey.slice(0, 300) : JSON.stringify(w.SecretKey)); } catch (e) { log('SecretKey 读取失败', e.message); }
  const own = Object.getOwnPropertyNames(w).filter((k) => /secret|yxr|dev|Dev/i.test(k));
  log('相关全局:', JSON.stringify(own));
  for (const k of ['SecretKey']) {
    const d = Object.getOwnPropertyDescriptor(w, k);
    if (d) log(`  ${k} 描述符:`, JSON.stringify({ get: !!d.get, set: !!d.set, valueType: typeof d.value, writable: d.writable, enumerable: d.enumerable, configurable: d.configurable }));
  }
  log('\n=== SecretKey 源码前 400 字 ===');
  try { log(Function.prototype.toString.call(w.SecretKey).slice(0, 400)); } catch (e) { log('读取失败', e.message); }
  log('\n=== 试调 SecretKey ===');
  for (const arg of ['test', '3f73bd8671faaa92', '']) {
    try { log(`SecretKey(${JSON.stringify(arg)}) = ${JSON.stringify(w.SecretKey(arg))}`); }
    catch (e) { log(`SecretKey(${JSON.stringify(arg)}) 异常: ${String(e.message).slice(0, 120)}`); }
  }
  log('\n=== body 片段（找隐藏文本）===');
  try {
    const html = w.document.body.innerHTML.replace(/\s+/g, ' ');
    log(html.slice(0, 600));
  } catch (e) { log('读取失败', e.message); }
  process.exit(0);
})();
