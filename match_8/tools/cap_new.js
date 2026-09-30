/** 取一张新验证码并转成 PNG 便于查看 */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
(async()=>{
  const r=await fetch('https://match.yuanrenxue.cn/api2/8?t='+Date.now(),{headers:{cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/8','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36','x-requested-with':'XMLHttpRequest',accept:'application/json'}});
  const j=await r.json();
  fs.writeFileSync(path.join(__dirname,'..','docs','cap_current.json'),JSON.stringify(j,null,2));
  fs.writeFileSync(path.join(__dirname,'..','docs','cap_current.webp'),Buffer.from(String(j.image).replace(/^data:image\/\w+;base64,/,''),'base64'));
  console.log('id =', j.id, '| 目标 =', j.targets.join(','), '| 尺寸', j.w+'x'+j.h);
  console.log('格子中心坐标（3x3，每格 '+(j.w/3)+'x'+(j.h/3)+'）:');
  for(let r2=0;r2<3;r2++){ const row=[]; for(let c=0;c<3;c++){ row.push(`(${Math.round((c+0.5)*j.w/3)},${Math.round((r2+0.5)*j.h/3)})`); } console.log('  ',row.join(' ')); }
})();
