const fs=require('fs'),path=require('path'),crypto=require('crypto');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const H=ua=>({cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/7','user-agent':ua,'x-requested-with':'XMLHttpRequest',accept:'application/json, text/javascript, */*; q=0.01'});
(async()=>{
  for(let p=1;p<=5;p++){
    const ua=p===5?'yuanrenxue':UA;
    const r=await fetch(`https://match.yuanrenxue.cn/api/question/7?page=${p}&pageSize=10&kw=`,{headers:H(ua)});
    const j=await r.json();
    if(!j.woff){ console.log('page'+p,'无 woff:',JSON.stringify(j).slice(0,120)); continue; }
    const h=crypto.createHash('md5').update(j.woff).digest('hex').slice(0,10);
    const cps=[...new Set((j.data||[]).join('').match(/&#x[0-9a-f]+/gi)||[])];
    console.log('page'+p,'woff md5='+h,'长度='+j.woff.length,'不同码点='+cps.length,'码点='+cps.map(c=>parseInt(c.slice(3),16).toString(16)).join(','));
    fs.writeFileSync(path.join(__dirname,'..','docs',`raw_page${p}.json`), JSON.stringify(j,null,2));
  }
})();
