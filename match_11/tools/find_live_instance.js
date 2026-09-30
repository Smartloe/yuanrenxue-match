const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9376;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11li-'));
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
  log('查找活的 DevtoolsTrap 实例:', await ev(`(function(){
    var T=window.DevtoolsTrap, found=[];
    Object.getOwnPropertyNames(window).forEach(function(k){
      var v; try{ v=window[k]; }catch(e){ return; }
      try{ if(v instanceof T) found.push(k); }catch(e){}
    });
    // 也查一层嵌套
    var nested=[];
    Object.getOwnPropertyNames(window).forEach(function(k){
      var v; try{ v=window[k]; }catch(e){ return; }
      if(v && typeof v==='object'){
        try{ Object.getOwnPropertyNames(v).forEach(function(k2){ try{ if(v[k2] instanceof T) nested.push(k+'.'+k2); }catch(e){} }); }catch(e){}
      }
    });
    return JSON.stringify({found:found,nested:nested});
  })()`));
  log('类静态属性:', await ev('JSON.stringify(Object.getOwnPropertyNames(window.DevtoolsTrap))'));
  log('实例的属性描述符(看是否隐藏了字段):', await ev(`(function(){
    try{
      var i=new window.DevtoolsTrap();
      var out={};
      Object.getOwnPropertyNames(i).forEach(function(k){
        var d=Object.getOwnPropertyDescriptor(i,k);
        out[k]={type:typeof i[k],get:!!d.get,set:!!d.set,enum:d.enumerable,conf:d.configurable};
      });
      return JSON.stringify(out);
    }catch(e){ return 'ERR '+e.message; }
  })()`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
