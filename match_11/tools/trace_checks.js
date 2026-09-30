/**
 * 给 VM 常见的"反调试/控制台检测"手法下钩子，看它到底在查什么：
 *   - Function.prototype.toString（检测某个函数是否被改写）
 *   - Object.defineProperty（getter 型检测：console.log(obj) 触发 getter）
 *   - document.createElement('script') / script 文本（陷阱注入）
 *   - window.open
 * 钩子本身尽量保持"原生"特征（Proxy 包原生函数）。
 *
 * 用法：node tools/trace_checks.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 12000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const trace = [];

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    const T = (kind, msg) => trace.push({ kind, msg: String(msg).slice(0, 260) });

    // 1) Function.prototype.toString
    const origToString = window.Function.prototype.toString;
    const stealth = new Proxy(origToString, {
      apply(target, thisArg, args) {
        let src = '';
        try { src = Reflect.apply(target, thisArg, args); } catch { /* ignore */ }
        if (/console|log|clear|table|dir|profile|debug/i.test(src) && src.length < 300) {
          T('toString', `name=${thisArg && thisArg.name} src=${src.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
        return src;
      },
    });
    try { window.Function.prototype.toString = stealth; } catch { /* ignore */ }

    // 2) Object.defineProperty：getter 型检测
    const origDP = window.Object.defineProperty;
    window.Object.defineProperty = new Proxy(origDP, {
      apply(target, thisArg, args) {
        const [obj, prop, desc] = args;
        if (desc && (desc.get || desc.set)) {
          const tag = obj === window ? 'window' : (obj && obj.constructor && obj.constructor.name) || typeof obj;
          T('defineProperty', `getter/setter on ${tag}.${String(prop)}`);
        }
        return Reflect.apply(target, thisArg, args);
      },
    });

    // 3) 陷阱注入的 script 内容
    const origCreate = window.document.createElement.bind(window.document);
    window.document.createElement = new Proxy(origCreate, {
      apply(target, thisArg, args) {
        const el = Reflect.apply(target, thisArg, args);
        if (String(args[0]).toLowerCase() === 'script') {
          try {
            Object.defineProperty(el, 'text', {
              set(v) { T('script.text', String(v).replace(/\s+/g, ' ').slice(0, 200)); return v; },
              get() { return ''; },
              configurable: true,
            });
            Object.defineProperty(el, 'innerHTML', {
              set(v) { T('script.innerHTML', String(v).replace(/\s+/g, ' ').slice(0, 200)); return v; },
              get() { return ''; },
              configurable: true,
            });
          } catch { /* ignore */ }
        }
        return el;
      },
    });

    // 4) window.open
    const origOpen = window.open;
    window.open = function (...a) { T('window.open', a.map(String).join(' ').slice(0, 200)); return origOpen ? origOpen.apply(window, a) : null; };
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  log(`trace 共 ${trace.length} 条`);
  const grouped = new Map();
  for (const t of trace) {
    const k = t.kind + ' | ' + t.msg.slice(0, 120);
    grouped.set(k, (grouped.get(k) || 0) + 1);
  }
  for (const [k, n] of grouped) log(`  x${n}  ${k}`);
  log(`\n陷阱注入: ${/Developer tools detected|多重跳转/.test(w.document.body.innerHTML) ? '是' : '否'}`);
  log(`typeof secretkey=${typeof w.secretkey} typeof SecretKey=${typeof w.SecretKey}`);
  process.exit(0);
})();
