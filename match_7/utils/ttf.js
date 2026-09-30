/** 极简 TTF 解析：取 cmap(格式4) 与每个 glyph 的轮廓字节 */
const crypto = require('crypto');
function parse(buf) {
  const numTables = buf.readUInt16BE(4);
  const tab = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tab[buf.slice(o, o + 4).toString('latin1')] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
  }
  // head.indexToLocFormat
  const head = buf.slice(tab.head.off, tab.head.off + tab.head.len);
  const longLoca = head.readInt16BE(50) === 1;
  const maxp = buf.slice(tab.maxp.off, tab.maxp.off + tab.maxp.len);
  const numGlyphs = maxp.readUInt16BE(4);
  // loca
  const loca = [];
  for (let i = 0; i <= numGlyphs; i++) {
    loca.push(longLoca ? buf.readUInt32BE(tab.loca.off + i * 4) : buf.readUInt16BE(tab.loca.off + i * 2) * 2);
  }
  const glyfOff = tab.glyf.off;
  const outline = (gid) => {
    if (gid >= numGlyphs) return null;
    const s = loca[gid], e = loca[gid + 1];
    if (e <= s) return null;                       // 空字形
    return buf.slice(glyfOff + s, glyfOff + e);
  };
  // cmap 格式 4
  const cm = buf.slice(tab.cmap.off, tab.cmap.off + tab.cmap.len);
  const nSub = cm.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < nSub; i++) {
    const off = cm.readUInt32BE(8 + i * 8);
    if (cm.readUInt16BE(off) === 4) { best = off; break; }
  }
  const map = {};
  if (best !== null) {
    const segX2 = cm.readUInt16BE(best + 6), seg = segX2 / 2;
    const endO = best + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      const end = cm.readUInt16BE(endO + s * 2), start = cm.readUInt16BE(startO + s * 2);
      const delta = cm.readInt16BE(deltaO + s * 2), ro = cm.readUInt16BE(rangeO + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let g;
        if (ro === 0) g = (cp + delta) & 0xffff;
        else { const gi = rangeO + s * 2 + ro + (cp - start) * 2; g = cm.readUInt16BE(gi); if (g !== 0) g = (g + delta) & 0xffff; }
        map[cp] = g;
      }
    }
  }
  const hashOf = (gid) => { const b = outline(gid); return b ? crypto.createHash('md5').update(b).digest('hex').slice(0, 12) : null; };
  return { map, outline, hashOf, numGlyphs };
}
module.exports = { parse };
