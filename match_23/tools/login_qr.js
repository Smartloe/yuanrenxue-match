/**
 * 猿人学扫码登录：纯 HTTP 复刻页面登录流程
 *   1. GET /api/getQRCode?scene=match        → { success, ticket, uuid }
 *   2. GET https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=<urlencode>  → 二维码 PNG
 *   3. 轮询 GET /api/checkWxStatus?uuid=<uuid>  直到 success=true
 *      成功时服务端下发 sessionid，写入 config/session.json
 *
 * 用法：node tools/login_qr.js [输出目录]
 */
const fs = require('fs');
const path = require('path');

const HOST = 'https://match.yuanrenxue.cn';
const OUT_DIR = process.argv[2] || path.join(__dirname, '..', 'config');
const OUT_PNG = path.join(OUT_DIR, 'login_qrcode.png');
const SESSION_FILE = path.join(__dirname, '..', 'config', 'session.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 极简 cookie jar ——
const jar = new Map();
function storeCookies(res) {
  for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = sc.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function req(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'user-agent': UA,
      referer: `${HOST}/match/23`,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(opts.headers || {}),
    },
  });
  storeCookies(res);
  return res;
}

async function main() {
  // 1) 取二维码 ticket
  const qrRes = await req(`${HOST}/api/getQRCode?scene=match`);
  const qr = await qrRes.json();
  if (!qr || !qr.success || !qr.ticket) {
    throw new Error('getQRCode 失败: ' + JSON.stringify(qr));
  }
  log(`[+] ticket=${qr.ticket}`);
  log(`[+] uuid=${qr.uuid}`);

  // 2) 下载二维码图片（微信官方 showqrcode 接口）
  const imgUrl = 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=' + encodeURIComponent(qr.ticket);
  const imgRes = await fetch(imgUrl, { headers: { 'user-agent': UA } });
  if (!imgRes.ok) throw new Error('二维码图片下载失败 HTTP ' + imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PNG, buf);
  log(`[+] 二维码已保存: ${OUT_PNG} (${buf.length} bytes)`);
  log('QR_READY');

  // 3) 轮询扫码状态（页面是 1s 一次、最多 180 次）
  for (let i = 0; i < 180; i++) {
    const res = await req(`${HOST}/api/checkWxStatus?uuid=${encodeURIComponent(qr.uuid)}`);
    let data = {};
    try { data = await res.json(); } catch { /* 忽略非 JSON */ }
    if (data && data.success) {
      log(`[+] 扫码登录成功（第 ${i + 1} 次轮询）`);
      const sessionid = jar.get('sessionid');
      if (!sessionid) throw new Error('登录成功但未拿到 sessionid，cookie: ' + cookieHeader());
      fs.writeFileSync(SESSION_FILE, JSON.stringify({
        sessionid,
        cookie: cookieHeader(),
        user: data.user || data.nickname || null,
        loginAt: new Date().toISOString(),
      }, null, 2));
      log(`[+] sessionid=${sessionid}`);
      log(`[+] 已写入 ${SESSION_FILE}`);

      // 用新 cookie 校验一次登录态
      const me = await req(`${HOST}/api/user`);
      const info = await me.json().catch(() => ({}));
      log(`[+] /api/user → ${JSON.stringify(info)}`);
      log('LOGIN_OK');
      return;
    }
    if (data && data.status && data.status !== 'WAITING') log(`[*] 状态: ${data.status}`);
    await sleep(1000);
  }
  log('[-] 二维码超时（180s），请重新运行本脚本');
  process.exitCode = 2;
}

main().catch((e) => {
  log('[-] ' + e.message);
  process.exit(1);
});
