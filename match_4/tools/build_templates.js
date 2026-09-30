/**
 * Q4 字形模板构建：抓一页数据 → 解析每格"可见"字形 → 聚类成 10 类 →
 * 导出 docs/templates.json（特征向量）和 docs/contact_node.png（联系表，供人工标注）。
 *
 * 用法：node tools/build_templates.js
 */
const fs = require('fs');
const path = require('path');
const { decodePng, feature, dist2 } = require('../utils/png');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'session.json'), 'utf8'));
const HEAD = (ua) => ({
  cookie: cfg.cookie, referer: 'https://match.yuanrenxue.cn/match/4', 'user-agent': ua,
  'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01',
});
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const crypto = require('crypto');

const IMG_RE = /<img[^>]*src="data:image\/png;base64,([^"]+)"[^>]*class="([^"]*)"[^>]*style="([^"]*)"/g;
const TD_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;

function hiddenClass(j) {
  const b64 = Buffer.from(j.key + j.value).toString('base64').replace(/=/g, '');
  return crypto.createHash('md5').update(b64).digest('hex');
}

(async () => {
  const items = [];
  for (let p = 1; p <= 5; p++) {
    const ua = p === 5 ? 'yuanrenxue' : UA_BROWSER;
    const j = await (await fetch(`https://match.yuanrenxue.cn/api/question/4?page=${p}&pageSize=10&kw=`, { headers: HEAD(ua) })).json();
    const hidden = hiddenClass(j);
    let td, ti = 0;
    TD_RE.lastIndex = 0;
    while ((td = TD_RE.exec(String(j.info)))) {
      const imgs = [];
      let m; IMG_RE.lastIndex = 0;
      while ((m = IMG_RE.exec(td[1]))) {
        const cls = m[2].split(' ').pop();
        if (cls === hidden) continue;
        const left = parseFloat((m[3].match(/left:\s*(-?[\d.]+)px/) || [])[1]);
        const png = decodePng(Buffer.from(m[1], 'base64'));
        imgs.push({ left, feat: feature(png), png });
      }
      imgs.sort((a, b) => a.left - b.left);
      imgs.forEach((im) => items.push({ page: p, td: ti, ...im }));
      ti++;
    }
  }
  console.log(`[*] 收集可见字形 ${items.length} 个（应为 5 页 ×10 格 ×6 位 = 300）`);

  // 贪心聚类
  const clusters = [];
  for (const it of items) {
    let best = null, bd = Infinity;
    for (const c of clusters) { const d = dist2(it.feat, c.center); if (d < bd) { bd = d; best = c; } }
    if (best && bd < 6.0) {
      best.items.push(it); it.cluster = best.id;
      const n = best.items.length;
      best.center = best.center.map((v, i) => (v * (n - 1) + it.feat[i]) / n);
    } else {
      const c = { id: clusters.length, center: it.feat.slice(), items: [it] };
      it.cluster = c.id; clusters.push(c);
    }
  }
  console.log('[*] 聚类数:', clusters.length, '各簇样本:', clusters.map((c) => c.items.length).join(','));

  // 保存模板（按簇 id 顺序）与第一个样本图
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'templates.json'),
    JSON.stringify(clusters.map((c) => ({ id: c.id, feat: c.center })), null, 2));
  const dir = path.join(__dirname, '..', 'docs', 'glyphs');
  fs.mkdirSync(dir, { recursive: true });
  clusters.forEach((c, i) => fs.writeFileSync(path.join(dir, `c${i}.png`), toPng(c.items[0].png)));

  // 联系表（用原始灰度手写一张 PGM→PNG 也可，这里简单拼接为 PNG）
  const W = 25, H = 32, scale = 3, cols = 10;
  const rows = Math.ceil(clusters.length / cols);
  const sheetW = cols * (W * scale + 12), sheetH = rows * (H * scale + 8);
  const sheet = new Uint8Array(sheetW * sheetH).fill(255);
  clusters.forEach((c, i) => {
    const r = Math.floor(i / cols), cc = i % cols;
    const x0 = cc * (W * scale + 12), y0 = r * (H * scale + 8);
    const g = c.items[0].png;
    for (let y = 0; y < H * scale; y++) {
      const sy = Math.min(g.height - 1, Math.floor(y / scale));
      for (let x = 0; x < W * scale; x++) {
        const sx = Math.min(g.width - 1, Math.floor(x / scale));
        sheet[(y0 + y) * sheetW + x0 + x] = g.gray[sy * g.width + sx];
      }
    }
  });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'contact_node.png'), toPng({ width: sheetW, height: sheetH, gray: sheet }));
  console.log('[*] 已写出 docs/templates.json、docs/glyphs/c*.png、docs/contact_node.png');
  console.log('[*] 簇样本数:', clusters.map((c, i) => `c${i}:${c.items.length}`).join(' '));
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });

/** 把灰度数组编码成 PNG（不压缩级别无关紧要） */
function toPng({ width, height, gray }) {
  const zlib = require('zlib');
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = gray[y * width + x];
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; }
  }
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
