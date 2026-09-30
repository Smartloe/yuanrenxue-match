/**
 * 显式给页面挂一个真正的 DevTools 前端（devtools:// URL），
 * 看 VM 是否因此走正常分支（定义 window.secretkey 并发取数请求）。
 * 用法：node tools/cdp_devtools_attach.js [等待毫秒]
 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const CHROME = process.env.CHROME_BIN || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 9348;
const WAIT_MS = Number(process.argv[2] || 20000);
const PAGE_URL = 'https://match.yuanrenxue.cn/match/11';
const SESSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.handlers=[];
    ws.addEventListener('message',(ev)=>{const m=JSON.parse(ev.data);
      if(m.id&&this.pending.has(m.id)){const{resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}
      else if(m.method)for(const h of this.handlers)h(m);});}
  on(f){this.handlers.push(f);}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});
    this.ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(new Error('timeout '+method));}},30000);});}
}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11d-'));
  const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,
    '--no-first-run','--no-default-browser-check','--disable-gpu','--no-sandbox','--remote-allow-origins=*',
    '--window-size=1440,900',`--user-agent=${UA}`,'about:blank'],{stdio:['ignore','ignore','ignore']});
  let v=null; for(let i=0;i<80;i++){try{v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  if(!v) throw new Error('DevTools 端口未就绪');
  log('[*] Chrome:',v.Browser);
  const target=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const cdp=new CDP(ws);
  const reqs=[]; let blocked=0;
  cdp.on(async(m)=>{
    if(m.method==='Network.requestWillBeSent'&&/yuanrenxue\.cn\/(api|a)\//.test(m.params.request.url)){reqs.push(m.params.request.url);log('  [req]',m.params.request.url.slice(0,220));}
    if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;
      if(request.url.startsWith('https://match.yuanrenxue.cn')&&!request.url.includes('/match/11')){blocked++;try{await cdp.send('Fetch.failRequest',{requestId,errorReason:'Aborted'});}catch{}}
      else{try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}}}
  });
  await cdp.send('Page.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride',{userAgent:UA,platform:'MacIntel'});
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  log(`[*] 打开 ${PAGE_URL}`);
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(4000);
  // 挂 DevTools 前端
  const dtUrl = `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${target.id}`;
  log('[*] 挂 DevTools 前端:', dtUrl);
  try { const dt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`,{method:'PUT'})).json(); log('    前端 target:', (dt.url||'').slice(0,60)); }
  catch(e){ log('    前端打开失败:', e.message); }
  await sleep(WAIT_MS);
  const evalIn=async(expr)=>{const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)return{error:(r.exceptionDetails.exception||{}).description};return{value:r.result.value};};
  const probe=await evalIn(`JSON.stringify({url:location.href,secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,trap:/Developer tools detected/.test(document.body.innerHTML),match1:(window.match1===undefined?null:String(window.match1).slice(0,160))})`);
  log('\n[page]',probe.error||probe.value);
  log('[拦截跳转]',blocked,'| [请求]',JSON.stringify(reqs));
  log('[URL 中的 m]',JSON.stringify(reqs.map(u=>(u.match(/[?&]m=([^&]+)/)||[])[1]).filter(Boolean)));
  ws.close();chrome.kill();await sleep(300);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
