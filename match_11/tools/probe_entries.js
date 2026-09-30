const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9364;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11e-'));
  const ch=spawn(CHROME,['--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--remote-allow-origins=*','--window-size=1200,800',PAGE_URL],{stdio:['ignore','ignore','ignore']});
  await sleep(18000);
  let v=null;for(let i=0;i<60;i++){try{v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=tabs.find(t=>t.type==='page'&&t.url.includes('yuanrenxue'));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pend=new Map();
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));setTimeout(res,8000);});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,150);return r&&r.result?r.result.value:JSON.stringify(r);};
  const expr=`(function(){
    var names=['randomString','initDevtoolsTrap','DevtoolsTrap','SecretKey'];
    var suffix='3f73bd8671faaa92';
    var out={};
    for(var i=0;i<names.length;i++){
      var n=names[i], f=window[n];
      if(typeof f!=='function'){ out[n]='not a function ('+typeof f+')'; continue; }
      var rec={};
      try{ rec.arity=f.length; }catch(e){}
      try{ var r1; try{ r1=f(); }catch(e){ r1='throw:'+e.message; } rec.call0=String(r1).slice(0,120); }catch(e){ rec.call0='ERR'; }
      try{ var a=String(f('test')); var b=String(f('test')); rec.det=(a===b); rec.a=a.slice(0,64); rec.b=b.slice(0,64); }catch(e){ rec.det='ERR '+e.message; }
      try{ rec.withSuffix=String(f('test'+suffix)).slice(0,80); }catch(e){}
      out[n]=rec;
    }
    return JSON.stringify(out,null,1);
  })()`;
  log(await ev(expr));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
