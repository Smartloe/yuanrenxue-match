/** 一轮：用当前验证码提交点选 → 取指定页数据 */
const fs=require('fs'),path=require('path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const H=ua=>({cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/8','user-agent':ua,'x-requested-with':'XMLHttpRequest',accept:'application/json, text/javascript, */*; q=0.01'});
(async()=>{
  const page=Number(process.argv[2]);
  const clicks=process.argv[3];
  const cap=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs','cap_current.json'),'utf8'));
  const body=new URLSearchParams({captcha_id:String(cap.id),clicks:String(clicks)}).toString();
  const pr=await fetch('https://match.yuanrenxue.cn/api2/8',{method:'POST',headers:{...H('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'),'content-type':'application/x-www-form-urlencoded; charset=UTF-8'},body});
  const pt=await pr.text();
  let pj; try{ pj=JSON.parse(pt) }catch(e){ pj={raw:pt.slice(0,150)}; }
  console.log('验证码:', JSON.stringify(pj));
  if(!pj.ok) return;
  const ua=page===5?'yuanrenxue':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const r=await fetch(`https://match.yuanrenxue.cn/api/question/8?page=${page}&pageSize=10&kw=`,{headers:H(ua)});
  const t=await r.text();
  let j; try{ j=JSON.parse(t) }catch(e){ console.log('数据非JSON:',t.slice(0,150)); return; }
  if(!Array.isArray(j.data)){ console.log('数据异常:',JSON.stringify(j).slice(0,150)); return; }
  console.log(`[+] 第${page}页 ${JSON.stringify(j.data)}  小计=${j.data.reduce((a,b)=>a+b,0)}`);
  const f=path.join(__dirname,'..','docs',`page${page}.json`);
  fs.writeFileSync(f, JSON.stringify(j.data));
})();
