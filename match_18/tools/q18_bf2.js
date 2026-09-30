/** Q18：全变体密钥暴力（AES-128/192/256 × CBC/ECB/CFB/OFB/CTR × 多种 IV），判据=明文含已知 t */
const fs = require('fs');
const crypto = require('crypto');
const j = JSON.parse(fs.readFileSync(__dirname + '/../docs/q18_strings.json', 'utf8'));
const samples = [
  { p: 2, t: '1790700820', v: 'NGsiSgSW1bPZpx5nixcpsjOK5P7gAzSsJWGswICIZ9s=' },
  { p: 4, t: '1790701233', v: 'awqvhLHfhe4Gh23mkrYUUsNnpDxwiGRHsdFKWr4eBTs=' },
];
const variants = [...new Set(j.readable.map((x) => x.s))];
const keys = new Set();
for (const s of variants) {
  const b = Buffer.from(s, 'latin1');
  if (b.length >= 16) { keys.add(b.subarray(0, 16).toString('hex')); keys.add(b.subarray(b.length - 16).toString('hex')); }
  if (b.length >= 24) keys.add(b.subarray(0, 24).toString('hex'));
  if (b.length >= 32) { keys.add(b.subarray(0, 32).toString('hex')); keys.add(b.subarray(b.length - 32).toString('hex')); }
  if (/^[0-9a-f]{32}$/i.test(s)) keys.add(Buffer.from(s, 'hex').toString('hex'));
  if (/^[0-9a-f]{48}$/i.test(s)) keys.add(Buffer.from(s, 'hex').toString('hex'));
  if (/^[0-9a-f]{64}$/i.test(s)) keys.add(Buffer.from(s, 'hex').toString('hex'));
}
console.log('候选密钥数:', keys.size);
const modes = ['aes-128-cbc', 'aes-128-ecb', 'aes-128-cfb', 'aes-128-ofb', 'aes-128-ctr',
  'aes-192-cbc', 'aes-256-cbc', 'aes-256-ecb', 'aes-256-cfb', 'aes-256-ctr'];
let found = 0, tried = 0;
for (const kh of keys) {
  const key = Buffer.from(kh, 'hex');
  for (const mode of modes) {
    const need = mode.startsWith('aes-128') ? 16 : mode.startsWith('aes-192') ? 24 : 32;
    if (key.length !== need) continue;
    const ivs = mode.includes('ecb') ? [null] : [Buffer.alloc(16), key.subarray(0, 16)];
    for (const iv of ivs) {
      for (const s of samples) {
        tried++;
        try {
          const d = crypto.createDecipheriv(mode, key, iv);
          d.setAutoPadding(false);
          const pt = Buffer.concat([d.update(Buffer.from(s.v, 'base64')), d.final()]).toString('latin1');
          if (pt.includes(s.t) || /page=/i.test(pt)) {
            console.log('★ 命中', mode, 'key(hex)=' + kh, 'iv=' + (iv ? iv.toString('hex') : 'null'), 'p' + s.p);
            console.log('   明文:', JSON.stringify(pt));
            found++;
          }
        } catch { /* ignore */ }
        if (tried > 4000000) break;
      }
    }
  }
}
console.log('尝试', tried, '次；', found ? '命中 ' + found : '未命中');
