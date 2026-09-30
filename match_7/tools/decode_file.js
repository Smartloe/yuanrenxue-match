/** 用模板解码指定 raw json（复用主流程的渲染+匹配逻辑） */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path');
const {feature,dist2}=require('../utils/glyph');
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9486;const TPL=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config/templates7.json'),'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve,reject}=this.p.get(m.id);this.p.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}});}
 send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);rej(new Error('timeout'));}},25000);});}}
(async()=>{
  const file=process.argv[2];
  const j=JSON.parse(fs.readFileSync(file,'utf8'));
  const cps=[...new Set((j.data.join('').match(/&#x[0-9a-f]+/gi)||[]).map(c=>parseInt(c.slice(3),16)))];
  const dir=fs.mkdtempSync(os.tmpdir()+'/yrx7d-');
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  const cdp=new CDP(ws);await cdp.send('Page.enable');
  const r=await cdp.send('Runtime.evaluate',{expression:`(async function(){
    var bin=atob(${JSON.stringify(j.woff)});var bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    var url=URL.createObjectURL(new Blob([bytes],{type:'font/woff'}));
    var fam='q7v'+Math.random().toString(36).slice(2);
    var ff=new FontFace(fam,"url("+url+") format('woff')");await ff.load();document.fonts.add(ff);
    var cps=${JSON.stringify(cps)},W=40,H=56,out=[];
    var cv=document.createElement('canvas');cv.width=W;cv.height=H;var ctx=cv.getContext('2d');
    for(var k=0;k<cps.length;k++){
      ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#000';ctx.font='40px '+fam;ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.fillText(String.fromCharCode(cps[k]),W/2,H/2);
      var d=ctx.getImageData(0,0,W,H).data;var gray=[];
      for(var j2=0;j2<W*H;j2++)gray.push(Math.round(0.299*d[j2*4]+0.587*d[j2*4+1]+0.114*d[j2*4+2]));
      out.push({cp:cps[k],gray:gray});
    }
    return JSON.stringify({W:W,H:H,glyphs:out});
  })()`,returnByValue:true,awaitPromise:true});
  const info=JSON.parse(r.result.value);
  const map={};
  for(const g of info.glyphs){
    const f=feature(g.gray,info.W,info.H);
    let best=null,bd=Infinity;
    for(const tpl of TPL){const d=dist2(f,tpl.feat);if(d<bd){bd=d;best=tpl.digit;}}
    map[g.cp]=best;
    console.log('cp',g.cp.toString(16),'-> 模板判定',best,' 距离',bd.toFixed(2));
  }
  console.log('\n解码结果:');
  j.data.forEach(s=>console.log('  ',s.replace(/&#x([0-9a-f]+);?/gi,(_,h)=>map[parseInt(h,16)])));
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{console.error('[-]',e.message);process.exit(1);});
