/**
 * 字形特征 + 匹配
 * 特征：二值化 → 裁剪包围盒 → 面积平均缩放到 16x20 → 零均值单位方差
 * 匹配：10×10 代价矩阵 + 局部搜索求最小代价的**排列**（10 个码点必然是 0-9 的一个排列）
 */
function feature(gray, W, H, w = 16, h = 20) {
  const BIN = 200;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (gray[y * W + x] < BIN) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const f = new Float64Array(w * h);
  const counts = new Float64Array(w * h).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const tx = Math.min(w - 1, Math.floor((x - minX) * w / bw));
    const ty = Math.min(h - 1, Math.floor((y - minY) * h / bh));
    f[ty * w + tx] += gray[y * W + x] < BIN ? 1 : 0;
    counts[ty * w + tx]++;
  }
  for (let i = 0; i < f.length; i++) f[i] = counts[i] ? f[i] / counts[i] : 0;   // 覆盖度
  let mean = 0; for (const v of f) mean += v; mean /= f.length;
  let vs = 0; for (const v of f) vs += (v - mean) ** 2;
  const std = Math.sqrt(vs / f.length) || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - mean) / std;
  return Array.from(f);
}
const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };

/** 用匈牙利算法（10×10 规模，实现为 O(n^3) 的经典形式）求最小代价匹配 */
function assign(cost) {
  const n = cost.length, m = cost[0].length;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0) res[p[j] - 1] = j - 1;
  return res;
}
module.exports = { feature, dist2, assign };
