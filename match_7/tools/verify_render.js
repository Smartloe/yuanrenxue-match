/** 把某页的 woff + data 渲染成图，肉眼校验解码是否正确 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9484;const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}});}
 send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout'));}},25000);});}}
(async()=>{
  const p=Number(process.argv[2]||1);
  const j=await (await fetch(`https://match.yuanrenxue.cn/api/question/7?page=${p}&pageSize=10&kw=`,{headers:{cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/7','user-agent':UA,'x-requested-with':'XMLHttpRequest'}})).json();
  fs.writeFileSync(path.join(__dirname,'..','docs',`verify_page${p}.json`), JSON.stringify(j,null,2));
  const html=`<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:q7f;src:url(data:font/woff;base64,${j.woff}) format('woff');}
    body{font-family:q7f;font-size:34px;background:#fff;margin:12px;letter-spacing:2px}
    div{margin:6px 0}
  </style>`+j.data.map(s=>`<div>${s}</div>`).join('');
  const dir=fs.mkdtempSync(os.tmpdir()+'/yrx7v-');
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=700,700','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  const cdp=new CDP(ws);await cdp.send('Page.enable');
  await cdp.send('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(html)});
  await sleep(3000);
  const s=await cdp.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:620,height:460,scale:2}});
  fs.writeFileSync(path.join(__dirname,'..','docs',`verify_page${p}.png`),Buffer.from(s.data,'base64'));
  console.log('已渲染 docs/verify_page'+p+'.png');
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{console.error('[-]',e.message);process.exit(1);});
