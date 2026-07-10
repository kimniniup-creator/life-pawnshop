import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1035, height: 1840 },
  recordVideo: { dir: 'D:/life-pawnshop/promo-video/footage/test2', size: { width: 1035, height: 1840 } },
});
await context.addInitScript(`document.documentElement.style.zoom = ${1035 / 540};`);
const page = await context.newPage();
await page.goto('http://localhost:3000', { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const info = await page.evaluate(() => ({
  heroW: document.querySelector('.hero h1').getBoundingClientRect().width,
  bodyH: document.body.scrollHeight,
  chatDisplay: getComputedStyle(document.getElementById('chat')).display,
  isDesktopMQ: matchMedia('(min-width:1040px)').matches,
}));
console.log(JSON.stringify(info));
await new Promise((r) => setTimeout(r, 2500));
await context.close();
await browser.close();
console.log('ok');
process.exit(0);
