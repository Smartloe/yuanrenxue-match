/** 尝试通过用户交互（keydown / contextmenu / click / focus）触发盾的正常分支 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9378;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();this.h=[];
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method)for(const f of this.h)f(m);});}
 on(f){this.h.push(f);} send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout '+method));}},20000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11in-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1440,900','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new CDP(ws);
  cdp.on(async m=>{if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;
    if(request.url.startsWith('https://match.yuanrenxue.cn')&&!request.url.includes('/match/11')){try{await cdp.send('Fetch.failRequest',{requestId,errorReason:'Aborted'});}catch{}}
    else{try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}}}});
  await cdp.send('Page.enable');await cdp.send('Network.enable');
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(12000);
  const st=async()=>{const r=await cdp.send('Runtime.evaluate',{expression:'typeof window.secretkey+"|"+JSON.stringify(Object.getOwnPropertyNames(window).filter(function(k){return /secret/i.test(k);}))',returnByValue:true});return r.result.value;};
  log('交互前:', await st());
  // 1) keydown
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F12',code:'F12',windowsVirtualKeyCode:123,nativeVirtualKeyCode:123});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F12',code:'F12',windowsVirtualKeyCode:123,nativeVirtualKeyCode:123});
  await sleep(2500); log('F12 后:', await st());
  // 2) 右键
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:200,button:'right',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:200,y:200,button:'right',clickCount:1});
  await sleep(2500); log('右键后:', await st());
  // 3) 点击页面
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:200,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:200,y:200,button:'left',clickCount:1});
  await sleep(2500); log('点击后:', await st());
  // 4) 页面内派发事件
  await cdp.send('Runtime.evaluate',{expression:`(function(){var ev=new KeyboardEvent('keydown',{key:'F12',keyCode:123,bubbles:true});window.dispatchEvent(ev);document.dispatchEvent(ev);document.body.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));})()`});
  await sleep(3000); log('派发事件后:', await st());
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
