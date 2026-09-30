/**
 * hook 字符串构造 API（String.fromCharCode / fromCodePoint / atob / decodeURIComponent /
 * Array.prototype.join），把 VM 运行时拼出来的字符串全部记录下来，
 * 重点找 secretkey / SecretKey / RandomString / 接口路径 / suffix。
 *
 * 用法：node tools/hook_strings.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 13000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const strings = [];
const seen = new Set();
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    const keep = (s, from) => {
      s = String(s);
      if (s.length < 3 || s.length > 400) return;
      if (seen.has(s)) return;
      seen.add(s);
      strings.push({ s, from });
    };
    const wrapStatic = (obj, key, fnFrom) => {
      const orig = obj[key];
      if (typeof orig !== 'function') return;
      const wrapped = new Proxy(orig, {
        apply(target, self, args) {
          const out = Reflect.apply(target, self, args);
          keep(out, fnFrom);
          return out;
        },
      });
      try { Object.defineProperty(obj, key, { value: wrapped, writable: true, configurable: true }); } catch { /* ignore */ }
    };
    wrapStatic(window.String, 'fromCharCode', 'fromCharCode');
    if (window.String.fromCodePoint) wrapStatic(window.String, 'fromCodePoint', 'fromCodePoint');
    for (const g of ['atob', 'decodeURIComponent', 'unescape']) {
      if (typeof window[g] === 'function') wrapStatic(window, g, g);
    }
    const join = window.Array.prototype.join;
    window.Array.prototype.join = new Proxy(join, {
      apply(target, self, args) {
        const out = Reflect.apply(target, self, args);
        try { if (self && self.length >= 3 && self.length <= 200) keep(out, 'join'); } catch { /* ignore */ }
        return out;
      },
    });
  },
});

(async () => {
  await sleep(WAIT_MS);
  log(`共捕获 ${strings.length} 个字符串`);
  const hits = strings.filter((x) => /secret|random|api|match|suffix|3f73|devtool|tab|key/i.test(x.s));
  log(`\n[重点命中 ${hits.length} 条]`);
  for (const h of hits.slice(0, 80)) log(`  (${h.from}) ${JSON.stringify(h.s.slice(0, 160))}`);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'runtime_strings.txt'), strings.map((x) => `(${x.from}) ${x.s}`).join('\n'));
  log('已写入 docs/runtime_strings.txt');
  process.exit(0);
})();
