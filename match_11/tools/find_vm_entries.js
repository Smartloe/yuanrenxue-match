/** 扫描 window（及一层嵌套）上所有"VM 入口函数"（源码形如 function gL(...)），找出所有暴露的入口 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9388;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11vm-'));
  const ch=spawn(CHROME,['--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--remote-allow-origins=*','--window-size=1200,800',PAGE_URL],{stdio:['ignore','ignore','ignore']});
  await sleep(20000);
  for(let i=0;i<60;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=tabs.find(t=>t.type==='page'&&t.url.includes('yuanrenxue'));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pend=new Map();
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));setTimeout(res,10000);});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,200);return r&&r.result?r.result.value:JSON.stringify(r);};
  const scan=`(function(){
    var out=[];
    var isVM=function(f){
      try{
        var s=Function.prototype.toString.call(f);
        return /function gL\\s*\\(/.test(s) || /\\uFB1E/.test(s) || s.indexOf('ﱞ') >= 0;
      }catch(e){ return false; }
    };
    var seen={};
    var add=function(path,f){
      try{ if(seen[path]) return; seen[path]=1;
        out.push({path:path, name:(f.name||''), len:f.length, src:Function.prototype.toString.call(f).slice(0,40)});
      }catch(e){}
    };
    Object.getOwnPropertyNames(window).forEach(function(k){
      var v; try{ v=window[k]; }catch(e){ return; }
      if(typeof v==='function' && isVM(v)) add('window.'+k, v);
      else if(v && typeof v==='object'){
        try{ Object.getOwnPropertyNames(v).forEach(function(k2){ var v2; try{ v2=v[k2]; }catch(e){ return; } if(typeof v2==='function' && isVM(v2)) add('window.'+k+'.'+k2, v2); }); }catch(e){}
      }
    });
    return JSON.stringify(out,null,1);
  })()`;
  log('window 上的 VM 入口:', await ev(scan));
  // 也看看 window.constructor / 全局对象上有没有
  log('\nDevtoolsTrap 原型上的 VM 入口:', await ev(`JSON.stringify(Object.getOwnPropertyNames(window.DevtoolsTrap ? window.DevtoolsTrap.prototype : {}))`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
