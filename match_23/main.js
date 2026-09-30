/**
 * 猿人学第 23 题 —— js加密 - 感知 - 加强ob壳混淆
 *
 * 纯 Node.js 协议还原（不依赖浏览器、不依赖混淆代码运行时）：
 *   token = md5("/api/question/23" + now + page)
 * 其中 md5 是页面里被改写的「异化 MD5」（见 utils/crypto.js）：
 *   - 初始 IV 由 instanceof 环境感知决定
 *   - K 常量表被改动 10 处
 *   - add32 被替换为位运算混合函数
 *   - 移位表由 successAlert 是否存在决定（浏览器里是标准表）
 *
 * 用法：
 *   node main.js              # 采集 5 页 → 求和 → 提交答案
 *   node main.js --no-submit  # 只采集求和，不提交
 */

const fs = require('fs');
const path = require('path');
const { makeToken } = require('./utils/crypto');

const TOTAL_PAGES = 5;
const PAGE_SIZE = 10;
const HOST = 'https://match.yuanrenxue.cn';
const API_PATH = '/api/question/23';
const REFERER = `${HOST}/match/23`;
// 第 5 页有 UA 校验，必须是 yuanrenxue
const UA = 'yuanrenxue';
const SUBMIT_PATH = '/a/23';

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

let timeOffset = 0;
const nowMs = () => Date.now() + timeOffset;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseHeaders(extra = {}) {
  return {
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'zh-CN,zh;q=0.9',
    cookie: cfg.cookie,
    referer: REFERER,
    'user-agent': UA,
    'x-requested-with': 'XMLHttpRequest',
    ...extra,
  };
}

/** 页面每次请求前都会先 /api/getTime 取服务端时间，这里同样对齐一次 */
async function syncTime() {
  const res = await fetch(`${HOST}/api/getTime`, { headers: baseHeaders() });
  const serverTime = Number((await res.text()).trim());
  if (!Number.isFinite(serverTime)) throw new Error('getTime 返回异常');
  timeOffset = serverTime - Date.now();
  console.log(`[*] 时间对齐：服务端与本机相差 ${timeOffset} ms（now=${serverTime}）\n`);
}

async function fetchPage(page) {
  await syncTime();
  const now = nowMs();
  const token = makeToken(API_PATH, now, page);
  const url = `${HOST}${API_PATH}?page=${page}&pageSize=${PAGE_SIZE}&kw=&token=${token}&now=${now}`;

  const res = await fetch(url, { headers: baseHeaders() });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`第 ${page} 页返回非 JSON：${text.slice(0, 200)}`);
  }
  if (!Array.isArray(json.data)) {
    throw new Error(`第 ${page} 页失败：${text.slice(0, 200)}`);
  }
  return { now, token, data: json.data };
}

async function submit(answer) {
  const res = await fetch(`${HOST}${SUBMIT_PATH}`, {
    method: 'POST',
    headers: baseHeaders({
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: HOST,
    }),
    body: new URLSearchParams({ answer: String(answer) }).toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const doSubmit = !process.argv.includes('--no-submit');
  console.log('[*] 题目：第 23 题 - js加密 · 感知 · 加强 ob 壳混淆');
  console.log('[*] 目标：构造异化 MD5 token，抓取 5 页数据并求和\n');

  const values = [];
  let sum = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const { now, token, data } = await fetchPage(page);
    const nums = data.map((d) => (typeof d === 'object' && d !== null ? d.value : d));
    values.push(...nums);
    sum += nums.reduce((a, b) => a + b, 0);
    console.log(`[+] 第 ${page} 页  now=${now}`);
    console.log(`    token=${token}`);
    console.log(`    ${JSON.stringify(nums)}`);
    if (page < TOTAL_PAGES) await sleep(700);
  }

  console.log('\n' + '='.repeat(64));
  console.log(`[*] 共 ${values.length} 个数值`);
  console.log(`[*] 总和 = ${sum}`);
  console.log('='.repeat(64));

  const result = { total: sum, count: values.length, values };
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result, null, 2));
  console.log('[*] 结果已写入 result.json');

  if (!doSubmit) {
    console.log('[*] 已跳过提交（--no-submit）');
    return;
  }

  console.log(`\n[*] 提交答案 ${sum} 到 ${SUBMIT_PATH} ...`);
  const { status, json } = await submit(sum);
  console.log(`[*] HTTP ${status} ${JSON.stringify(json)}`);

  if (json.code === 2) {
    console.log('[*] ✅ 通关成功');
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...result, submit: json }, null, 2));
  } else if (json.code === 1) {
    console.log('[*] ⚠️ 该题已通过（重复提交）');
  } else {
    console.log('[-] ❌ 未通过，请检查答案/登录态');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[-]', e.message);
  process.exit(1);
});
