/** dump 页面里 DevtoolsTrap / initDevtoolsTrap / yxr 的源码（探查反调试实现） */
const fs=require('fs'),path=require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const vc=new VirtualConsole();
const dom=new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',
  resources:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'},
  pretendToBeVisual:true,virtualConsole:vc});
setTimeout(()=>{
  const w=dom.window;
  for(const k of ['DevtoolsTrap','initDevtoolsTrap','yxr']){
    const v=w[k];
    process.stdout.write(`\n===== ${k} (${typeof v}) =====\n`);
    if(typeof v==='function') process.stdout.write(Function.prototype.toString.call(v).slice(0,2500)+'\n');
    else process.stdout.write(JSON.stringify(v).slice(0,800)+'\n');
  }
  process.stdout.write('\nmatch1='+JSON.stringify(w.match1)+'\n');
  const extra=Object.getOwnPropertyNames(w).filter(k=>/^(yxr|Dev|init|__)/.test(k));
  process.stdout.write('globals='+JSON.stringify(extra)+'\n');
  process.exit(0);
},12000);
