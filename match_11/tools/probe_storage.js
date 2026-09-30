/** 检查页面 localStorage / sessionStorage / cookie 里是否存了盾的密钥或随机串 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9416;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const SESSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();this.h=[];
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method)for(const f of this.h)f(m);});}
 on(f){this.h.push(f);} send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout '+method));}},20000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11st-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1440,900','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new CDP(ws);
  cdp.on(async m=>{if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;
    if(request.url.startsWith('https://match.yuanrenxue.cn')&&!request.url.includes('/match/11')){try{await cdp.send('Fetch.failRequest',{requestId,errorReason:'Aborted'});}catch{}}
    else{try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}}}});
  await cdp.send('Page.enable');await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(15000);
  const ev=async e=>{const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,150);return r.result.value;};
  log('localStorage  :', await ev(`JSON.stringify(Object.keys(localStorage).map(function(k){return k+'='+localStorage.getItem(k).slice(0,80);}))`));
  log('sessionStorage:', await ev(`JSON.stringify(Object.keys(sessionStorage).map(function(k){return k+'='+sessionStorage.getItem(k).slice(0,80);}))`));
  log('document.cookie（是否可读）:', await ev('JSON.stringify(document.cookie)'));
  log('页面里的后缀（题面）:', await ev(`(function(){var m=document.body.innerText.match(/secretkey\\([^)]*"([0-9a-f]{16})"/);return m?m[1]:null;})()`));
  log('盾状态:', await ev(`JSON.stringify({secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,random_str:(function(){try{return new window.DevtoolsTrap().random_str;}catch(e){return 'ERR';}})()})`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
