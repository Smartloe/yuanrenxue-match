/**
 * 探测 SecretKey 的"确定性调用方式"：
 *   真函数必然对同一输入稳定输出，假函数每次都不一样。
 * 遍历各种参数组合（含多余参数/this 绑定/apply），找出确定性的调用方式。
 *
 * 用法：node tools/probe_secretkey_modes.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9390;
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11md-'));
  const ch = spawn(CHROME, ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`, '--no-first-run', '--remote-allow-origins=*', '--window-size=1200,800', PAGE_URL],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  await sleep(20000);
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

  const expr = `(function(){
    var f = window.SecretKey;
    if (typeof f !== 'function') return 'no SecretKey';
    var X = 'abc';
    var suffix = '3f73bd8671faaa92';
    var modes = [
      ['f(x)',            function(){ return f(X); }],
      ['f(x,0)',          function(){ return f(X, 0); }],
      ['f(x,1)',          function(){ return f(X, 1); }],
      ['f(x,2)',          function(){ return f(X, 2); }],
      ['f(x,true)',       function(){ return f(X, true); }],
      ['f(0,x)',          function(){ return f(0, X); }],
      ['f(1,x)',          function(){ return f(1, X); }],
      ['f(2,x)',          function(){ return f(2, X); }],
      ['f(null,x)',       function(){ return f(null, X); }],
      ['f("")',           function(){ return f(''); }],
      ['f(x+x)',          function(){ return f(X + X); }],
      ['f(x+suffix)',     function(){ return f(X + suffix); }],
      ['f(x,x)',          function(){ return f(X, X); }],
      ['f.call(null,x)',  function(){ return f.call(null, X); }],
      ['f.apply(null,[x])', function(){ return f.apply(null, [X]); }],
      ['this=window f(x)', function(){ return f.bind(window)(X); }],
      ['new f(x)',        function(){ return new f(X).toString(); }]
    ];
    var out = [];
    for (var i = 0; i < modes.length; i++) {
      var name = modes[i][0], fn = modes[i][1];
      var a, b, err = null;
      try { a = String(fn()); } catch (e) { err = e.message; }
      try { b = String(fn()); } catch (e) { err = err || e.message; }
      out.push({ mode: name, deterministic: (err ? null : (a === b)), len: a ? a.length : 0, a: (a||'').slice(0, 40), b: (b||'').slice(0, 40), err: err });
    }
    return JSON.stringify(out, null, 1);
  })()`;
  log(await ev(expr));

  // 顺便看看 browserUtils 这些入口有没有确定性输出
  const expr2 = `(function(){
    var out = {};
    try {
      var bu = window.browserUtils || {};
      Object.getOwnPropertyNames(bu).forEach(function(k){
        try {
          var r1 = String(bu[k]()), r2 = String(bu[k]());
          out['browserUtils.' + k] = { det: r1 === r2, v: r1.slice(0, 30) };
        } catch (e) { out['browserUtils.' + k] = 'throw'; }
      });
    } catch (e) { out.err = e.message; }
    try { out.randomString16 = { det: (window.randomString(16) === window.randomString(16)) }; } catch (e) {}
    return JSON.stringify(out, null, 1);
  })()`;
  log('\n其他入口:', await ev(expr2));

  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
