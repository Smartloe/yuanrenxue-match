/**
 * 猿人学第 30 题 —— 隐算 · 简单算法，复杂构建
 *
 * 纯 JS 协议还原，不依赖任何浏览器 / WebAssembly：
 *   token = hex(encrypt("/api/question/30" + now + "30" + "(!)" + page))
 * 其中 encrypt 是 696 字节 WASM 模块的逐指令 JS 复刻（见 utils/crypto.js）。
 *
 * 用法：node main.js
 */

const fs = require('fs');
const path = require('path');
const { makeToken } = require('./utils/crypto');

const TOTAL_PAGES = 5;
const PAGE_SIZE = 10;
const API = 'https://match.yuanrenxue.cn/api/question/30';
const REFERER = 'https://match.yuanrenxue.cn/match/30';
// 第 5 页有 UA 校验，非 yuanrenxue 会返回“请将UA改为yuanrenxue哦”
const UA = 'yuanrenxue';

const session = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

// 页面会先请求 /api/getTime 拿服务器时间（VM 字符串表里有 "getTime"/"Math"/"min"/"max"），
// 这里同样对齐一次，避免本机时钟偏差导致 now 与服务端不符。
let timeOffset = 0;

async function syncTime() {
  const res = await fetch('https://match.yuanrenxue.cn/api/getTime', {
    headers: { cookie: session.cookie, referer: REFERER, 'user-agent': UA },
  });
  const serverTime = Number((await res.text()).trim());
  if (!Number.isFinite(serverTime)) throw new Error('getTime 返回异常');
  timeOffset = serverTime - Date.now();
  console.log(`[*] 时间对齐：服务端与本机相差 ${timeOffset} ms\n`);
}

const nowMs = () => Date.now() + timeOffset;

async function fetchPage(page) {
  const now = nowMs();
  const token = makeToken(now, page);
  const url = `${API}?page=${page}&pageSize=${PAGE_SIZE}&kw=&token=${token}&now=${now}`;

  const res = await fetch(url, {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'zh-CN,zh;q=0.9',
      cookie: session.cookie,
      referer: REFERER,
      'user-agent': UA,
      'x-requested-with': 'XMLHttpRequest',
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`第 ${page} 页返回非 JSON：${text.slice(0, 200)}`);
  }
  if (!Array.isArray(json.data)) {
    throw new Error(`第 ${page} 页失败：${JSON.stringify(json)}`);
  }
  return { now, token, data: json.data };
}

async function main() {
  console.log('[*] 题目：第 30 题 - 隐算 · 简单算法，复杂构建');
  console.log('[*] 目标：请求全部 5 页数据，计算加和\n');

  await syncTime();

  const all = [];
  let sum = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const { now, token, data } = await fetchPage(page);
    const values = data.map((d) => (typeof d === 'object' ? d.value : d));
    all.push(...values);
    sum += values.reduce((a, b) => a + b, 0);

    console.log(`[+] 第 ${page} 页  now=${now}  token=${token}`);
    console.log(`    ${JSON.stringify(values)}`);

    if (page < TOTAL_PAGES) await new Promise((r) => setTimeout(r, 600));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`[*] 共 ${all.length} 个数值`);
  console.log(`[*] 总和 = ${sum}`);
  console.log('='.repeat(60));

  fs.writeFileSync(
    path.join(__dirname, 'result.json'),
    JSON.stringify({ total: sum, count: all.length, values: all }, null, 2)
  );
  console.log('[*] 结果已写入 result.json');
}

main().catch((e) => {
  console.error('[-]', e.message);
  process.exit(1);
});
