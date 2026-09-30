/**
 * 猿人学第3题 —— 访问逻辑 - 推心置腹
 *
 * 机制（本题"细节"全在 HTTP 头上）：
 *   1. 服务端校验 **请求头的真实顺序**。浏览器 F12 / CDP 里看到的头是按字母排序过的，
 *      必须按 Chrome 实际发送的顺序发出去，否则数据接口一律返回
 *      {"error": "token failed"}。所以本脚本用 **裸 TLS socket 手写请求行**，
 *      严格固定请求头顺序。
 *   2. 每次取数前要先 GET /api2/3（返回 202 + 1×1 GIF），相当于一次"访问登记"；
 *      顺序不能反：先 /api2/3，再 /api/question/3。
 *   3. 第 5 页要求 User-Agent: yuanrenxue。
 *
 * 参考：题解指出"不同抓包工具显示的请求头顺序不同，需要维持真实顺序"。
 *
 * 用法：node main.js [--no-submit]
 */
const tls = require('tls');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const HOST = 'match.yuanrenxue.cn';
const Q = 3;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36';

/** 严格控制顺序的请求头（Host/Connection 在最前，其余按 Chrome 真实发送顺序） */
function headerLines(ua, extra = []) {
  return [
    `Host: ${HOST}`,
    'Connection: keep-alive',
    'sec-ch-ua: "Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
    'accept: */*',
    'x-requested-with: XMLHttpRequest',
    'sec-ch-ua-mobile: ?0',
    `user-agent: ${ua}`,
    'sec-ch-ua-platform: "Windows"',
    'sec-fetch-site: same-origin',
    'sec-fetch-mode: cors',
    'sec-fetch-dest: empty',
    `referer: https://${HOST}/match/${Q}`,
    'accept-encoding: gzip, deflate, br',
    'accept-language: zh-CN,zh;q=0.9',
    `cookie: ${cfg.cookie}`,
  ].concat(extra);
}

/** 裸 TLS 请求：请求行 + 头部顺序完全可控，可选 body */
function rawRequest(requestLine, ua, extraHeaders = [], body = null) {
  return new Promise((resolve, reject) => {
    const head = headerLines(ua, extraHeaders).join('\r\n');
    const req = `${requestLine}\r\n${head}\r\n\r\n` + (body || '');
    const sock = tls.connect({ host: HOST, port: 443, servername: HOST }, () => sock.write(req));
    let data = Buffer.alloc(0);
    sock.on('data', (c) => { data = Buffer.concat([data, c]); });
    sock.on('close', () => {
      const headEnd = data.indexOf('\r\n\r\n');
      if (headEnd < 0) return reject(new Error('响应不完整'));
      const headerText = data.slice(0, headEnd).toString('latin1');
      let payload = data.slice(headEnd + 4);
      const status = Number((headerText.match(/^HTTP\/1\.\d (\d+)/) || [])[1]);
      const enc = (headerText.match(/content-encoding: ([^\r\n]+)/i) || [])[1] || '';
      try {
        if (/br/.test(enc)) payload = zlib.brotliDecompressSync(payload);
        else if (/gzip/.test(enc)) payload = zlib.gunzipSync(payload);
        else if (/deflate/.test(enc)) payload = zlib.inflateSync(payload);
      } catch { /* 保持原样 */ }
      resolve({ status, head: headerText, body: payload.toString('utf8') });
    });
    sock.on('error', reject);
    setTimeout(() => { try { sock.destroy(); } catch { /* ignore */ } }, 10000);
  });
}

(async () => {
  const values = []; let total = 0;
  for (let p = 1; p <= 5; p++) {
    const ua = p === 5 ? 'yuanrenxue' : UA_BROWSER;               // 第 5 页 UA 要求
    const visit = await rawRequest(`GET /api2/3 HTTP/1.1`, ua);   // 先"访问登记"
    const res = await rawRequest(`GET /api/question/${Q}?page=${p}&pageSize=10&kw= HTTP/1.1`, ua);
    if (res.status !== 200) throw new Error(`第${p}页失败(${visit.status}/${res.status}): ${res.body.slice(0, 120)}`);
    const j = JSON.parse(res.body);
    values.push(...j.data); total += j.data.reduce((a, b) => a + b, 0);
    console.log(`[+] 第${p}页（访问登记 /api2/3 = ${visit.status}）${JSON.stringify(j.data)}`);
  }
  console.log(`\n[*] 共 ${values.length} 个数，总和 = ${total}`);
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ total, count: values.length, values }, null, 2));
  if (process.argv.includes('--no-submit')) return console.log('[*] 跳过提交');

  const form = new URLSearchParams({ answer: String(total) }).toString();
  const sub = await rawRequest(`POST /a/${Q} HTTP/1.1`, 'yuanrenxue', [
    'content-type: application/x-www-form-urlencoded; charset=UTF-8',
    `content-length: ${Buffer.byteLength(form)}`,
    `origin: https://${HOST}`,
  ], form);
  console.log(`[*] 提交 → HTTP ${sub.status} ${sub.body.slice(0, 200)}`);
  const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'result.json'), 'utf8'));
  try { fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ ...out, response: JSON.parse(sub.body) }, null, 2)); } catch { /* ignore */ }
  try {
    const r = JSON.parse(sub.body);
    if (r.code === 2) console.log('[*] ✅ 通关');
    else if (r.code === 1) console.log('[*] ⚠️ 该题已通过（重复提交）');
  } catch { /* ignore */ }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
