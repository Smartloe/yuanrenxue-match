/** 在 DevTools 前端 Console 面板点开"Default levels"下拉，截图看有哪些级别选项 */
const { spawn } = require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9420;const PAGE_URL='https://match.yuanrenxue.cn/match/11';
const VM='yrx_check_devtools_jsvmp';
const SESSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const log=(...a)=>process.stdout.write(a.join(' ')+'\n');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const raw=fs.readFileSync(path.join(__dirname,'..','static','devtools_jsvmp.js'),'utf8');
const patched=raw.split('function(){debugger}()').join('function(){}()');
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();this.h=[];
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method)for(const f of this.h)f(m);});}
 on(f){this.h.push(f);} send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout '+method));}},25000);});}}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx11cl-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1600,1000','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new CDP(ws);
  cdp.on(async m=>{if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;
    if(request.url.includes(VM)){try{await cdp.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript; charset=utf-8'}],body:Buffer.from(patched,'utf8').toString('base64')});}catch{}return;}
    if(request.url.startsWith('https://match.yuanrenxue.cn')&&!request.url.includes('/match/11')){try{await cdp.send('Fetch.failRequest',{requestId,errorReason:'Aborted'});}catch{}return;}
    try{await cdp.send('Fetch.continueRequest',{requestId});}catch{}}});
  await cdp.send('Page.enable');await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'sessionid',value:SESSION.sessionid,domain:'match.yuanrenxue.cn',path:'/',secure:true});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await cdp.send('Page.navigate',{url:PAGE_URL});
  await sleep(2500);
  const dtUrl=`devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${t.id}&panel=console`;
  const dt=await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(dtUrl)}`,{method:'PUT'})).json();
  await sleep(6000);
  const dtWs=new WebSocket(dt.webSocketDebuggerUrl);await new Promise((r,j)=>{dtWs.addEventListener('open',r);dtWs.addEventListener('error',j);});
  const d=new CDP(dtWs);await d.send('Page.enable');
  try{await d.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});}catch{}
  await sleep(2000);
  const shot=async(name)=>{const s=await d.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'..','docs',name),Buffer.from(s.data,'base64'));log('  截图:',name);};
  await shot('dt_console_before.png');
  // 点击 "Default levels" 下拉（坐标来自上一张截图）
  const click=async(x,y)=>{await d.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
                            await d.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
  log('[*] 点击 Default levels 下拉 (1253,107)');
  await click(1253,107);
  await sleep(1200);
  await shot('dt_levels_menu.png');
  // 顺便把前端 DOM 里的 console 消息文本抓出来
  const txt=await d.send('Runtime.evaluate',{expression:`(function(){
    function walk(root, out){
      var nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (var i=0;i<nodes.length;i++){
        var el = nodes[i];
        if (el.shadowRoot) walk(el.shadowRoot, out);
        var t = (el.innerText||'').trim();
        if (t && t.length < 300 && /Random|secret|console was cleared/i.test(t)) out.push(t);
      }
      return out;
    }
    return JSON.stringify(walk(document, []).slice(0,20));
  })()`,returnByValue:true});
  log('[*] 前端 DOM 里匹配到的文本:', JSON.stringify(txt.result && txt.result.value));
  ws.close();dtWs.close();ch.kill();await sleep(200);
})().catch(e=>{log('[-]',e.message);process.exit(1);});
