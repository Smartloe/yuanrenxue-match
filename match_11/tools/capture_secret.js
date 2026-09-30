/**
 * 第11题核心：VM 会禁用控制台并偷偷打印 secretkey。
 * 这里在页面脚本执行前就把 console 包成记录代理，从而截获被"藏起来"的打印内容，
 * 然后再调用 window.secretkey(secret + "3f73bd8671faaa92") 拿答案。
 *
 * 用法：node tools/capture_secret.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 15000);
const SUFFIX = '3f73bd8671faaa92';
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});          // 页面自身会刷很多无关错误
vc.on('error', () => {});

const consoleCalls = [];

const dom = new JSDOM(HTML, {
  url: 'https://match.yuanrenxue.cn/match/11',
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.__consoleCalls = consoleCalls;
    const real = window.console;
    // 用 Proxy 包住 console：无论 VM 之后怎么改写/删除方法，历史记录都留得下来
    const rec = (name, fn) => function (...args) {
      consoleCalls.push({ name, args: args.map((a) => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
      }), at: Date.now() });
      try { if (typeof fn === 'function') return fn.apply(real, args); } catch { /* 忽略 */ }
    };
    const proxy = {};
    for (const name of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group', 'groupEnd', 'clear', 'assert', 'count', 'time', 'timeEnd']) {
      proxy[name] = rec(name, real && real[name]);
    }
    window.console = new Proxy(proxy, {
      get(t, p) {
        if (p in t) return t[p];
        const v = real ? real[p] : undefined;
        return typeof v === 'function' ? rec(String(p), v) : v;
      },
      set(t, p, v) {
        // VM 想禁用/替换某个方法时，替换成"记录代理"，保证它后续调用仍被我们看见
        t[p] = typeof v === 'function' ? rec(String(p), v) : v;
        return true;
      },
    });
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;

  log(`[*] console 调用共 ${consoleCalls.length} 条`);
  const seen = new Set();
  for (const c of consoleCalls) {
    const line = `[${c.name}] ${c.args.join(' ')}`;
    if (seen.has(line)) continue;
    seen.add(line);
    log('   ', line.slice(0, 300));
  }

  log(`\n[*] typeof window.secretkey = ${typeof w.secretkey}`);
  const keyCandidates = Object.getOwnPropertyNames(w).filter((k) => /secret/i.test(k));
  log(`[*] 含 secret 的全局: ${JSON.stringify(keyCandidates)}`);

  if (typeof w.secretkey === 'function') {
    // 找出最像 secretkey 的字符串
    const all = consoleCalls.flatMap((c) => c.args).filter((s) => typeof s === 'string');
    const cands = [...new Set(all)].filter((s) => s.length >= 4 && s.length <= 200 && !/^\[object/.test(s));
    log(`[*] 候选 secret 字符串 ${cands.length} 个`);
    for (const s of cands.slice(0, 20)) {
      log(`    候选: ${JSON.stringify(s).slice(0, 120)}`);
      try {
        const out = w.secretkey(s + SUFFIX);
        log(`    -> secretkey(${JSON.stringify(s.slice(0, 40))} + suffix) = ${JSON.stringify(out)}`);
      } catch (e) {
        log(`    -> 调用异常: ${String(e.message).slice(0, 120)}`);
      }
    }
  }
  process.exit(0);
})();
