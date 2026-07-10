// 补录：爱情 / 事业 主题的选牌与挫折牌画面（用于快切蒙太奇）
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const req = createRequire('file:///D:/life-pawnshop/package.json');
const { io } = req('socket.io-client');

const OUT = 'D:/life-pawnshop/promo-video/footage';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

const ZOOM = 1035 / 540;
const TAP_SCRIPT = `
  const az = () => { if (document.documentElement) document.documentElement.style.zoom = ${1035 / 540}; };
  az(); document.addEventListener('DOMContentLoaded', az);
`;

function bot(name, code) {
  const s = io(URL);
  const st = { id: null, acted: {} };
  s.on('connect', () => {
    s.emit('join', { code, name }, (res) => { if (!res.error) st.id = res.playerId; });
  });
  s.on('state', (S) => {
    const me = S.players.find((p) => p.id === st.id);
    if (!me) return;
    if (S.state === 'pick' && !me.picked && !st.acted.pick) {
      st.acted.pick = true;
      const cards = S.deck.qualities.slice().sort(() => Math.random() - 0.5).slice(0, 7);
      setTimeout(() => s.emit('submitPick', { cards }), rnd(1500, 2500));
    }
    if (S.state === 'auction' && S.auction && !S.auction.submitted.includes(st.id) && !st.acted['bid' + S.auction.index]) {
      st.acted['bid' + S.auction.index] = true;
      setTimeout(() => s.emit('submitBid', { bid: Math.floor(rnd(1, 15)) }), rnd(1200, 2200));
    }
    if (S.state === 'stage' && S.drama) {
      const key = S.drama.card;
      if (S.drama.playerId !== st.id && !S.drama.guessed.includes(st.id) && !st.acted['g' + key]) {
        st.acted['g' + key] = true;
        setTimeout(() => s.emit('submitGuess', { guess: S.drama.kind === 'op' ? 'pass' : 'pawn' }), rnd(1000, 2000));
      }
      if (S.drama.playerId === st.id && !S.drama.chosen && !st.acted['c' + key]) {
        st.acted['c' + key] = true;
        setTimeout(() => {
          if (S.drama.kind === 'op') s.emit('resolveChoice', { choice: 'pass' });
          else if (me.hand.length >= 2) s.emit('resolveChoice', { choice: 'pawn', cards: me.hand.slice(0, 2) });
          else s.emit('resolveChoice', { choice: 'endure' });
        }, rnd(1500, 2500));
      }
    }
  });
  return s;
}

async function session(browser, themeName, clipName, picks) {
  const context = await browser.newContext({
    viewport: { width: 1035, height: 1840 },
    recordVideo: { dir: OUT + '/' + clipName, size: { width: 1035, height: 1840 } },
  });
  await context.addInitScript(TAP_SCRIPT);
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); location.reload(); });
  await page.waitForSelector('#nm');
  await page.evaluate((z) => { document.documentElement.style.zoom = z; }, ZOOM);
  await page.evaluate(() => document.fonts.ready);
  const marks = [];
  const t0 = Date.now();
  const mark = (l) => { marks.push({ label: l, t: Math.round((Date.now() - t0) / 100) / 10 }); console.log(`  [${clipName}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${l}`); };

  await page.locator('#nm').pressSequentially('我', { delay: 100 });
  await page.locator('.btn', { hasText: '创建房间' }).click();
  await page.waitForSelector('.big em');
  const code = await page.locator('.big em').textContent();
  bot('毛毛', code);
  await sleep(1500);
  mark('大厅');
  await page.locator('.deckopt', { hasText: themeName }).click();
  await sleep(1800); // 主题色渐变
  mark('切主题' + themeName);
  await page.locator('.btn', { hasText: '开始游戏' }).click();
  await page.waitForSelector('.qcard');
  mark('选牌页');
  await sleep(1200);
  for (const p of picks) {
    await page.locator('.qcard', { hasText: p }).first().click();
    await sleep(rnd(500, 850));
  }
  mark('选了' + picks.length + '张');
  // 补满7张
  const need = 7 - picks.length;
  const rest = page.locator('.qcard:not(.sel)');
  for (let i = 0; i < need; i++) { await rest.nth(i).click(); await sleep(350); }
  await sleep(600);
  await page.locator('.btn:not([disabled])', { hasText: '确认' }).click();
  mark('确认');

  // 快速过拍卖，等挫折牌出现
  const started = Date.now();
  let sawTrial = false;
  while (Date.now() - started < 90000) {
    await sleep(500);
    const txt = await page.evaluate(() => document.getElementById('app').innerText).catch(() => '');
    if (txt.includes('提交出价')) {
      const k = (txt.match(/第 (\d+) \//) || [])[1];
      if (!marks.some((m) => m.label === 'bid' + k)) {
        mark('bid' + k);
        await page.locator('#bid').fill('8').catch(() => {});
        await sleep(400);
        await page.locator('.btn', { hasText: '提交出价' }).click().catch(() => {});
      }
      continue;
    }
    if (txt.includes('轮到你了') || (txt.includes('你猜') && txt.includes('会怎么选'))) {
      const trial = await page.evaluate(() => (document.querySelector('.trial .tx') || {}).textContent || '');
      mark('挫折牌：' + trial);
      await sleep(4500); // 停在牌面上，剪辑用
      sawTrial = true;
      break;
    }
  }
  if (!sawTrial) mark('没等到挫折牌');
  await sleep(800);
  await context.close();
  await fs.writeFile(`${OUT}/${clipName}-marks.json`, JSON.stringify(marks, null, 2));
}

async function main() {
  const browser = await chromium.launch();
  await session(browser, '爱情', 'theme-love', ['心动的感觉', '无话不谈', '安全感', '性吸引力', '接住情绪的能力']);
  await session(browser, '事业', 'theme-founder', ['现金流', '创始团队的友情', '睡个好觉的能力', '产品初心', '再来一次的勇气']);
  await browser.close();
  console.log('THEMES DONE');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
