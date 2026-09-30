/** POST 验证码点选坐标，打印响应与 Set-Cookie */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
(async()=>{
  const j=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs','cap_current.json'),'utf8'));
  const clicks=JSON.parse(process.argv[2]);
  const body=new URLSearchParams({captcha_id:String(j.id),clicks:JSON.stringify(clicks)}).toString();
  const r=await fetch('https://match.yuanrenxue.cn/api2/8',{method:'POST',headers:{cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/8','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36','x-requested-with':'XMLHttpRequest','content-type':'application/x-www-form-urlencoded; charset=UTF-8',accept:'application/json, text/javascript, */*; q=0.01'},body});
  const text=await r.text();
  console.log('POST /api2/8 →', r.status, text);
  const sc=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')].filter(Boolean);
  console.log('Set-Cookie:', JSON.stringify(sc));
  if(sc.length){ const ck=sc.map(c=>c.split(';')[0]).join('; '); fs.writeFileSync(path.join(__dirname,'..','docs','cap_cookie.txt'), ck); console.log('已保存 docs/cap_cookie.txt'); }
})();
