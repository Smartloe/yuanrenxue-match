const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9372;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11i-'));
  const ch=spawn(CHROME,['--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--remote-allow-origins=*','--window-size=1200,800',PAGE_URL],{stdio:['ignore','ignore','ignore']});
  await sleep(18000);
  for(let i=0;i<60;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=tabs.find(t=>t.type==='page'&&t.url.includes('yuanrenxue'));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pend=new Map();
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));setTimeout(res,8000);});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,150);return r&&r.result?r.result.value:JSON.stringify(r);};
  log('调用 window.initDevtoolsTrap():', await ev(`(function(){try{var r=window.initDevtoolsTrap();return 'ret='+typeof r+' '+String(r).slice(0,80)+' | globals='+JSON.stringify(Object.getOwnPropertyNames(window).filter(function(k){return /secret|random|trap|wlz/i.test(k);}));}catch(e){return 'ERR '+e.message;}})()`));
  log('new DevtoolsTrap() 后全局:', await ev(`(function(){try{var i=new window.DevtoolsTrap(); return JSON.stringify({random_str:i.random_str, triggeredMap:i.triggeredMap, globals:Object.getOwnPropertyNames(window).filter(function(k){return /secret|random|trap|wlz/i.test(k);})});}catch(e){return 'ERR '+e.message;}})()`));
  log('实例上是否有 secretkey 之类:', await ev(`(function(){try{var i=new window.DevtoolsTrap();var out={};Object.getOwnPropertyNames(i).forEach(function(k){ out[k]=typeof i[k]; }); out.__proto=Object.getOwnPropertyNames(Object.getPrototypeOf(i)); return JSON.stringify(out);}catch(e){return 'ERR '+e.message;}})()`));
  log('running onInit 后:', await ev(`(function(){try{var i=new window.DevtoolsTrap(); i.onInit(); var out={};Object.getOwnPropertyNames(i).forEach(function(k){ out[k]=typeof i[k]; }); out.__globals=Object.getOwnPropertyNames(window).filter(function(k){return /secret/i.test(k);}); return JSON.stringify(out);}catch(e){return 'ERR '+e.message;}})()`));
  log('startMonitoring 后:', await ev(`(function(){try{var i=new window.DevtoolsTrap(); i.startMonitoring(); var out={};Object.getOwnPropertyNames(i).forEach(function(k){ out[k]=typeof i[k]; }); out.__globals=Object.getOwnPropertyNames(window).filter(function(k){return /secret/i.test(k);}); return JSON.stringify(out);}catch(e){return 'ERR '+e.message;}})()`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
