/** 用两页已人工标注的字形建立参考模板（新特征） */
const fs = require('fs'), path = require('path');
const { feature } = require('../utils/glyph');
const src1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/glyphs_page1.json'), 'utf8'));
const src2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/glyphs_page2.json'), 'utf8'));
// 标注：按渲染联系表人工读出（键为码点十六进制）
const LAB1 = { a265: '3', a285: '2', c589: '9', b574: '4', b453: '7', b124: '5', c786: '1', a981: '8', b345: '6', b462: '0' };
const LAB2 = { b154: '2', c261: '8', b194: '9', c924: '1', c689: '5', b386: '6', c192: '4', a415: '7', b935: '3', a896: '0' };
const out = [];
for (const [src, lab] of [[src1, LAB1], [src2, LAB2]]) {
  for (const g of src.glyphs) {
    const d = lab[g.cp.toString(16)];
    if (!d) continue;
    const f = feature(g.gray, src.W, src.H);
    if (f) out.push({ digit: d, cp: g.cp, feat: f });
  }
}
fs.writeFileSync(path.join(__dirname, '..', 'config/templates7.json'), JSON.stringify(out, null, 2));
console.log('模板数', out.length, '每数字模板数:', out.reduce((m, t) => (m[t.digit] = (m[t.digit] || 0) + 1, m), {}));
