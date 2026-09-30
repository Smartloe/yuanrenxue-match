/**
 * 猿人学第8题 —— 验证码 - 图文点选
 *
 * 机制：
 *   1. GET /api2/8 → {targets, image, w, h, id}
 *      image 是 3×3 的字符图（webp/base64），targets 是需要依次点选的 4 个字符；
 *   2. POST /api2/8 {captcha_id, clicks: JSON.stringify([{x,y},...])} 校验点选，
 *      通过后服务端把这次会话"解锁"；
 *   3. 之后才能请求 /api/question/8?page=N（**每页都要重新过一次验证码**），
 *      每页 10 个数字，答案 = 5 页之和（第 5 页 UA 需 yuanrenxue）。
 *
 * 识别部分：验证码是字符图（字符池很大，不宜枚举做模板），
 * 本脚本把坐标来源做成两种：
 *   - 自动：若存在 docs/clicks.json（形如 {"1":[[x,y],[x,y],[x,y],[x,y]], ...} 按页存坐标）则直接使用；
 *   - 半自动：否则把验证码图片与网格线渲染到 docs/cap_<page>.png，人工看图后
 *     把坐标写进 docs/clicks.json 再重跑（点选坐标 = 目标字符所在格子的中心，
 *     3×3 网格中心依次为 (50,50) (150,50) (250,50) / (50,150) ... 按 300×300 计）。
 *
 * 用法：
 *   node main.js                 # 自动取码并渲染，缺坐标时提示
 *   node main.js --submit        # 取数后提交
 */
const fs = require('fs');
const path = require('path');

const HOST = 'https://match.yuanrenxue.cn';
const Q = 8;
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const H = (ua, extra = {}) => ({
  cookie: cfg.cookie, referer: `${HOST}/match/${Q}`, 'user-agent': ua,
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01', ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取一张验证码，把图片与 targets 落盘（webp，可直接用浏览器/预览打开） */
async function fetchCaptcha(page) {
  const res = await fetch(`${HOST}/api2/8?t=${Date.now()}`, { headers: H(UA_BROWSER) });
  const j = await res.json();
  const docs = path.join(__dirname, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  const b64 = String(j.image).replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(path.join(docs, `cap_page${page}.webp`), Buffer.from(b64, 'base64'));
  return j;
}

/** 提交点选坐标 */
async function submitClicks(id, clicks) {
  const res = await fetch(`${HOST}/api2/8`, {
    method: 'POST',
    headers: H(UA_BROWSER, { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }),
    body: new URLSearchParams({ captcha_id: String(id), clicks: JSON.stringify(clicks) }).toString(),
  });
  return res.json();
}

(async () => {
  const clickFile = path.join(__dirname, 'docs/clicks.json');
  const coordMap = fs.existsSync(clickFile) ? JSON.parse(fs.readFileSync(clickFile, 'utf8')) : {};
  const values = [];

  for (let page = 1; page <= 5; page++) {
    const cap = await fetchCaptcha(page);
    const gridHints = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) gridHints.push(`(${(c * 2 + 1) * cap.w / 6},${(r * 2 + 1) * cap.h / 6})`);
    console.log(`[+] 第${page}页验证码: id=${cap.id} 目标=${cap.targets.join('')} 图片→ docs/cap_page${page}.webp`);
    console.log(`    3×3 格子中心: ${gridHints.join(' ')}`);

    const clicks = coordMap[String(page)] || coordMap[cap.targets.join('')];
    if (!clicks) {
      console.log(`[!] 缺少第${page}页点选坐标。请看 docs/cap_page${page}.webp，把目标字符所在格子的中心坐标写入 docs/clicks.json（形如 {"${page}": [{"x":50,"y":50}, ...]}）后重跑。`);
      return;
    }
    const r = await submitClicks(cap.id, clicks);
    console.log(`    验证码校验: ${JSON.stringify(r)}`);
    if (!r.ok) throw new Error(`第${page}页验证码未通过: ${JSON.stringify(r)}`);

    const ua = page === 5 ? 'yuanrenxue' : UA_BROWSER;          // 第 5 页 UA 要求
    const res = await fetch(`${HOST}/api/question/${Q}?page=${page}&pageSize=10&kw=`, { headers: H(ua) });
    const j = await res.json();
    if (!Array.isArray(j.data)) throw new Error(`第${page}页取数失败: ${JSON.stringify(j).slice(0, 120)}`);
    values.push(...j.data);
    console.log(`    第${page}页 ${JSON.stringify(j.data)}`);
    await sleep(400);
  }

  const total = values.reduce((a, b) => a + b, 0);
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${total}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total, count: values.length, values }, null, 2));
  if (!process.argv.includes('--submit')) return console.log('[*] 未加 --submit，只取数');

  const sub = await fetch(`${HOST}/a/${Q}`, {
    method: 'POST',
    headers: H('yuanrenxue', { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', origin: HOST }),
    body: new URLSearchParams({ answer: String(total) }).toString(),
  });
  const out = JSON.parse(await sub.text());
  console.log('[*] 提交 →', JSON.stringify(out));
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...saved, response: out }, null, 2));
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
