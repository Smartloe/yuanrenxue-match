/** 逐个执行盾的检测方法，找出在当前环境下到底是哪个风险项被触发 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9384;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11wr-'));
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
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,250);return r&&r.result?r.result.value:JSON.stringify(r);};

  log('单个检查逐项结果:', await ev(`(function(){
    var T=window.DevtoolsTrap, out={};
    var tests=[['checkEnv',1],['checkDimensions',0],['checkDebugger',0],['checkConsole',0],['checkConsoleErrorProperty',0],['checkConsoleDirTrap',0],['checkConsoleLogArrayPerformance',0],['checkPromiseErrorGetter',0]];
    for(var i=0;i<tests.length;i++){
      var name=tests[i][0], needArg=tests[i][1];
      var inst=new T();
      var before=JSON.stringify(inst.triggeredMap);
      var ret;
      try{ ret = needArg ? inst[name]() : inst[name](); }catch(e){ ret='throw:'+e.message; }
      var after=inst.triggeredMap;
      var fired=Object.keys(after).filter(function(k){ return after[k]; });
      out[name]={ret:(typeof ret==='object'?JSON.stringify(ret):String(ret)).slice(0,80), fired:fired, triggered:inst.triggered};
    }
    return JSON.stringify(out,null,1);
  })()`));

  log('\ncheckAll 之后:', await ev(`(function(){
    var inst=new window.DevtoolsTrap();
    try{ inst.checkAll(); }catch(e){ return 'throw '+e.message; }
    return JSON.stringify({map:inst.triggeredMap, triggered:inst.triggered});
  })()`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
