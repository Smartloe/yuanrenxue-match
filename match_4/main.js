/**
 * 猿人学第4题 —— 雪碧图、样式干扰
 *
 * 机制：
 *   1. GET /api/question/4?page=N&pageSize=10&kw= 返回 {key,value,iv,info}；
 *      info 是 HTML 表格，每个 <td> 里塞了多张"数字字形图片"（base64 PNG），靠 style="left:..px" 叠放；
 *   2. 页面把 class = md5(base64(key+value).去掉=) 的图片全部 display:none —— 这就是"样式干扰"；
 *      只有剩下的 6 张（按 left 排序）是真正显示出来的数字；
 *   3. 第 5 页要求 User-Agent: yuanrenxue。
 *
 * 解法：解码每张可见 PNG → 16x20 归一化特征 → 与预置的 10 个字形模板做最近邻匹配 → 拼成数字 → 求和。
 * 注意：接口数据每次请求都会变（服务端按会话记住"每页最后一次"的数据），
 *       所以必须一次性取完 5 页并立刻提交。
 *
 * 用法：node main.js [--no-submit]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decodePng, feature, dist2 } = require('./utils/png');

const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const TEMPLATES = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/templates.json'), 'utf8'));
const LABELS = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/labels.json'), 'utf8'));
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const H = (ua) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/4`, 'user-agent': ua,
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01',
});
const IMG_RE = /<img[^>]*src="data:image\/png;base64,([^"]+)"[^>]*class="([^"]*)"[^>]*style="([^"]*)"/g;
const TD_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;

const classify = (feat) => {
  let best = -1, bd = Infinity;
  for (const t of TEMPLATES) { const d = dist2(feat, t.feat); if (d < bd) { bd = d; best = t.id; } }
  return { digit: LABELS[String(best)], dist: bd };
};

function decodePage(info, j) {
  const hidden = crypto.createHash('md5')
    .update(Buffer.from(j.key + j.value).toString('base64').replace(/=/g, '')).digest('hex');
  const numbers = [];
  let td, ti = 0;
  TD_RE.lastIndex = 0;
  while ((td = TD_RE.exec(String(info)))) {
    const glyphs = [];
    let m, slot = 0; IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(td[1]))) {
      if (m[2].split(' ').pop() === hidden) continue;              // 被样式隐藏的图片不算
      const left = parseFloat((m[3].match(/left:\s*(-?[\d.]+)px/) || [])[1]);
      const { digit, dist } = classify(feature(decodePng(Buffer.from(m[1], 'base64'))));
      // 关键：每个字形占据一个 8.5px 的行内槽位，left 是相对的位移，
      // 真正的显示顺序要按"槽位×8.5 + left"的最终 x 坐标排序
      glyphs.push({ x: slot++ * 8.5 + left, left, digit, dist });
    }
    glyphs.sort((a, b) => a.x - b.x);
    const str = glyphs.map((g) => g.digit).join('');
    numbers.push({ cell: ti++, value: Number(str), digits: str, maxDist: Math.max(...glyphs.map((g) => g.dist)) });
  }
  return numbers;
}

(async () => {
  const pages = [];
  let total = 0, count = 0;
  for (let p = 1; p <= 5; p++) {
    const ua = p === 5 ? 'yuanrenxue' : UA_BROWSER;               // 第5页 UA 必须是 yuanrenxue
    const j = await (await fetch(`${HOST}/api/question/4?page=${p}&pageSize=10&kw=`, { headers: H(ua) })).json();
    if (!j.info) throw new Error(`第${p}页异常: ${JSON.stringify(j).slice(0, 150)}`);
    const nums = decodePage(j.info, j);
    const vals = nums.map((n) => n.value);
    pages.push(vals); total += vals.reduce((a, b) => a + b, 0); count += vals.length;
    console.log(`[+] 第${p}页 ${JSON.stringify(vals)}  小计=${vals.reduce((a, b) => a + b, 0)}`);
  }
  console.log(`\n[*] 共 ${count} 个数，总和 = ${total}`);
  const out = { pages, total, count };
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(out, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');

  const res = await fetch(`${HOST}/a/4`, {
    method: 'POST',
    headers: { ...H('yuanrenxue'), 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST },
    body: new URLSearchParams({ answer: String(total) }).toString(),
  });
  const text = await res.text();
  console.log(`[*] 提交 → HTTP ${res.status} ${text}`);
  const r = JSON.parse(text);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: r }, null, 2));
  if (r.code === 2) console.log('[*] ✅ 通关'); else if (r.code === 1) console.log('[*] ⚠️ 已通过'); else process.exitCode = 1;
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
