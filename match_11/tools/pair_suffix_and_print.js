/** 取同一次加载的 (服务端下发后缀 S, 盾打印的 X)，用于验证派生关系；并检查盾是否改写了题面 DOM */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=Number(process.env.P||9430);const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const SESSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const EARLY=`(function(){try{var rec=[];window.__prints=rec;var patch=function(w){try{if(!w||w.__p)return w;w.__p=1;var c=w.console;if(!c)return w;['log','info','warn','error','debug','dir','table','clear'].forEach(function(n){var o=c[n];if(typeof o!=='function')return;c[n]=function(){var a=[].slice.call(arguments).map(function(x){return typeof x==='string'?x:String(x);});rec.push(n+': '+a.join(' '));if(n!=='clear'){try{return o.apply(c,arguments);}catch(e){}}}});}catch(e){}return w;};var pr=window.HTMLIFrameElement&&window.HTMLIFrameElement.prototype;if(pr){var d=Object.getOwnPropertyDescriptor(pr,'contentWindow');if(d&&d.get)Object.defineProperty(pr,'contentWindow',{configurable:true,get:function(){return patch(d.get.call(this));}});}try{console.clear=function(){};}catch(e){}}catch(e){}})();`;
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();this.h=[];ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method)for(const f of this.h)f(m);});}
 on(f){this.h.push(f);} send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout'));}},25000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11pair-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1440,900','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new CDP(ws);
  let docId=null;
  cdp.on(async m=>{
    if(m.method==='Network.responseReceived' && m.params.type==='Document' && m.params.response.url.includes('/match/11')) docId=m.params.requestId;
    if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;
      if(request.url.startsWith('https://match.yuanrenxue.cn')&&!request.url.includes('/match/11')){try{await cdp.send('Fetch.failRequest',{requestId,errorReason:'Aborted'});}catch{}return;}
      try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}}});
  await cdp.send('Page.enable');await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:EARLY});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(12000);
  const ev=async e=>{const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)return 'EXC';return r.result.value;};
  let S=null;
  if(docId){ try{ const b=await cdp.send('Network.getResponseBody',{requestId:docId}); const m=b.body.match(/\+ "([0-9a-f]{16})"/); S=m?m[1]:null; }catch(e){} }
  const X=await ev(`(function(){var q=(window.__prints||[]).filter(function(s){return /RandomString/.test(s);});return q.length?String(q[0]).replace(/.*RandomString:\\s*/,'').trim():null;})()`);
  const domHas=await ev(`document.body.innerHTML.indexOf('secretkey')>=0`);
  const bodyLen=await ev(`document.body.innerHTML.length`);
  log('RESULT '+JSON.stringify({S:S,X:X,domHasSecretkey:domHas,bodyLen:bodyLen,prints:(await ev('JSON.stringify((window.__prints||[]).slice(0,5))'))}));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
