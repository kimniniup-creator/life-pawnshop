// 人生当铺 宣传片素材录制：真实 UI + 机器人陪打
// 运行: node record.mjs   (需要 server.js 已在 3000 端口运行)
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const req = createRequire('file:///D:/life-pawnshop/package.json');
const { io } = req('socket.io-client');

const OUT = 'D:/life-pawnshop/promo-video/footage';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

// 手机触摸波纹（无鼠标箭头，像真实手机录屏）
const ZOOM = 1035 / 540;
const TAP_SCRIPT = `
  (() => {
    const az = () => { if (document.documentElement) document.documentElement.style.zoom = ${1035 / 540}; };
    az(); document.addEventListener('DOMContentLoaded', az);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;width:34px;height:34px;margin:-17px;border-radius:50%;background:rgba(255,255,255,.25);border:1.5px solid rgba(255,255,255,.5);z-index:999999;pointer-events:none;transition:all .5s ease-out';
      const add=()=>document.body&&document.body.appendChild(r);
      add();
      requestAnimationFrame(() => { r.style.transform = 'scale(2.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 650);
    }, true);
  })();
`;

// ── 机器人 ──────────────────────────────────────
function bot(name, code, opts = {}) {
  const s = io(URL);
  const st = { id: null, acted: {} };
  s.on('connect', () => {
    s.emit('join', { code, name }, (res) => {
      if (res.error) return console.error(`[${name}] join失败`, res.error);
      st.id = res.playerId;
      console.log(`[${name}] 进房`);
    });
  });
  s.on('state', (S) => {
    const me = S.players.find((p) => p.id === st.id);
    if (!me) return;
    const key = S.state + ':' + S.stageIndex + ':' + S.turnIndex + ':' + (S.auction ? S.auction.index : '') + ':' + (S.drama ? S.drama.card : '');
    if (S.state === 'pick' && !me.picked && !st.acted.pick) {
      st.acted.pick = true;
      const cards = S.deck.qualities.slice().sort(() => Math.random() - 0.5).slice(0, 7);
      setTimeout(() => s.emit('submitPick', { cards }), rnd(2500, 5000));
    }
    if (S.state === 'auction' && S.auction && !S.auction.submitted.includes(st.id) && !st.acted['bid' + S.auction.index]) {
      st.acted['bid' + S.auction.index] = true;
      setTimeout(() => s.emit('submitBid', { bid: Math.floor(rnd(0, 18)) }), rnd(2000, 4500));
    }
    if (S.state === 'stage' && S.drama) {
      const isOp = S.drama.kind === 'op';
      if (S.drama.playerId !== st.id && !S.drama.guessed.includes(st.id) && !st.acted['g' + key]) {
        st.acted['g' + key] = true;
        const g = isOp ? (Math.random() < 0.5 ? 'take' : 'pass') : (Math.random() < 0.5 ? 'endure' : 'pawn');
        setTimeout(() => s.emit('submitGuess', { guess: g }), rnd(1500, 3500));
      }
      if (S.drama.playerId === st.id && !S.drama.chosen && !st.acted['c' + key]) {
        st.acted['c' + key] = true;
        setTimeout(() => {
          if (isOp) {
            if (me.hand.length >= 1 && Math.random() < 0.5) s.emit('resolveChoice', { choice: 'take', cards: me.hand.slice(0, 1) });
            else s.emit('resolveChoice', { choice: 'pass' });
          } else if (me.hand.length >= 2 && Math.random() < 0.65) {
            const shuf = me.hand.slice().sort(() => Math.random() - 0.5);
            s.emit('resolveChoice', { choice: 'pawn', cards: shuf.slice(0, 2) });
          } else {
            s.emit('resolveChoice', { choice: 'endure' });
          }
        }, rnd(2500, 5000));
      }
    }
    if (S.state === 'redeem' && !me.redeemDone && !st.acted['r' + S.stageIndex]) {
      st.acted['r' + S.stageIndex] = true;
      setTimeout(() => s.emit('submitRedeem', { indices: [] }), rnd(2000, 4000));
    }
  });
  return s;
}

// ── 录制页操作 ──────────────────────────────────
async function clickText(page, sel, txt) {
  const loc = page.locator(sel, { hasText: txt }).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  await loc.click();
}

const marks = [];
let t0 = 0;
function mark(label) {
  const t = (Date.now() - t0) / 1000;
  marks.push({ label, t: Math.round(t * 10) / 10 });
  console.log(`  ⏱ ${t.toFixed(1)}s  ${label}`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1035, height: 1840 },
    recordVideo: { dir: OUT + '/main', size: { width: 1035, height: 1840 } },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(TAP_SCRIPT);
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); location.reload(); });
  await page.waitForSelector('#nm');
  await page.evaluate((z) => { document.documentElement.style.zoom = z; }, ZOOM);
  await page.evaluate(() => document.fonts.ready);
  const zchk = await page.evaluate(() => document.querySelector('.panel').getBoundingClientRect().width);
  console.log('zoom check panel width (物理px应≈960):', zchk);
  t0 = Date.now();
  mark('hero首页');
  await sleep(2600);

  // 1. 输入名字 + 创建房间
  await page.locator('#nm').click();
  await sleep(400);
  await page.locator('#nm').pressSequentially('我', { delay: 160 });
  await sleep(500);
  mark('点创建房间');
  await clickText(page, '.btn', '创建房间');
  await page.waitForSelector('.big em');
  const code = await page.locator('.big em').textContent();
  console.log('房间号', code);
  mark('进入大厅-房间号' + code);
  await sleep(1500);

  // 2. 机器人进房
  bot('毛毛', code);
  await sleep(1200);
  bot('栗子', code);
  await sleep(2200);
  mark('人齐');

  // 3. 选主题（人生）→ 开始
  await clickText(page, '.deckopt', '人生');
  await sleep(1600);
  mark('选主题人生');
  await clickText(page, '.btn', '开始游戏');
  await page.waitForSelector('.qcard');
  mark('进入选牌');
  await sleep(2000);

  // 4. 选 7 张：6 张固定 + 自写「我的猫」
  const picks = ['家人', '健康', '自由', '珍贵的记忆', '一群老朋友', '说走就走的底气'];
  for (const p of picks) {
    await page.locator('.qcard', { hasText: p }).first().click();
    await sleep(rnd(700, 1300));
  }
  mark('选完6张');
  await page.locator('#cust').scrollIntoViewIfNeeded();
  await page.locator('#cust').click();
  await sleep(400);
  await page.locator('#cust').pressSequentially('我的猫', { delay: 200 });
  await sleep(600);
  mark('写完我的猫');
  await clickText(page, '.btn', '加入这张牌');
  await sleep(1400);
  mark('我的猫入列');
  await clickText(page, '.btn:not([disabled])', '确认');
  mark('确认选牌');

  // 5. 主循环：状态驱动
  let done = false;
  let myTrialCount = 0;
  let redeemCount = 0;
  const acted = new Set();
  page.on('close', () => { done = true; });

  const started = Date.now();
  while (!done && Date.now() - started < 420000) {
    await sleep(650);
    const txt = await page.evaluate(() => document.getElementById('app').innerText).catch(() => '');
    if (!txt) continue;

    // 拍卖
    if (txt.includes('稀有牌暗拍') && txt.includes('提交出价')) {
      const k = 'bid:' + (txt.match(/第 (\d+) \//) || [])[1];
      if (!acted.has(k)) {
        acted.add(k);
        await sleep(rnd(1800, 2600));
        const amount = k === 'bid:1' ? '12' : '5';
        await page.locator('#bid').click().catch(() => {});
        await page.locator('#bid').fill('');
        await page.locator('#bid').pressSequentially(amount, { delay: 150 }).catch(() => {});
        await sleep(700);
        mark('出价' + amount + '(' + k + ')');
        await clickText(page, '.btn', '提交出价').catch(() => {});
      }
      continue;
    }

    // 我的回合：挫折
    if (txt.includes('轮到你了，怎么选')) {
      const trial = await page.evaluate(() => (document.querySelector('.trial .tx') || {}).textContent || '');
      const k = 'my:' + trial;
      if (!acted.has(k)) {
        acted.add(k);
        myTrialCount++;
        mark('我的挫折#' + myTrialCount + '：' + trial);
        await sleep(3200); // 读牌停顿（剪辑重点）
        const canPawn = txt.includes('典当 2 张牌渡过');
        if (myTrialCount <= 2 && canPawn) {
          // 典当：优先当掉「自由」「说走就走的底气」，保住家人和猫
          const prefer = ['自由', '说走就走的底气', '一群老朋友', '珍贵的记忆'];
          let chosen = 0;
          for (const c of prefer) {
            if (chosen >= 2) break;
            const loc = page.locator('.pawnbox .qcard', { hasText: c }).first();
            if (await loc.count()) {
              await loc.scrollIntoViewIfNeeded().catch(() => {});
              await sleep(rnd(900, 1500));
              await loc.click().catch(() => {});
              chosen++;
              mark('点选典当:' + c);
            }
          }
          if (chosen < 2) {
            const others = page.locator('.pawnbox .qcard:not(.sel)');
            const n = await others.count();
            for (let i = 0; i < n && chosen < 2; i++) { await others.nth(i).click().catch(() => {}); chosen++; }
          }
          await sleep(1100);
          mark('确认典当');
          await clickText(page, '.btn', '典当这 2 张').catch(() => {});
        } else {
          mark('选择硬扛');
          await clickText(page, '.btn.red', '硬扛').catch(() => {});
        }
      }
      continue;
    }

    // 我的回合：机遇
    if (txt.includes('机遇只敲一次门')) {
      const trial = await page.evaluate(() => (document.querySelector('.trial .tx') || {}).textContent || '');
      const k = 'myop:' + trial;
      if (!acted.has(k)) {
        acted.add(k);
        mark('我的机遇：' + trial);
        await sleep(3000);
        mark('放过机遇');
        await clickText(page, '.btn.ghost', '放过它').catch(() => {});
      }
      continue;
    }

    // 猜别人
    if (txt.includes('你猜') && txt.includes('会怎么选')) {
      const trial = await page.evaluate(() => (document.querySelector('.trial .tx') || {}).textContent || '');
      const k = 'guess:' + trial;
      if (!acted.has(k)) {
        acted.add(k);
        mark('猜别人：' + trial);
        await sleep(rnd(2200, 3200));
        const btns = page.locator('.row .btn.ghost');
        if (await btns.count()) {
          await btns.nth(Math.random() < 0.5 ? 0 : 1).click().catch(() => {});
          mark('提交猜测');
        }
      }
      continue;
    }

    // 赎回窗口
    if (txt.includes('赎回窗口')) {
      const k = 'redeem:' + redeemCount;
      if (!acted.has(k)) {
        acted.add(k);
        redeemCount++;
        mark('赎回窗口#' + redeemCount);
        await sleep(2800);
        if (redeemCount === 2 && txt.includes('最后机会')) {
          // 赎回一张最后机会的
          const loc = page.locator('.panel .qcard', { has: page.locator('.dl') }).first();
          if (await loc.count()) {
            await loc.click().catch(() => {});
            await sleep(1200);
            mark('赎回一张');
            const btn = page.locator('.btn:not(.ghost):not([disabled])', { hasText: '赎回所选' });
            if (await btn.count()) await btn.click().catch(() => {});
            else await clickText(page, '.btn.ghost', '这次不赎').catch(() => {});
          } else {
            await clickText(page, '.btn.ghost', '这次不赎').catch(() => {});
          }
        } else {
          mark('这次不赎');
          await clickText(page, '.btn.ghost', '这次不赎').catch(() => {});
        }
      }
      continue;
    }

    // 结局
    if (txt.includes('游戏结束') && txt.includes('共鸣榜')) {
      if (!acted.has('finale')) {
        acted.add('finale');
        mark('结局页');
        await sleep(3000);
        // 等老板手记（AI 生成最多等 60s）
        for (let i = 0; i < 30; i++) {
          const hasBio = await page.evaluate(() => !!document.querySelector('.bio'));
          if (hasBio) break;
          await sleep(2000);
        }
        mark('手记出现');
        await sleep(1500);
        // 慢慢滚动看每个人的一生
        await page.evaluate(() => new Promise((done2) => {
          const total = document.body.scrollHeight - innerHeight / 2;
          const t0 = performance.now(), ms = 9000;
          (function step(now) {
            const p = Math.min(1, (now - t0) / ms);
            const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            scrollTo(0, total * e);
            p < 1 ? requestAnimationFrame(step) : done2();
          })(t0);
        }));
        mark('滚动结束');
        await sleep(2500);
        done = true;
      }
      continue;
    }
  }

  mark('收工');
  await context.close();
  await browser.close();
  await fs.writeFile(OUT + '/marks.json', JSON.stringify(marks, null, 2));
  console.log('DONE');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
