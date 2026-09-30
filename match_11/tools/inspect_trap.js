/** 检查 DevtoolsTrap 的内部状态：RISK_KEYS / triggeredMap / 各检查项的触发情况 */
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const HTML=fs.readFileSync(path.join(__dirname,'..','static','match11.html'),'utf8');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const vc=new VirtualConsole(); vc.on('jsdomError',()=>{});
const dom=new JSDOM(HTML,{url:'https://match.yuanrenxue.cn/match/11',runScripts:'dangerously',resources:{userAgent:UA},pretendToBeVisual:true,virtualConsole:vc});
const out=[];
setTimeout(()=>{
  const w=dom.window;
  const T=w.DevtoolsTrap;
  out.push('typeof DevtoolsTrap = '+typeof T);
  if(typeof T==='function'){
    out.push('own props: '+JSON.stringify(Object.getOwnPropertyNames(T)));
    for(const k of Object.getOwnPropertyNames(T)){
      let v; try{ v=T[k]; }catch(e){ out.push(`  ${k}: <getter throws>`); continue; }
      const t=typeof v;
      if(t==='function') out.push(`  ${k}: function`);
      else if(t==='object'&&v) out.push(`  ${k}: ${JSON.stringify(v).slice(0,300)}`);
      else out.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  // 看看是否有实例挂在 window 上
  for(const k of Object.getOwnPropertyNames(w).filter(x=>/dev|trap|risk/i.test(x))){
    let v; try{v=w[k];}catch(e){continue;}
    out.push(`window.${k} = ${typeof v}${typeof v==='object'&&v?': '+JSON.stringify(v).slice(0,200):''}`);
  }
  // console 相关：是否被替换
  out.push('console.log 是否原生: '+/native code/.test(Function.prototype.toString.call(w.console.log)));
  process.stdout.write(out.join('\n')+'\n');
  process.exit(0);
},13000);
