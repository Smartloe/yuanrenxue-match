/**
 * 抓 String.fromCharCode 的入参（数字序列）与产物，
 * 用于破解 devtools_jsvmp.js 末尾数字字符串表的编码方式。
 *
 * 用法：node tools/dump_charcode_args.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 12000);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pairs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    const orig = window.String.fromCharCode;
    const wrapped = new Proxy(orig, {
      apply(target, self, args) {
        const out = Reflect.apply(target, self, args);
        try { var o = String(out); if (o.length >= 3 && pairs.length < 5000) pairs.push({ args: Array.from(args), out: o }); } catch { /* ignore */ }
        return out;
      },
    });
    try { Object.defineProperty(window.String, 'fromCharCode', { value: wrapped, writable: true, configurable: true }); } catch { /* ignore */ }
  },
});

(async () => {
  await sleep(WAIT_MS);
  const interesting = pairs.filter((p) => /secret|random|trap|native|proxy|check|api|match/i.test(p.out));
  log(`共 ${pairs.length} 次 fromCharCode，含关键词 ${interesting.length} 次`);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fromcharcode_pairs.json'), JSON.stringify(pairs, null, 1));
  log('已写入 docs/fromcharcode_pairs.json');
  for (const p of interesting.slice(0, 25)) {
    log(`  ${JSON.stringify(p.args)} -> ${JSON.stringify(p.out)}`);
  }
  process.exit(0);
})();
