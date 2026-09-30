/** 手动触发盾的 trigger / forceRedirect，看是否会暴露真 secretkey */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9386;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11tg-'));
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
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,200);return r&&r.result?r.result.value:JSON.stringify(r);};
  const globals=()=>ev('JSON.stringify(Object.getOwnPropertyNames(window).filter(function(k){return /secret|random|trap/i.test(k);}))');
  log('基线全局:', await globals());
  log('调用 trigger("dimension_mismatch"):', await ev(`(function(){try{var i=new window.DevtoolsTrap(); i.trigger('dimension_mismatch'); return JSON.stringify({map:i.triggeredMap,trig:i.triggered});}catch(e){return 'ERR '+e.message;}})()`));
  await sleep(1000); log('  之后全局:', await globals());
  log('调用 forceRedirect():', await ev(`(function(){try{var i=new window.DevtoolsTrap(); i.forceRedirect(); return 'ok';}catch(e){return 'ERR '+e.message;}})()`));
  await sleep(1000); log('  之后全局:', await globals());
  log('直接调用 initDevtoolsTrap + startMonitoring:', await ev(`(function(){try{ var i=new window.DevtoolsTrap(); i.onInit(); i.startMonitoring(); return 'ok'; }catch(e){ return 'ERR '+e.message; }})()`));
  await sleep(3000); log('  之后全局:', await globals());
  log('  类型:', await ev('typeof window.secretkey+" / "+typeof window.SecretKey'));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
