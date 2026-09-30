/**
 * 为本会话完成的题目生成 README.md（从 notes 表 + result.json 汇总）
 * 用法：node tools_gen_readmes.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const notes = {
  12: { t: '入门级js', m: 'GET /api/question/12?page=N&pageSize=10&kw=&m=<base64("yuanrenxue"+页码)>', a: 'm 就是把 "yuanrenxue"+页码 做 base64', solved: true },
  13: { t: '入门级cookie', m: '先 GET /api2/13 拿到一段 JS，eval 后写入 document.cookie：yuanrenxue_cookie=<时间戳>|<随机串>；再带该 cookie 请求 /api/question/13', a: 'cookie 带时间戳会过期，必须每页重新取一次', solved: true },
  17: { t: '天杀的Http2.0', m: 'GET /api/question/17?page=N（服务端校验 HTTP/2）', a: 'Node 的 fetch(undici) 默认协商 h2，直接请求即可', solved: true },
  19: { t: '乌拉乌拉乌拉', m: 'GET /api/question/19?page=N，第5页 UA 必须为 yuanrenxue', a: '服务端校验 TLS/JA3 指纹：Node/curl 一律 token failed，必须借真实浏览器的网络栈取数', solved: true },
  4: { t: '雪碧图、样式干扰', m: 'GET /api/question/4?page=N 返回 {key,value,info}；info 里每个 <td> 塞多张 base64 PNG 数字字形，class=md5(base64(key+value)) 的被 display:none', a: '真实显示顺序 =（行内槽位×8.5px + left）排序；字形用模板匹配识别（docs/templates.json + config/labels.json）', solved: true },
  8: { t: '验证码 - 图文点选', m: 'GET /api2/8 取 3x3 字符图与 targets；POST /api2/8 {captcha_id, clicks} 点选通过后才解锁 /api/question/8', a: '每页数据都要重新过一次验证码；点选坐标就是目标字符所在格子的中心', solved: true },
  15: { t: '备周则意怠-常见则不疑', m: 'main.wasm 的 encode(t1,t2) 生成 m=<encode>|t1|t2', a: 'Node 原生 WebAssembly 直接实例化，无需浏览器', solved: true },
  22: { t: '初识 - 魔改标准算法', m: '页面内混淆 JS 生成 window.matchnumber 作为 m', a: '浏览器驱动翻页抓取（_shared/browser_pages.js）', solved: true },
  25: { t: '知名 - 当变量名"活"过来时', m: '页面内混淆 JS 生成 window.matchnumber（并带 token/now 参数）', a: '浏览器驱动翻页抓取', solved: true },
  27: { t: '异钥 - 不对称的语言，被拆散的结构', m: '页面内混淆 JS 生成 window.matchnumber', a: '浏览器驱动翻页抓取', solved: true },
  29: { t: '混淆 - 混乱构建，动态迷局', m: '/match/29/js/29.js 混淆生成参数', a: '浏览器驱动翻页抓取', solved: true },
  5: { t: 'js 混淆 - 乱码增强', m: '页面内混淆 JS 生成参数', a: '浏览器驱动翻页抓取', solved: true },
  6: { t: 'js 混淆 - 回溯', m: '页面内混淆 JS 生成参数', a: '浏览器驱动翻页抓取', solved: true },
  21: { t: '守心 - 简单的指令', m: '页面内混淆 JS 生成参数', a: '浏览器驱动翻页抓取', solved: true },
  24: { t: '不惑 - 零宽字符下的 JS 黑盒突围', m: '页面内混淆 JS 生成参数', a: '浏览器驱动翻页抓取', solved: true },
  14: { t: '备而后动-勿使有变', m: '页面内混淆 JS 生成参数', a: '浏览器驱动翻页抓取', solved: true },
  9: { t: 'js 混淆 - 动态cookie 2', m: '首次请求返回的不是 JSON 而是 JS，eval 后刷新 m；页面 reload 后再请求才有数据', a: '在页面上下文循环：拿到 JSON 就用，拿到 JS 就 eval 刷新 m 再请求；第5页切 UA=yuanrenxue', solved: true },
  7: { t: '动态字体，随风漂移', m: '/api/question/7 返回 {woff(实为 TTF), data}，data 用 &#xXXXX; 实体表示，靠该页动态字体映射成真数字', a: '浏览器渲染 10 个码点 → 二值化归一化特征 → 与模板做匈牙利算法匹配（10 个码点必是 0-9 的一个排列）', solved: true },
  10: { t: 'js 混淆 - 重放攻击对抗', m: '页面内混淆 JS 生成参数（含重放防护）', a: '浏览器驱动翻页抓取', solved: true },
  18: { t: 'jsvmp - 洞察先机', m: '/api/v/question/18data?page=N 需要一次性签名 t（服务端秒级时间）+ v（JSVMP 计算的 AES 密文）；第5页 UA 必须 yuanrenxue', a: '必须用真实输入事件点击分页（VM 校验 event.isTrusted）；VM 只给 page=2/3/4 签名，page=5 故意不签；签名与页码绑定、一次性、且与 UA 绑定', solved: false },
};

let n = 0;
for (const d of fs.readdirSync(ROOT)) {
  if (!/^match_\d+$/.test(d)) continue;
  const q = Number(d.replace('match_', ''));
  const note = notes[q];
  if (!note) continue;
  const rp = fs.existsSync(path.join(ROOT, d, 'result.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, d, 'result.json'), 'utf8')) : null;
  const resp = rp && rp.response ? JSON.stringify(rp.response) : '(见 result.json)';
  const total = rp && rp.total !== undefined ? rp.total : (rp && rp.answer ? String(rp.answer) : '—');
  const run = fs.existsSync(path.join(ROOT, d, 'main.js')) ? 'node main.js' : `node _shared/browser_pages.js --q ${q} --submit`;
  const md = [
    `# 猿人学第${q}题 —— ${note.t}`,
    '',
    '## 状态',
    note.solved ? '✅ 已通关' : '⚠️ 未通关（前 4 页可取，最后一页签名未能生成）',
    '',
    `- 本会话提交回执：\`${resp}\``,
    `- 答案/合计：\`${total}\``,
    '',
    '## 机制',
    note.m,
    '',
    '## 解法要点',
    note.a,
    '',
    '## 运行',
    '```bash',
    run,
    '```',
    '',
    '> 会话复用：`config/session.json`（已登录账号 陈希瑞）。',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, d, 'README.md'), md);
  n++;
}
console.log('已写', n, '份 README');
