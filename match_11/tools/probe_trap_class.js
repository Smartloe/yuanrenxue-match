const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9366;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11tc-'));
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

  log('原型方法:', await ev('JSON.stringify(Object.getOwnPropertyNames(window.DevtoolsTrap.prototype))'));
  log('静态属性:', await ev('JSON.stringify(Object.getOwnPropertyNames(window.DevtoolsTrap))'));
  log('randomString(16):', await ev('JSON.stringify([window.randomString(16),window.randomString(16),window.randomString(4),window.randomString(8)])'));
  log('实例化:', await ev(`(function(){
    try{
      var T=window.DevtoolsTrap;
      var inst=new T();
      var props=Object.getOwnPropertyNames(inst);
      var out={props:props};
      for(var i=0;i<props.length;i++){
        var k=props[i], v;
        try{ v=inst[k]; }catch(e){ out[k]='<throws>'; continue; }
        if(typeof v==='function') out[k]='function('+v.length+')';
        else if(v&&typeof v==='object') { try{ out[k]=JSON.stringify(v).slice(0,300); }catch(e){ out[k]='<obj>'; } }
        else out[k]=String(v).slice(0,120);
      }
      return JSON.stringify(out,null,1);
    }catch(e){ return 'ERR '+e.message; }
  })()`));
  log('实例方法:', await ev(`(function(){
    try{
      var inst=new window.DevtoolsTrap();
      var out={};
      var names=Object.getOwnPropertyNames(window.DevtoolsTrap.prototype);
      for(var i=0;i<names.length;i++){
        var n=names[i]; if(n==='constructor') continue;
        var f=inst[n];
        if(typeof f!=='function'){ out[n]=typeof f; continue; }
        try{ var r=f.call(inst); out[n]='ret:'+String(r).slice(0,120); }
        catch(e){ out[n]='throw:'+e.message.slice(0,80); }
      }
      return JSON.stringify(out,null,1);
    }catch(e){ return 'ERR '+e.message; }
  })()`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
