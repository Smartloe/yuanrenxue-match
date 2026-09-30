/** 在真实 Chrome 里 hook 字符串构造（Proxy 包裹，保持原生特征），抓 VM 运行时拼出的字符串 */
const { spawn } = require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9354;
const WAIT_MS=Number(process.argv[2]||20000);
const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const SESSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const SPY=`
(function(){
  try{
    var strs=[]; window.__strs=strs; var seen={};
    var keep=function(s,from){ try{ s=String(s); if(s.length<3||s.length>300) return; if(seen[s])return; seen[s]=1; strs.push('('+from+') '+s); }catch(e){} };
    var wrap=function(obj,key,from){
      var orig=obj[key]; if(typeof orig!=='function') return;
      var w=new Proxy(orig,{ apply:function(t,self,args){ var o=Reflect.apply(t,self,args); keep(o,from); return o; } });
      try{ Object.defineProperty(obj,key,{value:w,writable:true,configurable:true}); }catch(e){}
    };
    wrap(String,'fromCharCode','fromCharCode');
    wrap(Array.prototype,'join','join');
    wrap(window,'atob','atob');
  }catch(e){}
})();`;
class CDP{constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.handlers=[];
 ws.addEventListener('message',(ev)=>{const m=JSON.parse(ev.data);
  if(m.id&&this.pending.has(m.id)){const{resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}
  else if(m.method)for(const h of this.handlers)h(m);});}
 on(f){this.handlers.push(f);}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});
  this.ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(new Error('timeout '+method));}},30000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11st-'));
  const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1440,900','about:blank'],{stdio:['ignore','ignore','ignore']});
  let v=null; for(let i=0;i<80;i++){try{v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  if(!v)throw new Error('未就绪');
  const target=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const cdp=new CDP(ws);
  cdp.on(async(m)=>{ if(m.method==='Fetch.requestPaused'){const{requestId}=m.params; try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}} });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:SPY});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(WAIT_MS);
  const ev=async(e)=>{const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true});return r.exceptionDetails?{error:(r.exceptionDetails.exception||{}).description}:{value:r.result.value};};
  const p=await ev(`JSON.stringify({url:location.href,secretkey:typeof window.secretkey,SecretKey:typeof window.SecretKey,trap:/Developer tools detected/.test(document.body.innerHTML),n:(window.__strs||[]).length,logNative:/native code/.test(Function.prototype.toString.call(console.log))})`);
  log('[page]',p.error||p.value);
  const s=await ev(`JSON.stringify((window.__strs||[]).filter(function(x){return /secret|random|risk|integrity|proxy/i.test(x);}))`);
  log('[关键字符串]', s.error||s.value);
  const all=await ev(`JSON.stringify((window.__strs||[]).length)`);
  log('[字符串总数]', all.value);
  const dump=await ev(`JSON.stringify((window.__strs||[]).slice(0,400))`);
  if(!dump.error) fs.writeFileSync(path.join(__dirname,'..','docs','chrome_strings.json'), dump.value);
  log('[已保存 docs/chrome_strings.json]');
  ws.close();chrome.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
