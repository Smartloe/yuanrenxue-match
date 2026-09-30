/**
 * 猿人学新手试炼6：练气初成
 *
 * 机制：页面用 CryptoJS AES-CBC 加密后 POST /api/user，key = `yrx_aes_key_v6!0`、iv = `yrx_aes_iv__v6_0`（都写在页面脚本里）。答案 = md5(key字符串 + iv字符串)。
 * 解法：从脚本取 key/iv，做字符串拼接后 md5
 *
 * 用法：node main.js [--no-submit]
 */
const crypto = require('crypto');
// 页面脚本里的 CryptoJS.enc.Utf8.parse("yrx_aes_key_v6!0") / ("yrx_aes_iv__v6_0")
const fs = require('fs');
const path = require('path');
const HOST = 'https://match.yuanrenxue.cn';
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/session.json'), 'utf8'));

async function submit(answer) {
  const res = await fetch(HOST + '/a/guide6', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      cookie: cfg.cookie, referer: HOST + '/match/guide6', origin: HOST,
      'user-agent': 'yuanrenxue', 'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ answer: String(answer) }).toString(),
  });
  return JSON.parse(await res.text());
}

(async () => {
  const answer = crypto.createHash('md5').update('yrx_aes_key_v6!0' + 'yrx_aes_iv__v6_0').digest('hex');
  console.log('[*] 答案 =', answer);
  const out = { answer };
  if (!process.argv.includes('--no-submit')) {
    out.response = await submit(answer);
    console.log('[*] 提交 →', JSON.stringify(out.response));
  }
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(out, null, 2));
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
