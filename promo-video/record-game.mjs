// 三三(浏览器真实操作)+ 企鹅/好了(bot)完整跑一局并录屏
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const OUT = 'D:/life-pawnshop/promo-video/footage/gameplay';
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const t0 = Date.now();
const timeline = [];
const mark = (ev) => { const t = +((Date.now() - t0) / 1000).toFixed(1); timeline.push({ t, ev }); console.log(t.toFixed(1).padStart(6), ev); };

const CURSOR = `
  (() => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;width:22px;height:22px;z-index:999999;pointer-events:none;left:0;top:0';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 15.5 L11.5 22 L14.5 20.5 L11.5 14 L18 14 Z" fill="#fff" stroke="#111" stroke-width="1.6"/></svg>';
    const add = () => document.body && document.body.appendChild(c);
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;width:12px;height:12px;margin:-6px;border-radius:50%;border:3px solid #e8b45a;z-index:999998;pointer-events:none;opacity:.95;transition:all .4s ease-out';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(3)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
  })();
`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 780, height: 1688 } },
});
await context.addInitScript(CURSOR);
const page = await context.newPage();

const move = async (loc) => {
  const b = await loc.boundingBox();
  if (!b) return false;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.waitForTimeout(180);
  return true;
};
const tapLoc = async (loc) => { if (await move(loc)) { await loc.click(); return true; } return false; };

await page.goto('http://localhost:3000', { waitUntil: 'load' });
await page.waitForTimeout(1500);
mark('landing');

// 创建房间
await tapLoc(page.locator('#nm'));
await page.locator('#nm').pressSequentially('三三', { delay: 160 });
await page.waitForTimeout(400);
await tapLoc(page.locator('button:has-text("创建房间")'));
await page.waitForSelector('.big em', { timeout: 10000 });
const code = (await page.locator('.big em').innerText()).trim();
mark('room-created:' + code);
await page.waitForTimeout(1200);

// 召唤陪玩
const bots = spawn('node', ['bots-join.js', code], { cwd: 'D:/life-pawnshop', stdio: 'inherit' });
// 等两位进房
await page.waitForFunction(() => document.querySelectorAll('.pchip').length >= 3, null, { timeout: 20000 });
mark('friends-joined');
await page.waitForTimeout(1500);

// 选主题:人生
await tapLoc(page.locator('.deckopt').first());
await page.waitForTimeout(1200);
mark('deck-life');
await tapLoc(page.locator('button:has-text("开始游戏")'));
mark('game-start');

// 状态机
let picked = false, myDramas = 0, redeems = 0, done = false;
const deadline = Date.now() + 10 * 60 * 1000;

while (!done && Date.now() < deadline) {
  await page.waitForTimeout(600);
  try {
    // 选 7 张家底
    if (!picked && await page.locator('h3:has-text("选出 7 张")').count()) {
      mark('pick-start');
      const cards = page.locator('.panel .qcard:not(.mini)');
      const n = await cards.count();
      for (let i = 0; i < 6 && i < n; i++) {
        await tapLoc(cards.nth(i));
        await page.waitForTimeout(420);
      }
      const cust = page.locator('#cust');
      if (await cust.count()) {
        await tapLoc(cust);
        await cust.pressSequentially('我的猫', { delay: 200 });
        await page.waitForTimeout(400);
        await tapLoc(page.locator('button:has-text("加入这张牌")'));
        await page.waitForTimeout(600);
      }
      const ok = page.locator('button:has-text("确认"):not([disabled])');
      if (await ok.count()) { await tapLoc(ok); picked = true; mark('pick-done'); }
      continue;
    }
    // 暗拍
    const bid = page.locator('#bid');
    if (await bid.count()) {
      mark('auction');
      await tapLoc(bid);
      await bid.fill('');
      await bid.pressSequentially('12', { delay: 220 });
      await page.waitForTimeout(500);
      await tapLoc(page.locator('button:has-text("提交出价")'));
      await page.waitForTimeout(1200);
      continue;
    }
    // 我的回合:挫折
    const pawnBtn = page.locator('button:has-text("典当这 2 张")');
    const endureBtn = page.locator('.btn.red');
    if (await pawnBtn.count()) {
      myDramas++;
      if (myDramas === 1) {
        mark('my-drama-pawn');
        const cs = page.locator('.pawnbox .qcard');
        await tapLoc(cs.nth(0)); await page.waitForTimeout(500);
        await tapLoc(cs.nth(1)); await page.waitForTimeout(600);
        const pb = page.locator('button:has-text("典当这 2 张"):not([disabled])');
        if (await pb.count()) await tapLoc(pb);
      } else {
        mark('my-drama-endure');
        await page.waitForTimeout(800);
        if (await endureBtn.count()) await tapLoc(endureBtn.first());
      }
      await page.waitForTimeout(1500);
      continue;
    }
    // 我的回合:机遇
    const takeBtn = page.locator('button:has-text("抓住机遇")');
    if (await takeBtn.count()) {
      mark('my-op');
      const cs = page.locator('.pawnbox .qcard');
      if (await cs.count()) { await tapLoc(cs.first()); await page.waitForTimeout(500); }
      const tb = page.locator('button:has-text("抓住机遇"):not([disabled])');
      if (await tb.count()) await tapLoc(tb); else await tapLoc(page.locator('button:has-text("放过它")'));
      await page.waitForTimeout(1200);
      continue;
    }
    // 猜别人
    const guessPanel = page.locator('h3:has-text("你猜")');
    if (await guessPanel.count()) {
      const gbs = page.locator('.row .btn.ghost');
      if (await gbs.count()) {
        mark('guess');
        await tapLoc(gbs.nth(Math.random() < 0.5 ? 0 : 1));
        await page.waitForTimeout(1000);
      }
      continue;
    }
    // 赎回窗口
    const redeemPanel = page.locator('h3:has-text("赎回窗口")');
    if (await redeemPanel.count()) {
      redeems++;
      const selectable = page.locator('.panel .qcard');
      if (redeems === 1 && await selectable.count()) {
        mark('redeem-buy');
        await tapLoc(selectable.first());
        await page.waitForTimeout(600);
        const rb = page.locator('button:has-text("赎回所选"):not([disabled])');
        if (await rb.count()) await tapLoc(rb); else await tapLoc(page.locator('button:has-text("这次不赎")'));
      } else {
        mark('redeem-pass');
        await tapLoc(page.locator('button:has-text("这次不赎")'));
      }
      await page.waitForTimeout(1200);
      continue;
    }
    // 终局
    if (await page.locator('.big:has-text("游戏结束")').count()) {
      mark('finale');
      // 等小传写完(最多 90s)
      try {
        await page.waitForFunction(() => document.querySelectorAll('.bio').length >= 3, null, { timeout: 90000 });
        mark('bios-ready');
      } catch { mark('bios-timeout'); }
      await page.waitForTimeout(1500);
      // 慢慢滚完整页
      await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 6) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 12)); }
      });
      mark('finale-scrolled');
      await page.waitForTimeout(2000);
      done = true;
      continue;
    }
  } catch (e) { /* 状态切换竞态,下轮重试 */ }
}

mark(done ? 'DONE' : 'TIMEOUT');
await fs.writeFile(OUT + '/timeline.json', JSON.stringify(timeline, null, 2));
await context.close();
await browser.close();
bots.kill();
process.exit(0);
