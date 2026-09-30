/** Q18：用字符串表里的可读串当候选 AES 密钥，暴力解密截获的签名，看明文是否包含已知的 t */
const fs = require('fs');
const crypto = require('crypto');
const j = JSON.parse(fs.readFileSync(__dirname + '/../docs/q18_strings.json', 'utf8'));
const samples = [
  { p: 2, t: '1790700820', v: 'NGsiSgSW1bPZpx5nixcpsjOK5P7gAzSsJWGswICIZ9s=' },
  { p: 2, t: '1790700882', v: 'Hpy2kN5UepZsrYcBwrT1Q+Rj+dpLlIbL9IO/iG2KwrLtMi5aNQPWYtlCu/c7c3I6' },
  { p: 4, t: '1790701233', v: 'awqvhLHfhe4Gh23mkrYUUsNnpDxwiGRHsdFKWr4eBTs=' },
  { p: 4, t: '1790701871', v: 'B1ipIfEo0vIiV3siagK1yeIj2d+qn7faNjxppYY7NKY=' },
];
const strings = [...new Set(j.readable.map((x) => x.s))].filter((s) => s.length >= 6 && /^[\x20-\x7e]+$/.test(s));
const flipCase = (s) => s.replace(/[a-zA-Z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
const keyCands = new Set();
for (const s of strings) {
  for (const v of [s, flipCase(s)]) {
    const b = Buffer.from(v, 'latin1');
    if (b.length >= 16) keyCands.add(b.subarray(0, 16).toString('hex'));
    if (b.length >= 16) keyCands.add(b.subarray(b.length - 16).toString('hex'));
    if (b.length >= 8 && b.length < 16) {
      const pad = Buffer.concat([b, b]).subarray(0, 16);
      keyCands.add(pad.toString('hex'));
    }
  }
}
console.log('候选密钥数:', keyCands.size);
let found = 0;
for (const kh of keyCands) {
  const key = Buffer.from(kh, 'hex');
  for (const mode of ['aes-128-cbc', 'aes-128-ecb']) {
    for (const s of samples) {
      const ct = Buffer.from(s.v, 'base64');
      try {
        const d = crypto.createDecipheriv(mode, key, mode.endsWith('cbc') ? Buffer.alloc(16) : null);
        d.setAutoPadding(false);
        const pt = Buffer.concat([d.update(ct), d.final()]).toString('latin1');
        if (pt.includes(s.t) || /page=|\{"page"|18data/i.test(pt)) {
          console.log('★ 命中!', mode, 'key(hex)=', kh, 'key(ascii)=', JSON.stringify(key.toString('latin1')), '样本 p' + s.p + ' t=' + s.t);
          console.log('   明文:', JSON.stringify(pt));
          found++;
        }
      } catch { /* ignore */ }
    }
  }
}
console.log(found ? `命中 ${found} 处` : '未命中');
