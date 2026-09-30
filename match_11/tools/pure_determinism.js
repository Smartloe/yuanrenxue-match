/** 纯启动（加载期间零 CDP 干预）后测试 SecretKey 是否确定性、random_str 是否与时间相关 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9382;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11pd-'));
  const ch=spawn(CHROME,['--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--remote-allow-origins=*','--window-size=1200,800',PAGE_URL],{stdio:['ignore','ignore','ignore']});
  await sleep(20000);
  for(let i=0;i<60;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=tabs.find(t=>t.type==='page'&&t.url.includes('yuanrenxue'));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pend=new Map();
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));setTimeout(res,8000);});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r&&r.exceptionDetails)return 'EXC '+((r.exceptionDetails.exception||{}).description||'').slice(0,200);return r&&r.result?r.result.value:JSON.stringify(r);};
  log('SecretKey 同输入 4 次:', await ev(`(function(){var f=window.SecretKey,o=[];for(var i=0;i<4;i++){try{o.push(String(f('test')).slice(0,48));}catch(e){o.push('ERR');}}return JSON.stringify(o);})()`));
  log('random_str 3 个实例:', await ev(`(function(){var o=[];for(var i=0;i<3;i++){try{o.push(new window.DevtoolsTrap().random_str);}catch(e){o.push('ERR');}}return JSON.stringify(o);})()`));
  log('randomString(16) 3 次:', await ev(`(function(){var o=[];for(var i=0;i<3;i++){try{o.push(window.randomString(16));}catch(e){o.push('ERR');}}return JSON.stringify(o);})()`));
  log('实例状态:', await ev(`(function(){try{var i=new window.DevtoolsTrap();return JSON.stringify({triggeredMap:i.triggeredMap,checkEnv:i.checkEnv(),random_str:i.random_str});}catch(e){return 'ERR '+e.message;}})()`));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
