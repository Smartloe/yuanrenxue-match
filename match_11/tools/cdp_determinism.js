/** 在真实 Chrome 里测试 SecretKey 是否确定性（同输入多次调用） */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9356; const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const SESSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const log=(...a)=>process.stdout.write(a.join(' ')+'\n'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.h=[];
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);
  if(m.id&&this.pending.has(m.id)){const{resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method)for(const f of this.h)f(m);});}
 on(f){this.h.push(f);} send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);rej(new Error('timeout '+method));}},30000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11det-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
  let v=null;for(let i=0;i<80;i++){try{v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new CDP(ws);
  cdp.on(async m=>{ if(m.method==='Fetch.requestPaused'){try{await cdp.send('Fetch.continueRequest',{requestId:m.params.requestId});}catch{}} });
  await cdp.send('Page.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(16000);
  const ev=async e=>{const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||'').slice(0,120)):r.result.value;};
  log('secretkey:', await ev('typeof window.secretkey'));
  log('SecretKey 三次同输入:', await ev(`(function(){var f=window.SecretKey;if(typeof f!=='function')return 'not fn';var o=[];for(var i=0;i<3;i++){try{o.push(String(f('test')));}catch(e){o.push('ERR '+e.message);}}return JSON.stringify(o);})()`));
  log('match1:', await ev('String(window.match1)'));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
