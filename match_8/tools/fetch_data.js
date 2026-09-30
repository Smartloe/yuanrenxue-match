/** 验证码通过后取 5 页数据并求和（第5页 UA=yuanrenxue） */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const H=ua=>({cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/8','user-agent':ua,'x-requested-with':'XMLHttpRequest',accept:'application/json, text/javascript, */*; q=0.01'});
(async()=>{
  const pages=[];
  for(let p=1;p<=5;p++){
    const ua=p===5?'yuanrenxue':UA;
    const r=await fetch(`https://match.yuanrenxue.cn/api/question/8?page=${p}&pageSize=10&kw=`,{headers:H(ua)});
    const t=await r.text();
    let j; try{ j=JSON.parse(t) }catch(e){ console.log('第'+p+'页非 JSON:',t.slice(0,150)); return; }
    if(!Array.isArray(j.data)){ console.log('第'+p+'页异常:',JSON.stringify(j).slice(0,150)); return; }
    pages.push(j.data);
    console.log(`[+] 第${p}页 ${JSON.stringify(j.data)}`);
    await new Promise(r=>setTimeout(r,400));
  }
  const all=pages.flat(); const total=all.reduce((a,b)=>a+b,0);
  console.log(`\n[*] 共 ${all.length} 个数，总和 = ${total}`);
  fs.writeFileSync(path.join(__dirname,'..','result.json'), JSON.stringify({pages,total,count:all.length},null,2));
  if(process.argv.includes('--submit')){
    const r=await fetch('https://match.yuanrenxue.cn/a/8',{method:'POST',headers:{...H('yuanrenxue'),'content-type':'application/x-www-form-urlencoded; charset=UTF-8',origin:'https://match.yuanrenxue.cn'},body:new URLSearchParams({answer:String(total)}).toString()});
    const txt=await r.text(); console.log('[*] 提交 →',r.status,txt);
    const out=JSON.parse(fs.readFileSync(path.join(__dirname,'..','result.json'),'utf8'));
    fs.writeFileSync(path.join(__dirname,'..','result.json'),JSON.stringify({...out,response:JSON.parse(txt)},null,2));
  }
})();
