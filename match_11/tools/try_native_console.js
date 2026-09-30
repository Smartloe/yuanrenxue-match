/**
 * 在 jsdom 里把 console 换掉（jsdom 的 console 是 JS 实现，会被盾判定为"非原生"），
 * 尝试用原生函数/原生代理让盾的 checkEnv 通过，观察是否出现真 secretkey / match1。
 *
 * 用法：node tools/try_native_console.js <variant> [等待毫秒]
 *   variant: 0=原样 1=绑定原生 2=原生 Proxy 3=JSON.stringify 原生绑定
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const VARIANT = Number(process.argv[2] || 0);
const WAIT_MS = Number(process.argv[3] || 14000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vc = new VirtualConsole();
const vcLines = [];
for (const ev of ['log', 'info', 'warn', 'error', 'debug']) vc.on(ev, (...a) => vcLines.push(`[${ev}] ` + a.map(String).join(' ')));

const jsdomErrors = [];
vc.on('jsdomError', (e) => jsdomErrors.push(String(e.message).slice(0, 100)));

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    if (VARIANT === 0) return;
    const names = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupEnd', 'assert', 'clear', 'count', 'time', 'timeEnd'];
    // 一个"原生"函数：既能接收任意参数，toString 又是 [native code]
    const nativeSink = Function.prototype.bind.call(JSON.stringify, JSON); // 原生绑定，name=bound stringify
    const makeFn = (name) => {
      if (VARIANT === 1) return Function.prototype.bind.call(nativeSink, null);
      if (VARIANT === 3) return nativeSink;
      // VARIANT 2: 原生 Proxy（转发到真 console）
      const orig = window.console[name];
      return new Proxy(orig, { apply(t, self, args) { return Reflect.apply(t, self, args); } });
    };
    for (const n of names) {
      try { window.console[n] = makeFn(n); } catch { /* ignore */ }
    }
    window.__consolePatched = VARIANT;
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  log(`variant=${VARIANT}`);
  log(`  secretkey: ${typeof w.secretkey} | SecretKey: ${typeof w.SecretKey}`);
  log(`  match1: ${w.match1 === undefined ? 'undefined' : JSON.stringify(String(w.match1).slice(0, 120))}`);
  log(`  陷阱注入: ${/Developer tools detected|多重跳转/.test(w.document.body.innerHTML)}`);
  log(`  console.log 原生: ${/native code/.test(Function.prototype.toString.call(w.console.log))}`);
  log(`  jsdomError: ${jsdomErrors.length} 条 (${jsdomErrors[0] || ''})`);
  const rs = [...new Set(vcLines.filter((l) => /RandomString/.test(l)))];
  log(`  RandomString 打印: ${rs.length} 条 ${JSON.stringify(rs.slice(0, 3))}`);
  process.exit(0);
})();
