/**
 * 状态跃迁实验：
 *   基线(checkEnv=true) → 破坏 console(checkEnv=false) → 从干净 iframe 恢复(checkEnv=true)
 * 观察盾是否在"由脏变净"的跃迁后注入真 secretkey。
 *
 * 用法：node tools/try_env_transition.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9408;
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

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11tr-'));
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

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 160);
    return r.result.value;
  };
  const state = async (tag) => {
    const s = await ev(`JSON.stringify({ tag:${JSON.stringify(tag)},
      secretkey: typeof window.secretkey, SecretKey: typeof window.SecretKey,
      match1: String(window.match1),
      env: (function(){ try { return new window.DevtoolsTrap().checkEnv(); } catch(e){ return 'ERR'; } })() })`);
    log('  ', s);
    return s;
  };

  await sleep(10000);
  await state('基线');

  log('[*] 阶段1：破坏 console（全部静音）');
  log('   ', await ev(`(function(){ window.__saved = {}; ['log','info','warn','error','debug','dir','table','trace','group','groupEnd','groupCollapsed','assert'].forEach(function(n){ window.__saved[n]=console[n]; try{ console[n]=function(){}; }catch(e){} }); return 'done'; })()`));
  await sleep(7000);
  await state('破坏后');

  log('[*] 阶段2：从干净 iframe 恢复 console 全部功能');
  log('   ', await ev(`(function(){ var f=document.createElement('iframe'); f.style.display='none'; document.body.appendChild(f); var c=f.contentWindow.console; var done=[]; ['log','info','warn','error','debug','dir','table','trace','group','groupEnd','groupCollapsed','assert','clear','count','time','timeEnd'].forEach(function(n){ try{ if(c&&typeof c[n]==='function'){ console[n]=c[n]; done.push(n); } }catch(e){} }); return 'restored: '+done.join(','); })()`));
  await sleep(12000);
  await state('恢复后');

  const has = await ev('typeof window.secretkey');
  if (has === 'function') {
    const ans = await ev(`(function(){ try{ var rs=''; try{ rs=new window.DevtoolsTrap().random_str; }catch(e){} if(!rs&&window.randomString) rs=window.randomString(16); return String(window.secretkey(rs + ${JSON.stringify(SUFFIX)})); }catch(e){ return 'ERR '+e.message; } })()`);
    log('🎯 secretkey 出现，答案候选:', String(ans).slice(0, 140));
  } else log('[*] 恢复后仍无 secretkey');

  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
