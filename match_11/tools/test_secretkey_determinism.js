const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const vc=new VirtualConsole();
const dom=new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',resources:{userAgent:UA},pretendToBeVisual:true,virtualConsole:vc});
setTimeout(()=>{
  const w=dom.window;
  const f=w.SecretKey;
  const out=[];
  if(typeof f!=='function'){ process.stdout.write('SecretKey 不是函数\n'); process.exit(0);} 
  for(let i=0;i<3;i++){ try{ out.push('test#'+i+' = '+String(f('test')).slice(0,40)); }catch(e){ out.push('ERR '+e.message);} }
  try{ out.push('test2 = '+String(f('test2')).slice(0,40)); }catch(e){ out.push('ERR'); }
  try{ out.push('len(test) = '+String(f('test')).length); }catch(e){}
  process.stdout.write(out.join('\n')+'\n');
  process.exit(0);
},13000);
