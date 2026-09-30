const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9362;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11rs-'));
  const ch=spawn(CHROME,['--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--remote-allow-origins=*','--window-size=1200,800',PAGE_URL],{stdio:['ignore','ignore','ignore']});
  await sleep(20000);
  let v=null;for(let i=0;i<60;i++){try{v=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=tabs.find(t=>t.type==='page'&&t.url.includes('yuanrenxue'));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pend=new Map();
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));setTimeout(res,8000);});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});return r&&r.result?r.result.value:JSON.stringify(r);};
  log('randomString 类型:', await ev('typeof window.randomString'));
  log('randomString 值  :', await ev('(function(){try{return typeof window.randomString==="function" ? "FUNC:"+String(window.randomString) .slice(0,80) : JSON.stringify(window.randomString);}catch(e){return "ERR "+e.message;}})()'));
  log('连续读取 3 次    :', await ev('(function(){var o=[];for(var i=0;i<3;i++){try{o.push(String(window.randomString).slice(0,40));}catch(e){o.push("ERR");}}return JSON.stringify(o);})()'));
  log('SecretKey 属性   :', await ev('JSON.stringify(Object.getOwnPropertyNames(window.SecretKey))'));
  log('SecretKey 同输入3次:', await ev(`(function(){var f=window.SecretKey;var o=[];for(var i=0;i<3;i++){try{o.push(String(f('test')).slice(0,32));}catch(e){o.push('ERR');}}return JSON.stringify(o);})()`));
  log('用 randomString 调:', await ev(`(function(){try{var rs=String(window.randomString);return JSON.stringify({rs:rs.slice(0,40), out:String(window.SecretKey(rs+'3f73bd8671faaa92')).slice(0,80)});}catch(e){return 'ERR '+e.message;}})()`));
  log('所有可疑全局:', await ev('JSON.stringify(Object.getOwnPropertyNames(window).filter(function(k){return /secret|random|risk|trap|wlz|dev/i.test(k);}))'));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
