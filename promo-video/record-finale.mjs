// 重连已结束的房间，录制带 AI 人生小传的结局页
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = 'D:/life-pawnshop/promo-video/footage';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CODE = process.argv[2] || '4052';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZOOM = 1035 / 540;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1035, height: 1840 },
  recordVideo: { dir: OUT + '/finale', size: { width: 1035, height: 1840 } },
});
await context.addInitScript(`
  const az = () => { if (document.documentElement) document.documentElement.style.zoom = ${ZOOM}; };
  az(); document.addEventListener('DOMContentLoaded', az);
`);
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#nm');
await page.evaluate((z) => { document.documentElement.style.zoom = z; }, ZOOM);
await page.locator('#nm').fill('我');
await page.locator('.btn', { hasText: '加入朋友的房间' }).click();
await page.locator('#cd').fill(CODE);
await page.locator('.btn', { hasText: '进入' }).click();
await page.waitForSelector('.bio', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
console.log('bio 已渲染');
const bioText = await page.evaluate(() => [...document.querySelectorAll('.bio')].map((b) => b.textContent).join('\n---\n'));
await fs.writeFile(OUT + '/bios.txt', bioText);
await sleep(2500);
// 慢慢滚过：共鸣榜 → 我的一生 → 手记
await page.evaluate(() => new Promise((done) => {
  const total = Math.min(document.body.scrollHeight - innerHeight * 0.55, 2400);
  const t0 = performance.now(), ms = 10000;
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    scrollTo(0, total * e);
    p < 1 ? requestAnimationFrame(step) : done();
  })(t0);
}));
await sleep(3000);
await context.close();
await browser.close();
console.log('FINALE DONE');
process.exit(0);
