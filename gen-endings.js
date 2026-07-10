// 生成 18 张像素风结局海报：node gen-endings.js
// → public/endings/{deck}-{tier}-{1|2}.png (900x1200，90x120 像素网格)
// 全部预生成，运行时零生成——省 Token 铁律
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, 'public', 'endings');
fs.mkdirSync(OUT, { recursive: true });

const W = 90, H = 120, CELL = 10;
const GROUND = 82;

const THEMES = {
  life: {
    sky: { good: ['#1a2a6b', '#2d4394', '#5a78d0', '#e8b45a'], mid: ['#121a42', '#22306b', '#3d55a8', '#8a6a4a'], bad: ['#070a1a', '#0d1330', '#141b3d', '#22306b'] },
    ground: '#0a0e24', ground2: '#141b3d', acc: '#93aaff', warm: '#ffd98a', dim: '#3d55a8',
  },
  love: {
    sky: { good: ['#571b33', '#96304f', '#d4607a', '#ffc9b3'], mid: ['#2e1020', '#571b33', '#96304f', '#6b3a55'], bad: ['#120610', '#1a0a12', '#2e1020', '#471a30'] },
    ground: '#160812', ground2: '#2e1020', acc: '#f294a2', warm: '#ffc9b3', dim: '#96304f',
  },
  founder: {
    sky: { good: ['#3d2810', '#6e4a1a', '#b8863a', '#ffe6a8'], mid: ['#241708', '#3d2810', '#6e4a1a', '#57431f'], bad: ['#0c0803', '#120c04', '#241708', '#3d2810'] },
    ground: '#0e0a04', ground2: '#241708', acc: '#ecc06a', warm: '#ffe6a8', dim: '#6e4a1a',
  },
};

// ── 画布：px(x,y,color) 收集，最后合并成 SVG rect ──
let buf;
function reset() { buf = Array.from({ length: H }, () => new Array(W).fill(null)); }
function px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) buf[y][x] = c; }
function rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); }
function disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, c); }
// 伪随机（定种子，同图稳定）
let seed = 1;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

function sky(T, tier) {
  const cols = T.sky[tier];
  const bandH = Math.ceil(GROUND / cols.length);
  for (let y = 0; y < GROUND; y++) {
    const band = Math.min(cols.length - 1, Math.floor(y / bandH));
    for (let x = 0; x < W; x++) {
      let c = cols[band];
      // 带间棋盘抖动，出像素渐变味
      const edge = y % bandH;
      if (edge < 2 && band > 0 && (x + y) % 2 === 0) c = cols[band - 1];
      if (edge >= bandH - 2 && band < cols.length - 1 && (x + y) % 2 === 1) c = cols[band + 1];
      px(x, y, c);
    }
  }
}
function stars(n, color) { for (let i = 0; i < n; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * (GROUND - 14)); px(x, y, color); if (rnd() < .2) px(x + 1, y, color); } }
function ground(T) {
  rect(0, GROUND, W, H - GROUND, T.ground);
  for (let i = 0; i < 130; i++) px(Math.floor(rnd() * W), GROUND + 1 + Math.floor(rnd() * (H - GROUND - 2)), T.ground2);
  for (let x = 0; x < W; x++) px(x, GROUND, T.dim);
}
function sun(T, cx, cy, r) { disc(cx, cy, r + 2, T.warm + '55' === T.warm + '55' ? T.dim : T.dim); disc(cx, cy, r, T.warm); for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6; px(cx + Math.cos(ang) * (r + 3), cy + Math.sin(ang) * (r + 3), T.warm); } }
function moon(T, cx, cy, r) { disc(cx, cy, r, T.warm); disc(cx + 3, cy - 2, r - 1, T.sky.bad[1]); }

// 精灵：字符串点阵（#=主色 o=亮色 .=空）
function sprite(map, x0, y0, main, bright) {
  map.forEach((row, j) => { [...row].forEach((ch, i) => { if (ch === '#') px(x0 + i, y0 + j, main); if (ch === 'o') px(x0 + i, y0 + j, bright); }); });
}
const P_STAND = ['..##..', '..##..', '...#..', '.####.', '#.##.#', '..##..', '..##..', '.#..#.', '.#..#.', '.#..#.'];
const P_SIT = ['..##..', '..##..', '...#..', '.###..', '#.##..', '..###.', '....#.', '....#.'];
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const HEART_L = ['.##.', '###.', '###.', '.##.', '..#.'];
const HEART_R = ['.##.', '.###', '.###', '.##.', '.#..'];

function door(T, x, y, open) { // open: 0关 1半 2开
  const w = 14, h = 22;
  rect(x, y, w, h, T.acc);
  rect(x + 1, y + 1, w - 2, h - 1, T.ground2);
  const lw = open === 2 ? 8 : open === 1 ? 3 : 0;
  if (lw > 0) {
    rect(x + Math.floor((w - lw) / 2), y + 1, lw, h - 1, T.warm);
    // 光斜洒到地上
    for (let j = 0; j < 10; j++) rect(x + Math.floor((w - lw) / 2) - j, y + h + j, lw + j * 2, 1, j % 2 === 0 ? T.warm : T.dim);
  } else {
    px(x + w - 4, y + 12, T.warm); // 门锁
  }
}
function tower(T, x, hgt, broken, flag) {
  const w = 12, top = GROUND - hgt;
  rect(x, top, w, hgt, T.ground2);
  for (let j = top + 2; j < GROUND - 1; j += 3) for (let i = x + 2; i < x + w - 2; i += 3) px(i, j, rnd() < .7 ? T.warm : T.dim);
  if (broken) { // 顶部锯齿 + 碎块
    for (let i = 0; i < w; i++) if ((i + 1) % 3 !== 0) rect(x + i, top - 1, 1, 2, T.sky.bad[0]);
    for (let k = 0; k < 8; k++) px(x + w + 1 + Math.floor(rnd() * 8), top + Math.floor(rnd() * hgt * .8), T.ground2);
  }
  if (flag) { rect(x + 2, top - 7, 1, 7, T.acc); sprite(['ooo', 'oo.'], x + 3, top - 7, T.warm, T.warm); }
}

function compose(deckId, tier, variant, T) {
  reset();
  seed = deckId.length * 1000 + tier.length * 77 + variant * 13 + 7;
  sky(T, tier);
  stars(tier === 'bad' ? 46 : 26, tier === 'good' ? '#ffffff' : T.acc);
  if (tier === 'good') sun(T, variant === 1 ? 45 : 66, 20, 7);
  if (tier === 'mid') disc(variant === 1 ? 45 : 24, GROUND, 8, T.warm); // 半轮悬在地平线
  if (tier === 'bad') moon(T, variant === 1 ? 62 : 26, 15, 6);
  ground(T);

  if (deckId === 'life') {
    if (tier === 'good') {
      door(T, variant === 1 ? 38 : 52, GROUND - 22, 2);
      sprite(P_STAND, variant === 1 ? 24 : 38, GROUND - 10, T.acc, T.warm);
    } else if (tier === 'mid') {
      door(T, variant === 1 ? 40 : 30, GROUND - 22, 1);
      sprite(P_STAND, variant === 1 ? 58 : 50, GROUND - 10, T.acc, T.warm);
    } else {
      door(T, variant === 1 ? 40 : 55, GROUND - 22, 0);
      sprite(P_SIT, variant === 1 ? 24 : 36, GROUND - 8, T.dim, T.acc);
    }
  }
  if (deckId === 'love') {
    if (tier === 'good') {
      const x = variant === 1 ? 36 : 44;
      // 亮色天幕上用深色剪影才看得清
      sprite(P_STAND, x, GROUND - 10, T.dim, T.ground2);
      sprite(P_STAND, x + 7, GROUND - 10, T.ground2, T.dim); // 并肩，手臂相接
      sprite(HEART, x + 3, GROUND - 20, '#d4506b', T.dim);
    } else if (tier === 'mid') {
      const x = variant === 1 ? 32 : 40;
      sprite(P_STAND, x, GROUND - 10, T.acc, T.warm);
      sprite(P_STAND, x + 14, GROUND - 10, T.dim, T.acc);
      sprite(HEART, x + 5, GROUND - 20, T.dim, T.dim); // 黯淡的心
    } else {
      sprite(P_STAND, variant === 1 ? 18 : 12, GROUND - 10, T.dim, T.acc);
      sprite(P_STAND, variant === 1 ? 64 : 70, GROUND - 10, T.dim, T.acc);
      sprite(HEART_L, 40, GROUND - 22, T.acc, T.acc);
      sprite(HEART_R, 47, GROUND - 19, T.dim, T.dim); // 裂开的两半，错位下坠
      if (variant === 2) for (let k = 0; k < 40; k++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * (GROUND - 4)); px(x, y, T.dim); px(x, y + 1, T.dim); } // 像素雨
    }
  }
  if (deckId === 'founder') {
    if (tier === 'good') {
      if (variant === 1) { tower(T, 48, 44, false, true); tower(T, 30, 26, false, false); }
      else { tower(T, 22, 18, false, false); tower(T, 40, 30, false, false); tower(T, 58, 46, false, true); } // 节节高
      sprite(P_STAND, variant === 1 ? 18 : 8, GROUND - 10, T.acc, T.warm);
    } else if (tier === 'mid') {
      tower(T, variant === 1 ? 42 : 30, 30, false, false);
      // 脚手架
      const sx = variant === 1 ? 42 : 30;
      for (let j = 0; j < 8; j++) px(sx + 13, GROUND - 30 + j * 2, T.dim);
      sprite(P_STAND, sx - 14, GROUND - 10, T.acc, T.warm);
    } else {
      tower(T, variant === 1 ? 44 : 32, 34, true, false);
      sprite(P_SIT, variant === 1 ? 28 : 54, GROUND - 8, T.dim, T.acc);
    }
  }

  // 合并同色横向连续像素为长条 rect（缩 SVG 体积）
  const rects = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = buf[y][x];
      if (!c) { x++; continue; }
      let x2 = x;
      while (x2 + 1 < W && buf[y][x2 + 1] === c) x2++;
      rects.push(`<rect x="${x * CELL}" y="${y * CELL}" width="${(x2 - x + 1) * CELL}" height="${CELL}" fill="${c}"/>`);
      x = x2 + 1;
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="utf8"><style>*{margin:0}body{width:900px;height:1200px;overflow:hidden;background:#000}
    .vig{position:absolute;inset:0;background:radial-gradient(1000px 1300px at 50% 40%, transparent 60%, rgba(0,0,0,.45))}
    .bottom{position:absolute;left:0;right:0;bottom:0;height:420px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.82) 70%)}
    .frame{position:absolute;inset:22px;border:2px solid ${T.acc}55}</style></head>
    <body><svg width="900" height="1200" shape-rendering="crispEdges">${rects.join('')}</svg>
    <div class="vig"></div><div class="bottom"></div><div class="frame"></div></body></html>`;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-first-run', '--user-data-dir=' + path.join(os.tmpdir(), 'lp-endings-profile')] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200 });
  for (const [deckId, T] of Object.entries(THEMES)) {
    for (const tier of ['good', 'mid', 'bad']) {
      for (const variant of [1, 2]) {
        await page.setContent(compose(deckId, tier, variant, T), { waitUntil: 'domcontentloaded' });
        await page.screenshot({ path: path.join(OUT, `${deckId}-${tier}-${variant}.png`) });
        console.log(`${deckId}-${tier}-${variant}.png`);
      }
    }
  }
  await browser.close();
})();
