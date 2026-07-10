// 从表情大图切一对"像素对齐"的帧做眨眼动画：
//   同一格 cell 的固定矩形裁切（不做 bbox 裁剪），保证两帧场景严格对齐
//   frame idle(睁眼) = 第0格；warm(闭眼笑) = 第3格
//   两格在网格里字符位置一致 → 切同样大小 → 叠放只有眼睛/嘴变化
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, 'assets-src', 'clipboard-grab.png');
const OUT = path.join(__dirname, 'public', 'shopkeeper');
const src = PNG.sync.read(fs.readFileSync(SRC));
const W = src.width, H = src.height, COLS = 4, ROWS = 3;
const cellW = W / COLS, cellH = H / ROWS;

function cellCrop(col, row) {
  const x0 = Math.round(col * cellW), y0 = Math.round(row * cellH);
  const w = Math.round(cellW), h = Math.round(cellH);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * W + (x0 + x)) * 4, di = (y * w + x) * 4;
    out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
  }
  return out;
}
// 第0格=idle(睁眼)，第3格=warm(闭眼笑)：同为 row0，位置一致
fs.writeFileSync(path.join(OUT, 'anim-open.png'), PNG.sync.write(cellCrop(0, 0)));
fs.writeFileSync(path.join(OUT, 'anim-smile.png'), PNG.sync.write(cellCrop(3, 0)));
console.log('anim-open.png (睁眼) + anim-smile.png (闭眼笑)  cell', Math.round(cellW) + 'x' + Math.round(cellH));
