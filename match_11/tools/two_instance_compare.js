/** 两个同时启动的页面实例，比较盾打印的 RandomString 序列是否一致（判断是否为时间派生） */
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
function makeInstance(tag, out){
  const vc=new VirtualConsole();
  for(const ev of ['log','info','warn','error','debug','dir','table'])
    vc.on(ev,(...a)=>out.push({tag,t:Date.now(),s:a.map(String).join(' ')}));
  vc.on('jsdomError',()=>{});
  return new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',resources:{userAgent:UA},pretendToBeVisual:true,virtualConsole:vc});
}
const out=[];
const t0=Date.now();
makeInstance('A',out);
setTimeout(()=>makeInstance('B',out), 300);   // 错开 300ms 启动
setTimeout(()=>{
  const rs=out.filter(o=>/RandomString/.test(o.s)).map(o=>({tag:o.tag,ms:o.t-t0,s:(o.s.match(/RandomString:?\s*(\S+)/)||[])[1]}));
  console.log('序列:');
  rs.forEach(r=>console.log(`  ${r.tag} +${r.ms}ms  ${r.s}`));
  const a=rs.filter(r=>r.tag==='A'), b=rs.filter(r=>r.tag==='B');
  console.log(`\nA ${a.length} 条, B ${b.length} 条`);
  // 比较同一时间窗内的值
  let same=0, diff=0;
  for(const x of a){ for(const y of b){ if(Math.abs(x.ms-y.ms)<400){ if(x.s===y.s) same++; else diff++; } } }
  console.log(`时间窗内(<400ms) 相同 ${same} 对 / 不同 ${diff} 对`);
  process.exit(0);
},20000);
