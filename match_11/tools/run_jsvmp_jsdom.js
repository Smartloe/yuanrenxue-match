/**
 * 在 jsdom 里加载第11题页面（含 JSVMP），hook $.ajax 记录所有请求参数。
 * 目的：看清 VM 在「无 devtools」环境下到底发了什么请求、参数怎么算。
 *
 * 用法：node tools/run_jsvmp_jsdom.js [等待毫秒]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WAIT_MS = Number(process.argv[2] || 15000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const HTML = fs.readFileSync(path.join(__dirname, '..', 'static', 'match11.html'), 'utf8');
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => log('[jsdomError]', String(e.message).slice(0, 300)));
virtualConsole.on('error', (...a) => log('[page error]', a.map(String).join(' ').slice(0, 300)));

const ajaxLog = [];

const dom = new JSDOM(HTML, {
  url: PAGE_URL,
  referrer: PAGE_URL,
  runScripts: 'dangerously',
  resources: { userAgent: UA },
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.__yrxAjaxLog = ajaxLog;
    // jQuery 稍后才加载，这里用属性劫持，赋值瞬间把 ajax 包一层
    let jq;
    const wrap = (j) => {
      if (!j || j.__wrapped) return j;
      const orig = j.ajax;
      j.ajax = function (opts) {
        const rec = { url: opts && opts.url, data: opts && opts.data, method: (opts && (opts.method || opts.type)) || 'GET' };
        ajaxLog.push(rec);
        log(`[ajax] ${rec.method} ${rec.url}  data=${JSON.stringify(rec.data)}`);
        // 不真的发请求，返回一个假的 jqXHR
        return { done() { return this; }, fail() { return this; }, always() { return this; }, then() { return this; } };
      };
      j.__wrapped = true;
      return j;
    };
    for (const key of ['jQuery', '$']) {
      Object.defineProperty(window, key, {
        configurable: true,
        get: () => jq,
        set: (v) => { jq = wrap(v); },
      });
    }
    // 记录跳转企图
    const origAssign = window.location.assign ? window.location.assign.bind(window.location) : null;
    try {
      Object.defineProperty(window, '__navAttempt', { value: [], writable: true });
    } catch { /* 忽略 */ }
  },
});

(async () => {
  await sleep(WAIT_MS);
  const w = dom.window;
  log('\n=== 结果 ===');
  log('ajax 调用数:', ajaxLog.length);
  for (const r of ajaxLog) log('  ', r.method, r.url, JSON.stringify(r.data));
  log('window.match1 =', JSON.stringify(w.match1));
  log('window.yxr =', typeof w.yxr);
  const keys = Object.keys(w).filter((k) => /yxr|match|dev|console|debug/i.test(k));
  log('相关全局:', JSON.stringify(keys));
  try {
    log('pageReadyState =', w.document.readyState);
    log('#pgxList 内容 =', JSON.stringify((w.document.querySelector('#pgxList') || {}).innerHTML || '').slice(0, 300));
  } catch (e) { log('probe err', e.message); }
  dom.window.close();
  process.exit(0);
})();
