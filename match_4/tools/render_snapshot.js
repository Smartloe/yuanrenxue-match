/** 取一份快照 → 用浏览器按页面同样的 CSS 渲染 → 截图；同时输出 DOM 顺序解码结果，便于对照 */
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {decodePng,feature,dist2}=require('../utils/png');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs/templates.json'),'utf8'));
const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config/labels.json'),'utf8'));
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const CHROME=process.env.CHROME_BIN||'/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT=9446;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IMG=/<img[^>]*src="data:image\/png;base64,([^"]+)"[^>]*class="([^"]*)"[^>]*style="([^"]*)"/g;
const TD=/<td[^>]*>([\s\S]*?)<\/td>/g;
const cls=f=>{let b=-1,bd=Infinity;for(const t of T){const d=dist2(f,t.feat);if(d<bd){bd=d;b=t.id;}}return L[String(b)];};
class CDP{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&this.p.has(m.id)){const{resolve}=this.p.get(m.id);this.p.delete(m.id);resolve(m.result);}});}
 send(method,params={}){const id=++this.id;return new Promise(res=>{this.p.set(id,{resolve:res});this.ws.send(JSON.stringify({id,method,params}));setTimeout(res,20000);});}}
(async()=>{
  const j=await (await fetch('https://match.yuanrenxue.cn/api/question/4?page=1&pageSize=10&kw=',{headers:{cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/4','user-agent':UA,'x-requested-with':'XMLHttpRequest'}})).json();
  const hidden=crypto.createHash('md5').update(Buffer.from(j.key+j.value).toString('base64').replace(/=/g,'')).digest('hex');
  fs.writeFileSync(path.join(__dirname,'..','docs','snap_page1.json'), JSON.stringify(j,null,2));
  // 解码：DOM 顺序 vs left 排序
  const rows=[];let td,ti=0;TD.lastIndex=0;
  while((td=TD.exec(String(j.info)))){
    const g=[];let m;IMG.lastIndex=0;
    while((m=IMG.exec(td[1]))){
      if(m[2].split(' ').pop()===hidden) continue;
      const left=parseFloat((m[3].match(/left:\s*(-?[\d.]+)px/)||[])[1]);
      g.push({left,digit:cls(feature(decodePng(Buffer.from(m[1],'base64'))))});
    }
    const domOrder=Number(g.map(x=>x.digit).join(''));
    const leftOrder=Number([...g].sort((a,b)=>a.left-b.left).map(x=>x.digit).join(''));
    rows.push({ti,domOrder,leftOrder});
    ti++;
  }
  console.log('DOM 顺序解码:', rows.map(r=>r.domOrder).join(' '));
  console.log('left 排序解码:', rows.map(r=>r.leftOrder).join(' '));
  // 渲染同一份 info
  const html=`<!doctype html><meta charset="utf-8"><style>
    body{background:#faf7f2;margin:0;padding:16px;font-family:sans-serif}
    .img_number{position:relative;width:8.5px;}
    td{display:inline-flex;padding:0 6px;flex:0 0 auto;}
    table{border-collapse:collapse}
  </style><div class="pgx-line"><table><tbody><tr>${j.info}</tr></tbody></table></div>`;
  fs.writeFileSync(path.join(__dirname,'..','docs','render.html'), html);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yrx4r-'));
  const ch=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,'--no-first-run','--disable-gpu','--no-sandbox','--remote-allow-origins=*','--window-size=1400,400','about:blank'],{stdio:['ignore','ignore','ignore']});
  for(let i=0;i<80;i++){try{await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(300);}}
  const t=await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  const cdp=new CDP(ws);await cdp.send('Page.enable');
  const dataUrl='data:text/html;charset=utf-8,'+encodeURIComponent(html);
  await cdp.send('Page.navigate',{url:dataUrl});
  await sleep(2500);
  const s=await cdp.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'..','docs','render_shot.png'),Buffer.from(s.data,'base64'));
  console.log('已渲染截图 docs/render_shot.png');
  ws.close();ch.kill();await sleep(200);
})().catch(e=>{console.error('[-]',e.message);process.exit(1);});
