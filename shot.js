// UI 截图（现代版界面）
const puppeteer = require('puppeteer-core');
const path = require('path');
const OUT = process.argv[2] || '.';
const URL = 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VP = { width: 1280, height: 860, deviceScaleFactor: 1.5 };
const VPM = { width: 390, height: 844, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = (P, txt) => P.evaluate((t) => {
  const b = [...document.querySelectorAll('.btn')].find((x) => !x.disabled && x.textContent.includes(t));
  if (b) b.click();
}, txt);

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-first-run'] });
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const A = await ctxA.newPage(); await A.setViewport(VP);
  const B = await ctxB.newPage(); await B.setViewport(VPM);

  await A.goto(URL); await sleep(1000);
  await A.screenshot({ path: path.join(OUT, 'm1-home.png') });

  await A.type('#nm', '阿芒'); await clickByText(A, '创建房间'); await sleep(800);
  const code = await A.evaluate(() => document.querySelector('.big').textContent.replace(/\D/g, ''));
  console.log('room', code);

  await B.goto(URL); await sleep(800);
  await B.type('#nm', 'Kim');
  await clickByText(B, '加入朋友的房间'); await sleep(200);
  await B.type('#cd', code);
  await clickByText(B, '进入'); await sleep(800);
  await A.screenshot({ path: path.join(OUT, 'm2-lobby.png') });

  await A.evaluate(() => document.querySelectorAll('.deckopt')[2].click()); await sleep(300);
  await clickByText(A, '开始游戏'); await sleep(800);

  for (const P of [A, B]) {
    await P.evaluate(() => [...document.querySelectorAll('.qcard')].slice(0, 7).forEach((c) => c.click()));
    await sleep(200);
  }
  await A.screenshot({ path: path.join(OUT, 'm3-pick.png') });
  for (const P of [A, B]) { await clickByText(P, '确认'); await sleep(400); }

  await sleep(600);
  await A.screenshot({ path: path.join(OUT, 'm4-auction.png') });
  for (let i = 0; i < 3; i++) {
    for (const P of [A, B]) {
      await P.evaluate(() => { const inp = document.querySelector('#bid'); if (inp) inp.value = String(Math.floor(Math.random() * 15)); });
      await clickByText(P, '提交出价'); await sleep(350);
    }
    await sleep(400);
  }

  await sleep(800);
  for (const [P, other] of [[A, B], [B, A]]) {
    const isGuesser = await P.evaluate(() => !![...document.querySelectorAll('h3')].find((h) => h.textContent.includes('你猜')));
    if (isGuesser) { await P.screenshot({ path: path.join(OUT, 'm5-guess.png') }); await clickByText(P, '硬扛'); }
  }
  await sleep(600);
  for (const P of [A, B]) {
    const isActive = await P.evaluate(() => !![...document.querySelectorAll('h3')].find((h) => h.textContent.includes('轮到你')));
    if (isActive) { await P.screenshot({ path: path.join(OUT, 'm6-choose.png') }); break; }
  }
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
