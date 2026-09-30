/**
 * Q7 字形渲染：把某页 woff 里的 10 个码点渲染成位图（浏览器 FontFace + canvas），
 * 输出 docs/glyphs_pageN.json（每码点的灰度位图）和 docs/contact_pageN.png（联系表）。
 *
 * 用法：node tools/render_glyphs.js 1 2
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const CHROME = process.env.CHROME_BIN
  || '/Users/chenxiray/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.CDP_PORT || 9480);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

function toPng({ width, height, gray }) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = gray[y * width + x];
  }
  const crcT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const pages = process.argv.slice(2).map(Number);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrx7-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--window-size=1200,800', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(300); } }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');

    for (const p of pages) {
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', `raw_page${p}.json`), 'utf8'));
      const cps = [...new Set((raw.data.join('').match(/&#x[0-9a-f]+/gi) || []).map((c) => parseInt(c.slice(3), 16)))];
      const res = await cdp.send('Runtime.evaluate', {
        expression: `(async function(){
          var b64 = ${JSON.stringify(raw.woff)};
          var bin = atob(b64); var bytes = new Uint8Array(bin.length);
          for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
          var blob = new Blob([bytes], {type:'font/woff'});
          var url = URL.createObjectURL(blob);
          var fam = 'qx' + Math.random().toString(36).slice(2);
          var ff = new FontFace(fam, "url(" + url + ") format('woff')");
          await ff.load(); document.fonts.add(ff);
          var cps = ${JSON.stringify(cps)};
          var W = 24, H = 32, out = [];
          var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var ctx = cv.getContext('2d');
          for (var k=0;k<cps.length;k++){
            ctx.clearRect(0,0,W,H);
            ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#444'; ctx.font = '28px ' + fam; ctx.textBaseline = 'top';
            ctx.fillText(String.fromCharCode(cps[k]), 1, 1);
            var d = ctx.getImageData(0,0,W,H).data; var gray = [];
            for (var j=0;j<W*H;j++){ gray.push(Math.round(0.299*d[j*4]+0.587*d[j*4+1]+0.114*d[j*4+2])); }
            out.push({ cp: cps[k], gray: gray });
          }
          return JSON.stringify({W:W,H:H,glyphs:out});
        })()`,
        returnByValue: true, awaitPromise: true,
      });
      if (res.exceptionDetails) { console.log('page' + p, '渲染失败'); continue; }
      const info = JSON.parse(res.result.value);
      fs.writeFileSync(path.join(__dirname, '..', 'docs', `glyphs_page${p}.json`), JSON.stringify(info));
      // 联系表
      const cols = info.glyphs.length, W = info.W, H = info.H, scale = 3;
      const sheetW = cols * (W * scale + 10), sheetH = H * scale + 6;
      const sheet = new Uint8Array(sheetW * sheetH).fill(255);
      info.glyphs.forEach((g, i) => {
        const x0 = i * (W * scale + 10);
        for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) {
          sheet[y * sheetW + x0 + x] = g.gray[Math.floor(y / scale) * W + Math.floor(x / scale)];
        }
      });
      fs.writeFileSync(path.join(__dirname, '..', 'docs', `contact_page${p}.png`), toPng({ width: sheetW, height: sheetH, gray: sheet }));
      console.log(`[+] page${p}: 渲染 ${info.glyphs.length} 个字形，码点=${info.glyphs.map((g) => g.cp.toString(16)).join(',')}`);
    }
    ws.close();
  } finally { chrome.kill(); await sleep(200); }
})().catch((e) => { console.error('[-]', e.message); process.exit(1); });
