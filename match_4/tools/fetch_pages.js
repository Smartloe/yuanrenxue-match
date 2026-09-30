/** 抓取 Q4 五页原始响应并存盘 */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const H={cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/4','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36','x-requested-with':'XMLHttpRequest',accept:'application/json, text/javascript, */*; q=0.01'};
(async()=>{
  for(let p=1;p<=5;p++){
    const r=await fetch('https://match.yuanrenxue.cn/api/question/4?page='+p+'&pageSize=10&kw=',{headers:H});
    const t=await r.text();
    let j; try{ j=JSON.parse(t); }catch(e){ console.log('page'+p,'非JSON:',t.slice(0,200)); continue; }
    fs.writeFileSync(path.join(__dirname,'..','docs','raw_page'+p+'.json'), JSON.stringify(j,null,2));
    console.log('page'+p,'status=',j.status,'key=',j.key,'value=',j.value,'iv=',j.iv,'info长度=',String(j.info||'').length);
  }
})();
