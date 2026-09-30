/**
 * 多组"恢复控制台"变体，逐组尝试并观察 window.secretkey / window.match1 是否出现。
 * 用法：node tools/try_console_variants.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9392;
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx11cv-'));
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
  await sleep(14000);

  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC ' + ((r.exceptionDetails.exception || {}).description || '').slice(0, 160);
    return r.result.value;
  };
  const state = async (tag) => {
    const s = await ev(`JSON.stringify({tag:${JSON.stringify(tag)}, secretkey:typeof window.secretkey, SecretKey:typeof window.SecretKey, match1:(window.match1===undefined?null:String(window.match1).slice(0,80))})`);
    log('  ', s);
  };

  await state('baseline');

  const variants = [
    ['window.console = inst.console', `(function(){ try{ var i=new window.DevtoolsTrap(); window.console = i.console; return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
    ['copy methods from inst.console', `(function(){ try{ var i=new window.DevtoolsTrap(); var c=i.console; ['log','info','warn','error','debug','dir','table','trace','clear','group','groupEnd','assert','count','time','timeEnd'].forEach(function(n){ if(c&&typeof c[n]==='function') window.console[n]=c[n]; }); return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
    ['window.console.log = inst.console.log', `(function(){ try{ var i=new window.DevtoolsTrap(); window.console.log = i.console.log; return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
    ['restore from fresh iframe (all methods)', `(function(){ try{ var f=document.createElement('iframe'); f.style.display='none'; document.body.appendChild(f); var c=f.contentWindow.console; ['log','info','warn','error','debug','dir','table','trace','clear','group','groupEnd','assert','count','time','timeEnd'].forEach(function(n){ if(typeof c[n]==='function') window.console[n]=c[n]; }); return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
    ['window.console = fresh iframe console', `(function(){ try{ var f=document.createElement('iframe'); f.style.display='none'; document.body.appendChild(f); window.console = f.contentWindow.console; return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
    ['call initDevtoolsTrap again', `(function(){ try{ window.initDevtoolsTrap(); return 'ok'; }catch(e){ return 'ERR '+e.message; } })()`],
  ];

  for (const [name, expr] of variants) {
    const r = await ev(expr);
    log(`[变体] ${name} -> ${r}`);
    await sleep(3500);
    await state(name);
    // 如果出现了 secretkey，用它算答案
    const has = await ev('typeof window.secretkey');
    if (has === 'function') {
      const ans = await ev(`(function(){ try{ return String(window.secretkey(window.randomString(16) + ${JSON.stringify(SUFFIX)})); }catch(e){ return 'ERR '+e.message; } })()`);
      log('    🎯 secretkey 出现，试算:', String(ans).slice(0, 120));
      const det = await ev(`(function(){ var f=window.secretkey; var a=String(f('x')), b=String(f('x')); return a===b; })()`);
      log('    确定性:', det);
      break;
    }
  }

  ws.close(); ch.kill(); await sleep(200);
})().catch((e) => { log('[-]', e.message); process.exit(1); });
