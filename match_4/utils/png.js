/**
 * 极简 PNG 解码（只处理本题用到的 8 位灰度/RGB/RGBA、非隔行 PNG）
 * 返回 { width, height, gray: Uint8Array }（gray 为亮度，长度 = width*height）
 */
const zlib = require('zlib');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8 位 PNG，实际 ' + bitDepth);
  if (interlace) throw new Error('不支持隔行 PNG');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持的颜色类型 ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= channels) ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    if (channels === 1 || channels === 2) gray[i] = out[o];
    else gray[i] = Math.round(0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2]);
  }
  return { width, height, gray };
}

/** 最近邻缩放到 16x20 并做零均值单位方差归一化 */
function feature(png, w = 16, h = 20) {
  const f = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(png.height - 1, Math.floor((y + 0.5) * png.height / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(png.width - 1, Math.floor((x + 0.5) * png.width / w));
      f[y * w + x] = png.gray[sy * png.width + sx];
    }
  }
  let mean = 0; for (const v of f) mean += v; mean /= f.length;
  let varsum = 0; for (const v of f) varsum += (v - mean) ** 2;
  const std = Math.sqrt(varsum / f.length) || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - mean) / std;
  return Array.from(f);
}

const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };

module.exports = { decodePng, feature, dist2 };
