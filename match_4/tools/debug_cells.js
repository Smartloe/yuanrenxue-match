/** 调试：打印每格可见字形数、识别数字、匹配距离 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {decodePng,feature,dist2}=require('../utils/png');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config','session.json'),'utf8'));
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs/templates.json'),'utf8'));
const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config/labels.json'),'utf8'));
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IMG=/<img[^>]*src="data:image\/png;base64,([^"]+)"[^>]*class="([^"]*)"[^>]*style="([^"]*)"/g;
const TD=/<td[^>]*>([\s\S]*?)<\/td>/g;
const cls=f=>{let b=-1,bd=Infinity;for(const t of T){const d=dist2(f,t.feat);if(d<bd){bd=d;b=t.id;}}return {d:L[String(b)],dist:bd};};
(async()=>{
  for(const p of [1,5]){
    const ua=p===5?'yuanrenxue':UA;
    const j=await (await fetch(`https://match.yuanrenxue.cn/api/question/4?page=${p}&pageSize=10&kw=`,{headers:{cookie:cfg.cookie,referer:'https://match.yuanrenxue.cn/match/4','user-agent':ua,'x-requested-with':'XMLHttpRequest'}})).json();
    const hidden=crypto.createHash('md5').update(Buffer.from(j.key+j.value).toString('base64').replace(/=/g,'')).digest('hex');
    console.log(`--- page${p} key=${j.key} value=${j.value} hidden=${hidden.slice(0,8)}`);
    let td,ti=0;TD.lastIndex=0;
    while((td=TD.exec(String(j.info)))){
      const g=[];let m;IMG.lastIndex=0;
      while((m=IMG.exec(td[1]))){
        const c=m[2].split(' ').pop();
        const left=parseFloat((m[3].match(/left:\s*(-?[\d.]+)px/)||[])[1]);
        const r=cls(feature(decodePng(Buffer.from(m[1],'base64'))));
        g.push({left,digit:r.d,dist:r.dist,hidden:c===hidden});
      }
      const vis=g.filter(x=>!x.hidden);
      vis.sort((a,b)=>a.left-b.left);
      console.log(`  td${ti}: 总${g.length} 可见${vis.length}  digits=${vis.map(x=>x.digit).join('')}  maxDist=${vis.length?Math.max(...vis.map(x=>x.dist)).toFixed(2):'-'}`);
      ti++;
    }
  }
})().catch(e=>{console.error('[-]',e.message);process.exit(1);});
