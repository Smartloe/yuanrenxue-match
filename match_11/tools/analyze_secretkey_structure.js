/**
 * 结构分析诱饵函数 SecretKey：
 *   - 输出长度与输入长度的关系
 *   - 同一输入多次调用，逐字节比较哪些位置是稳定的（可能藏着真值）
 *   - 输出是否包含输入的 md5/hex 等
 * 用法：node tools/analyze_secretkey_structure.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9400;
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11st2-'));
  const ch = spawn(CHROME, ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`, '--no-first-run', '--remote-allow-origins=*', '--window-size=1200,800', PAGE_URL],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  await sleep(18000);
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('yuanrenxue'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(res, 15000); });
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 200);
    return r && r.result ? r.result.value : JSON.stringify(r);
  };

  // 1) 输出长度 vs 输入长度
  log('=== 输出长度 vs 输入长度 ===');
  log(await ev(`(function(){
    var f = window.SecretKey, out = [];
    for (var n = 0; n <= 40; n += 4) {
      var s = 'a'.repeat(n);
      var v = String(f(s));
      out.push(n + ' -> ' + v.length + ' hex (' + v.length/2 + ' bytes)');
    }
    return out.join('\\n');
  })()`));

  // 2) 同输入 6 次，逐字节稳定性
  log('\n=== 同输入 6 次，逐位置稳定性 ===');
  log(await ev(`(function(){
    var f = window.SecretKey, X = 'test';
    var runs = [];
    for (var i = 0; i < 6; i++) runs.push(String(f(X)));
    var len = runs[0].length;
    var stable = [], unstable = [];
    for (var p = 0; p < len; p++) {
      var same = runs.every(function(r){ return r[p] === runs[0][p]; });
      (same ? stable : unstable).push(p);
    }
    return JSON.stringify({ len: len, stableCount: stable.length, unstableCount: unstable.length,
      stablePositions: stable.slice(0, 80), sample: runs[0] });
  })()`, null, 1));

  // 3) 输出里是否含输入相关的已知摘要
  log('\n=== 输出与输入摘要的关系 ===');
  log(await ev(`(function(){
    var f = window.SecretKey, X = 'abc', suffix = '3f73bd8671faaa92';
    var v = String(f(X + suffix));
    var cands = {
      'md5(X+suffix)': 'x', 'md5(suffix)': 'y'
    };
    return JSON.stringify({ input: X + suffix, outLen: v.length, out: v.slice(0, 200) });
  })()`, null, 1));

  // 4) 不同输入是否产生相同输出（碰撞检测：可能只依赖部分输入）
  log('\n=== 相同后缀、不同前缀 ===');
  log(await ev(`(function(){
    var f = window.SecretKey, suffix = '3f73bd8671faaa92';
    var out = [];
    ['', 'a', 'ab', 'abc', 'test', 'random'].forEach(function(p){
      var v = String(f(p + suffix));
      out.push(JSON.stringify(p) + ' -> len=' + v.length + ' head=' + v.slice(0, 24));
    });
    return out.join('\\n');
  })()`));

  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
