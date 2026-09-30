/**
 * 核心假设：盾的 console_element_id_get / console_error_property_get / console_dir_* /
 * console_log_array_performance / promise_error_getter 这些检测，全部依赖 devtools 对
 * console 参数对象做序列化/展开。只要让 console 只保留字符串参数（对象被吞掉），
 * 探针就不会被展开 → 检测不触发 → 盾走正常分支 → 注入真 secretkey。
 *
 * 用法：node tools/try_console_hardening.js [每个变体等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9406;
const PER_VARIANT_MS = Number(process.argv[2] || 6000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SUFFIX = '3f73bd8671faaa92';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) for (const h of this.handlers) h(m);
    });
  }
  on(f) { this.handlers.push(f); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
    });
  }
}

// 各变体：在页面里重新定义 console 方法
const VARIANTS = [
  ['noop 全部（彻底静音）', `['log','info','warn','error','debug','dir','table','trace','group','groupEnd','groupCollapsed','assert'].forEach(function(n){ try{ console[n] = function(){}; }catch(e){} })`],
  ['只放行字符串（吞掉对象）', `(function(){ var R={}; ['log','info','warn','error','debug','dir','table','trace'].forEach(function(n){ R[n]=console[n]; console[n]=function(){ var a=[].slice.call(arguments).filter(function(x){ return typeof x==='string'||typeof x==='number'; }); return a.length?R[n].apply(console,a):undefined; }; }); })()`],
  ['用干净 iframe 的 console + 吞对象', `(function(){ var f=document.createElement('iframe'); f.style.display='none'; document.body.appendChild(f); var c=f.contentWindow.console; ['log','info','warn','error','debug','dir','table','trace','group','groupEnd','clear'].forEach(function(n){ if(c&&typeof c[n]==='function') console[n]=c[n]; }); ['log','info','warn','error','debug','dir','table','trace'].forEach(function(n){ var R=console[n]; console[n]=function(){ var a=[].slice.call(arguments).filter(function(x){ return typeof x==='string'||typeof x==='number'; }); return a.length?R.apply(console,a):undefined; }; }); })()`],
  ['console.dir/error 静音，其余保留', `(function(){ console.dir=function(){}; console.error=function(){}; console.table=function(){}; })()`],
  ['冻结 console 方法（Object.freeze console）', `(function(){ try{ Object.freeze(console); }catch(e){} })()`],
];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11ch-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1440,900', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; i < 80; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);
  cdp.on(async (m) => {
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://match.yuanrenxue.cn') && !request.url.includes('/match/11')) {
        try { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch { /* ignore */ }
      } else { try { await cdp.send('Fetch.continueRequest', { requestId }); } catch { /* ignore */ } }
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', { name: 'sessionid', value: SESSION.sessionid, domain: 'match.yuanrenxue.cn', path: '/', secure: true });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(10000);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 160);
    return r.result.value;
  };
  const state = () => ev(`JSON.stringify({
    secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
    match1: String(window.match1),
    env: (function(){ try { return new window.DevtoolsTrap().checkEnv(); } catch(e){ return 'ERR'; } })()
  })`);

  log('基线:', await state());

  for (const [name, code] of VARIANTS) {
    log(`\n[变体] ${name}`);
    log('  注入:', await ev(code));
    // 触发一次盾的 checkAll（活实例每 ~5s 自己也会跑）
    await sleep(PER_VARIANT_MS);
    log('  状态:', await state());
    const has = await ev('typeof window.secretkey');
    if (has === 'function') {
      const ans = await ev(`(function(){ try{ var rs=''; try{ rs=new window.DevtoolsTrap().random_str; }catch(e){} if(!rs&&window.randomString) rs=window.randomString(16); return String(window.secretkey(rs + ${JSON.stringify(SUFFIX)})); }catch(e){ return 'ERR '+e.message; } })()`);
      log('  🎯 secretkey 出现！答案候选:', String(ans).slice(0, 140));
      const det = await ev(`(function(){ var f=window.secretkey; try{ return String(f('q'))===String(f('q')); }catch(e){ return 'ERR'; } })()`);
      log('  确定性:', det);
      break;
    }
  }

  log('\n最终状态:', await state());
  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
