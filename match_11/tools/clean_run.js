/**
 * 对照实验：完全不修改 window.console，只通过 jsdom 的 VirtualConsole 观察页面输出，
 * 看陷阱是否仍然触发 —— 用来判断"陷阱触发条件"是不是 console 被改过（非原生）。
 *
 * 用法：node tools/clean_run.js [等待毫秒] [--patch-console]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 12000);
const PATCH = process.argv.includes('--patch-console');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vcLines = [];
const vc = new VirtualConsole();
for (const ev of ['log', 'info', 'warn', 'error', 'debug']) {
  vc.on(ev, (...args) => vcLines.push(`[vc.${ev}] ` + args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' ')));
}
vc.on('jsdomError', () => {});

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    if (!PATCH) return;
    const real = window.console;
    const rec = (name, fn) => function (...args) { window.__c.push(`[${name}] ` + args.join(' ')); return fn && fn.apply(real, args); };
    window.__c = [];
    const px = {};
    for (const n of ['log']) px[n] = rec(n, real[n]);
    window.console = new Proxy(px, { get: (t, p) => (p in t ? t[p] : real[p]) });
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  const body = w.document.body.innerHTML;
  const trap = /Developer tools detected|多重跳转|Access Denied/.test(body);
  log(`patchConsole=${PATCH}`);
  log(`陷阱注入: ${trap ? '是' : '否'}`);
  log(`VirtualConsole 收到 ${vcLines.length} 条 / 去重 ${new Set(vcLines).size} 条:`);
  for (const l of [...new Set(vcLines)].slice(0, 15)) log('   ', l.slice(0, 200));
  if (PATCH) {
    log(`自建代理收到 ${(w.__c || []).length} 条:`);
    for (const l of [...new Set(w.__c || [])].slice(0, 10)) log('   ', l.slice(0, 200));
  }
  log(`typeof secretkey=${typeof w.secretkey} typeof SecretKey=${typeof w.SecretKey}`);
  process.exit(0);
})();
