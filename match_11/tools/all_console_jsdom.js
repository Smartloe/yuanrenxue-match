/** 完整 dump jsdom 里页面的全部 console 输出（不过滤），看盾到底打印了什么 */
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const lines=[];
const vc=new VirtualConsole();
for(const ev of ['log','info','warn','error','debug','dir','table']) vc.on(ev,(...a)=>lines.push(`[${ev}] `+a.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x);}catch(e){return String(x);}}).join(' ')));
vc.on('jsdomError',()=>{});
const dom=new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',resources:{userAgent:UA},pretendToBeVisual:true,virtualConsole:vc});
setTimeout(()=>{
  const w=dom.window;
  const uniq=[...new Set(lines)];
  process.stdout.write(`共 ${lines.length} 条，去重 ${uniq.length} 条:\n`);
  uniq.forEach(l=>process.stdout.write('  '+l.slice(0,240)+'\n'));
  process.stdout.write(`\nsecretkey=${typeof w.secretkey} SecretKey=${typeof w.SecretKey} match1=${w.match1}\n`);
  process.exit(0);
},20000);
