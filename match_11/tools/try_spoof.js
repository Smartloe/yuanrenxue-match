/**
 * 验证 VM 的“控制台是否打开”判定依据。
 * 主要怀疑对象：outerHeight-innerHeight / outerWidth-innerWidth 的差值（停靠式 DevTools 的经典特征）。
 * 通过 jsdom 伪造窗口尺寸，看 VM 是否还会注入跳转脚本、是否改为打印真正的 secretkey。
 *
 * 用法：node tools/try_spoof.js <outerW,outerH,innerW,innerH> [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const [ow, oh, iw, ih] = (process.argv[2] || '1200,1000,1024,768').split(',').map(Number);
const WAIT_MS = Number(process.argv[3] || 12000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const calls = [];
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // 伪造窗口尺寸
    for (const [k, v] of [['outerWidth', ow], ['outerHeight', oh], ['innerWidth', iw], ['innerHeight', ih]]) {
      try { Object.defineProperty(window, k, { get: () => v, configurable: true }); } catch { /* ignore */ }
    }
    // console（含 iframe）全程记录
    const patch = (win, tag) => {
      if (!win || win.__patched) return win;
      win.__patched = true;
      const real = win.console;
      const rec = (name, fn) => function (...args) {
        calls.push(`[${tag}.${name}] ` + args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' '));
        try { if (typeof fn === 'function') return fn.apply(real, args); } catch { /* ignore */ }
      };
      const px = {};
      for (const n of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir']) px[n] = rec(n, real && real[n]);
      win.console = new Proxy(px, {
        get: (t, p) => (p in t ? t[p] : (typeof real[p] === 'function' ? rec(String(p), real[p]) : real[p])),
        set: (t, p, v) => { t[p] = typeof v === 'function' ? rec(String(p), v) : v; return true; },
      });
      return win;
    };
    patch(window, 'top');
    const proto = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
    if (proto) {
      for (const prop of ['contentWindow', 'contentDocument']) {
        const d = Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.get) continue;
        Object.defineProperty(proto, prop, {
          configurable: true,
          get() {
            const v = d.get.call(this);
            if (prop === 'contentWindow') patch(v, 'iframe');
            else if (v && v.defaultView) patch(v.defaultView, 'iframe');
            return v;
          },
        });
      }
    }
    // 记录导航企图是否被触发（页面的"多重跳转"脚本会用到 location.href 赋值）
    window.__navTried = false;
    const loc = window.location;
    for (const m of ['assign', 'replace']) {
      try { loc[m] = function (u) { window.__navTried = true; calls.push(`[nav.${m}] ${u}`); }; } catch { /* ignore */ }
    }
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  const body = w.document.body.innerHTML;
  const trapFired = /Developer tools detected|多重跳转|Access Denied/.test(body);
  log(`尺寸 outer=${ow}x${oh} inner=${iw}x${ih}  (ΔW=${ow - iw}, ΔH=${oh - ih})`);
  log(`  陷阱注入跳转脚本: ${trapFired ? '是 ❌（判定为已打开/被检测）' : '否 ✅（判定为正常）'}`);
  log(`  导航调用: ${w.__navTried}`);
  const uniq = [...new Set(calls)];
  log(`  console 打印 ${calls.length} 条 / 去重 ${uniq.length} 条:`);
  for (const c of uniq.slice(0, 12)) log('    ', c.slice(0, 200));
  log(`  typeof secretkey=${typeof w.secretkey}  typeof SecretKey=${typeof w.SecretKey}\n`);
  process.exit(0);
})();
