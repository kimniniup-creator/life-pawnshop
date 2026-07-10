// 切分掌柜表情大图 → public/shopkeeper/{name}.png（12帧全景 + {name}-face.png 头肩方裁）
// 纯 Node（pngjs），零浏览器零模型调用
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, 'assets-src', 'clipboard-grab.png');
const OUT = path.join(__dirname, 'public', 'shopkeeper');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = [
  'idle', 'think', 'sly', 'warm',
  'annoyed', 'stern', 'laugh', 'stamp',
  'card', 'abacus', 'clasp', 'smirk',
];

const src = PNG.sync.read(fs.readFileSync(SRC));
const W = src.width, H = src.height;
const COLS = 4, ROWS = 3;
const cellW = W / COLS, cellH = H / ROWS;
const THRESH = 34;

function lum(x, y) {
  const i = (y * W + x) * 4;
  return src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11;
}
function bbox(x0, y0, x1, y1) {
  let minX = x1, minY = y1, maxX = x0, maxY = y0, any = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (lum(x, y) > THRESH) {
        any = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (!any) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
function crop(sx, sy, sw, sh) {
  const out = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * W + (sx + x)) * 4;
      const di = (y * sw + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const idx = r * COLS + c;
    const cx0 = Math.round(c * cellW), cy0 = Math.round(r * cellH);
    const cx1 = Math.round((c + 1) * cellW), cy1 = Math.round((r + 1) * cellH);
    const b = bbox(cx0 + 4, cy0 + 4, cx1 - 4, cy1 - 4);
    const pad = 6;
    const bx = Math.max(cx0, b.x - pad), by = Math.max(cy0, b.y - pad);
    const bw = Math.min(cx1 - bx, b.w + pad * 2), bh = Math.min(cy1 - by, b.h + pad * 2);

    fs.writeFileSync(path.join(OUT, `${NAMES[idx]}.png`), crop(bx, by, bw, bh));

    // 头肩方裁：以头部为中心（内容框 x≈44%、y≈40%），边长取内容高的 62%
    const side = Math.round(bh * 0.62);
    const ccx = bx + Math.round(bw * 0.44);
    const ccy = by + Math.round(bh * 0.40);
    let hx = ccx - Math.round(side / 2);
    let hy = ccy - Math.round(side / 2);
    hx = Math.max(0, Math.min(hx, W - side));
    hy = Math.max(0, Math.min(hy, H - side));
    fs.writeFileSync(path.join(OUT, `${NAMES[idx]}-face.png`), crop(hx, hy, side, side));

    console.log(`${NAMES[idx]}: full ${bw}x${bh}  face ${side}x${side}`);
  }
}
console.log('done');
