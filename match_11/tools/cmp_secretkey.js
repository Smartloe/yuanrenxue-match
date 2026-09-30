/** 对比 jsdom 与真实 Chrome 下 SecretKey 的输出是否一致（判断是否存在"真假函数"） */
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const vc=new VirtualConsole();
const dom=new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',resources:{userAgent:UA},pretendToBeVisual:true,virtualConsole:vc});
setTimeout(()=>{
  const w=dom.window;
  const out={};
  for(const k of ['SecretKey']){
    try{ out[k]=['test',"3f73bd8671faaa92",'abc'].map(s=>s+' => '+String(w[k](s)).slice(0,80)); }catch(e){ out[k]='ERR '+e.message; }
  }
  process.stdout.write('JSDOM '+JSON.stringify(out)+'\n');
  process.stdout.write('JSDOM secretkey type='+typeof w.secretkey+'\n');
  process.exit(0);
},13000);
