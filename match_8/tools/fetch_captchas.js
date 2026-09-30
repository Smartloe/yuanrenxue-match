/** 抓多张验证码，切成 3x3 格子并保存 */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const H={cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/8','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36','x-requested-with':'XMLHttpRequest',accept:'application/json'};
(async()=>{
  const n=Number(process.argv[2]||10);
  const out=[];
  for(let i=0;i<n;i++){
    const r=await fetch('https://match.yuanrenxue.cn/api2/8?t='+Date.now(),{headers:H});
    const j=await r.json();
    const b64=String(j.image).replace(/^data:image\/\w+;base64,/,'');
    fs.writeFileSync(path.join(__dirname,'..','docs',`cap_${i}.webp`), Buffer.from(b64,'base64'));
    out.push({i, id:j.id, targets:j.targets, w:j.w, h:j.h, file:`cap_${i}.webp`});
    await new Promise(r=>setTimeout(r,300));
  }
  fs.writeFileSync(path.join(__dirname,'..','docs','captchas.json'), JSON.stringify(out,null,2));
  console.log('已抓取', out.length, '张；目标示例:', out.slice(0,5).map(o=>o.targets.join('')).join(' | '));
})();
