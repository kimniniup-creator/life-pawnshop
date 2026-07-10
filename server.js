// 人生当铺 · 多人在线服务器
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { DECKS, EXCLUSIONS } = require('./decks');
const { ownerLine, ownerChat, writeBios } = require('./ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const rooms = new Map(); // code -> room

const HAND_SIZE = 7;      // 底牌数
const MAX_CUSTOM = 2;     // 自写牌上限
const START_RES = 60;     // 每项资源初始值（60：让"扣不完"变成"必须精打细算"）
const GUESS_POINTS = 10;  // 竞猜共鸣点

function resName(deck, id) { return (deck.resources.find((r) => r.id === id) || {}).name || id; }
function rareName(deck, id) { return ((deck.rares || []).find((r) => r.id === id) || {}).name || id; }
// 硬扛代价：基础 10+5×阶段；关联品质在手 −5，不在手 +5
function endureAmt(room, player, drama) {
  const base = 10 + 5 * room.stageIndex;
  return base + (player.hand.includes(drama.rel) ? -5 : 5);
}

function code4() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const REDEEM_PRICE = 15;       // 赎回固定价
const REACT_EMOJIS = ['👍', '🐂', '😂', '💔', '🔥'];
function redeemPrice() { return REDEEM_PRICE; }

function publicState(room) {
  const deck = room.deckId ? DECKS[room.deckId] : null;
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    deck: deck ? { id: deck.id, name: deck.name, tagline: deck.tagline, stages: deck.stages, qualities: deck.qualities, resources: deck.resources, currency: deck.currency, endureLabel: deck.endureLabel, rares: deck.rares } : null,
    stageIndex: room.stageIndex,
    turnIndex: room.turnIndex,
    redeemPrice: room.state === 'redeem' ? redeemPrice() : null,
    endings: room.state === 'finale' ? room.endings : null,
    auction: room.auction ? {
      index: room.auction.index,
      card: room.auctionCards[room.auction.index],
      total: room.auctionCards.length,
      submitted: Object.keys(room.auction.bids),
    } : null,
    drama: room.drama ? (() => {
      const ap = room.players.find((p) => p.id === room.drama.playerId);
      return {
        playerId: room.drama.playerId,
        card: room.drama.card,
        kind: room.drama.kind,
        sub: room.drama.sub || '',
        costName: (deck && room.drama.cost) ? resName(deck, room.drama.cost) : '',
        gainName: (deck && room.drama.gain) ? resName(deck, room.drama.gain) : '',
        rel: room.drama.rel || '',
        relHeld: !!(ap && room.drama.rel && ap.hand.includes(room.drama.rel)),
        costAmt: ap && room.drama.kind === 'trial' ? endureAmt(room, ap, room.drama) : 0,
        guessed: Object.keys(room.drama.guesses),
        chosen: !!room.drama.choice,
      };
    })() : null,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected,
      res: p.res, resonance: p.resonance, broken: p.broken, guessRight: p.guessRight || 0,
      handCount: p.hand.length,
      hand: p.hand, // 手牌公开：本来就是聊天游戏，公开更有话题
      rares: p.rares,
      sealed: p.sealed,
      pawned: p.pawned,
      scars: p.scars,
      traded: p.traded,
      picked: p.picked,
      redeemDone: p.redeemDone,
    })),
    log: room.log.slice(-120),
  };
}
function sync(room) { io.to(room.code).emit('state', publicState(room)); }
function say(room, text, cls, from, name, emo) {
  const isOwner = (from || (cls === 'owner' ? 'owner' : 'system')) === 'owner';
  const msg = {
    id: ++room.seq, text, cls: cls || '',
    from: from || (cls === 'owner' ? 'owner' : 'system'),
    name: name || '', emo: isOwner ? (emo || 'idle') : undefined, reactions: {}, t: Date.now(),
  };
  room.log.push(msg);
  if (room.log.length > 300) room.log.splice(0, room.log.length - 300);
  io.to(room.code).emit('logline', msg);
  return msg;
}
// 动作 → 掌柜表情（掌柜动态）
const ACTION_EMO = { pawn: 'stamp', endure: 'stern', redeem: 'abacus', take: 'card', pass: 'smirk' };
// 老板台词缓冲：有人还没选/没猜完时不放出，等开牌后统一说（防止提前影响判断）
function deliverOwner(room, line, emo) {
  if (room.state === 'stage' && room.drama) {
    (room.ownerQueue || (room.ownerQueue = [])).push({ line, emo });
  } else {
    say(room, line, 'owner', null, null, emo);
  }
}
function flushOwner(room) {
  const q = room.ownerQueue || [];
  room.ownerQueue = [];
  q.forEach((item) => say(room, item.line, 'owner', null, null, item.emo));
}
function ownerSay(room, ctx) {
  const deck = DECKS[room.deckId];
  const p = room.players.find((x) => x.name === ctx.playerName);
  const resSummary = p && p.res ? deck.resources.map((r) => `${r.name}${p.res[r.id]}`).join('、') : '';
  ownerLine({
    ...ctx, deckName: deck.name,
    stageName: deck.stages[room.stageIndex] || '',
    resSummary, handCount: p ? p.hand.length : 0,
  }).then((line) => {
    if (rooms.get(room.code) !== room) return;
    deliverOwner(room, line, ACTION_EMO[ctx.action] || 'sly');
  });
}

function startAuction(room) {
  const deck = DECKS[room.deckId];
  room.state = 'auction';
  room.auctionCards = shuffle(deck.rares).slice(0, 3);
  room.auction = { index: 0, bids: {} };
  say(room, `稀有牌拍卖开始：本局放出 ${room.auctionCards.length} 件（${room.auctionCards.map((c) => `「${c.name}」`).join('')}），用你的「${resName(deck, deck.currency)}」出价。暗拍，价高者得，至少出 1 才算参拍。`);
  sync(room);
}
function resolveAuction(room) {
  const deck = DECKS[room.deckId];
  const cur = deck.currency;
  const curName = resName(deck, cur);
  const card = room.auctionCards[room.auction.index];
  const bids = room.auction.bids;
  let best = null; let bestBid = 0;
  const order = shuffle(room.players.filter((p) => (bids[p.id] || 0) > 0));
  for (const p of order) {
    const b = bids[p.id] || 0;
    if (b > bestBid) { best = p; bestBid = b; }
  }
  if (best) {
    best.res[cur] -= bestBid;
    best.rares.push(card.id);
    say(room, `「${card.name}」被 ${best.name} 以 ${bestBid} 点${curName}拍下`, 'gold');
  } else {
    say(room, `「${card.name}」没人出价（至少出 1 才算参拍），流拍了`);
  }
  room.auction.index += 1;
  room.auction.bids = {};
  if (room.auction.index >= room.auctionCards.length) {
    room.auction = null;
    startStages(room);
  } else {
    sync(room);
  }
}

function startStages(room) {
  room.state = 'stage';
  room.stageIndex = 0;
  room.turnIndex = 0;
  room.turnOrder = shuffle(room.players.map((p) => p.id));
  const deck = DECKS[room.deckId];
  say(room, `—— ${deck.stages[0]} ——`, 'stage');
  startTurn(room);
}
function activePlayer(room) {
  return room.players.find((p) => p.id === room.turnOrder[room.turnIndex]);
}
function bannedFor(p) {
  const banned = new Set();
  for (const h of p.history) {
    (EXCLUSIONS[h] || []).forEach((t) => banned.add(t));
    for (const [k, v] of Object.entries(EXCLUSIONS)) if (v.includes(h)) banned.add(k);
  }
  return banned;
}
function startTurn(room) {
  const deck = DECKS[room.deckId];
  const p = activePlayer(room);
  const pool = deck.trials[room.stageIndex];
  const used = room.usedTrials || (room.usedTrials = new Set());
  const banned = bannedFor(p);
  let candidates = pool.filter((x) => !used.has(x.t) && !banned.has(x.t));
  if (candidates.length === 0) candidates = pool.filter((x) => !banned.has(x.t));
  if (candidates.length === 0) candidates = pool;
  const trial = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(trial.t);
  room.drama = {
    playerId: p.id, card: trial.t, kind: trial.kind === 'op' ? 'op' : 'trial',
    cost: trial.cost || null, gain: trial.gain || null, rel: trial.rel || '', sub: trial.s || '',
    guesses: {}, choice: null,
  };
  if (room.drama.kind === 'op') say(room, `✨ 机遇降临：${p.name} 遇到了「${trial.t}」`);
  else say(room, `命运抽牌：${p.name} 遇到了「${trial.t}」`);
  sync(room);
}
// 猜与选并行：当事人已选 + 在线的其他人都猜完 → 开牌
function maybeResolve(room) {
  const d = room.drama;
  if (!d || !d.choice) return sync(room);
  const others = room.players.filter((p) => p.id !== d.playerId && p.connected);
  if (!others.every((p) => d.guesses[p.id])) return sync(room);
  doResolve(room);
}
function doResolve(room) {
  const deck = DECKS[room.deckId];
  const d = room.drama;
  const p = room.players.find((x) => x.id === d.playerId);
  const trial = d.card;
  let actual;
  if (d.kind === 'op') {
    if (d.choice.type === 'take') {
      const card = d.choice.cards[0];
      p.hand = p.hand.filter((c) => c !== card);
      p.traded.push({ card, gain: d.gain, stage: room.stageIndex, op: trial });
      p.res[d.gain] += 25;
      p.history.push(trial);
      actual = 'take';
      say(room, `开牌：${p.name} 交出了「${card}」，抓住了这个机遇——${resName(deck, d.gain)} +25`, 'gold');
      ownerSay(room, { action: 'take', playerName: p.name, cards: [card], trial });
    } else {
      p.history.push(trial);
      actual = 'pass';
      say(room, `开牌：${p.name} 摇了摇头，放过了这个机遇`);
      ownerSay(room, { action: 'pass', playerName: p.name, trial });
    }
    awardGuesses(room, p, actual);
    finishTurn(room);
    return;
  }
  if (d.choice.type === 'endure') {
    const held = p.hand.includes(d.rel);
    const cost = endureAmt(room, p, d);
    p.res[d.cost] -= cost;
    p.scars.push(trial);
    p.history.push(trial);
    actual = 'endure';
    say(room, `开牌：${p.name} 选择${deck.endureLabel}「${trial}」，${resName(deck, d.cost)} −${cost}${d.rel ? (held ? `（手里的「${d.rel}」帮TA撑住了，少扣 5）` : `（「${d.rel}」不在TA手里，多扣 5）`) : ''}`);
    if (p.res[d.cost] <= 0 && !p.broken.some((b) => b.res === d.cost)) {
      const rmeta = deck.resources.find((r) => r.id === d.cost);
      p.broken.push({ res: d.cost, stage: room.stageIndex });
      say(room, `💥 ${p.name} 的「${rmeta.name}」见底——${rmeta.zero}`, 'gold');
    }
    ownerSay(room, { action: 'endure', playerName: p.name, trial });
  } else {
    const picked = d.choice.cards;
    p.hand = p.hand.filter((c) => !picked.includes(c));
    picked.forEach((c) => p.pawned.push({ card: c, stage: room.stageIndex, redeemed: false, dead: false }));
    p.history.push(trial);
    actual = 'pawn';
    say(room, `开牌：${p.name} 典当了${picked.map((c) => `「${c}」`).join('和')}，渡过了「${trial}」`);
    ownerSay(room, { action: 'pawn', playerName: p.name, cards: picked, trial });
  }
  awardGuesses(room, p, actual);
  finishTurn(room);
}
// 结算竞猜：boost 稀有牌让下一次猜中翻倍
function awardGuesses(room, active, actual) {
  const deck = DECKS[room.deckId];
  const results = [];
  for (const g of room.players) {
    if (g.id === active.id) continue;
    if (room.drama.guesses[g.id] === actual) {
      let pts = GUESS_POINTS;
      if (g.rares.includes('boost')) {
        pts = GUESS_POINTS * 2;
        g.rares = g.rares.filter((r) => r !== 'boost');
        say(room, `✨ ${g.name} 的「${rareName(deck, 'boost')}」生效：这次猜中共鸣翻倍！`, 'gold');
      }
      g.resonance += pts;
      g.guessRight = (g.guessRight || 0) + 1;
      results.push(`${g.name}(+${pts})`);
    }
  }
  if (results.length) say(room, `${results.join('、')} 猜中了 ${active.name} 的选择`);
  else say(room, `没有人猜中 ${active.name} 的选择`);
}
function finishTurn(room) {
  room.drama = null;
  flushOwner(room);
  room.turnIndex += 1;
  if (room.turnIndex >= room.turnOrder.length) {
    room.state = 'redeem';
    room.players.forEach((p) => { p.redeemDone = false; });
    const deck = DECKS[room.deckId];
    say(room, `赎回窗口开启：${redeemPrice()} 点${resName(deck, deck.currency)}一张。注意：每张当票只保留两个窗口，过期死当，永远归当铺。`, 'gold');
    sync(room);
  } else {
    startTurn(room);
  }
}
function nextStageOrFinale(room) {
  // 死当结算：当票只保留“典当当期 + 下一期”两个赎回窗口
  for (const p of room.players) {
    for (const x of p.pawned) {
      if (!x.redeemed && !x.dead && x.stage < room.stageIndex) {
        x.dead = true;
        say(room, `⚰️ 死当：${p.name} 的「${x.card}」过了赎回期，永远归当铺了`, 'owner');
      }
    }
  }
  room.stageIndex += 1;
  if (room.stageIndex >= 5) return finale(room);
  room.state = 'stage';
  room.turnIndex = 0;
  room.turnOrder = shuffle(room.players.map((p) => p.id));
  const deck = DECKS[room.deckId];
  say(room, `—— ${deck.stages[room.stageIndex]} ——`, 'stage');
  startTurn(room);
}
function finale(room) {
  room.state = 'finale';
  room.bios = null;
  flushOwner(room);
  const deck = DECKS[room.deckId];
  // 结局档位：崩局或濒死=bad；无崩局且资源殷实牌又多=good；其余=mid
  room.endings = {};
  for (const p of room.players) {
    const avg = deck.resources.reduce((s, r) => s + (p.res ? p.res[r.id] : 0), 0) / 3;
    let tier = 'mid';
    if (p.broken.length > 0 || avg < 15) tier = 'bad';
    else if (avg >= 45 && p.hand.length >= 3) tier = 'good';
    const e = deck.endings[tier];
    const variant = 1 + Math.floor(Math.random() * 2);
    room.endings[p.id] = { tier, title: e.title, ach: e.ach, line: e.line, img: `/endings/${deck.id}-${tier}-${variant}.png` };
  }
  const rank = room.players.slice().sort((a, b) => b.resonance - a.resonance);
  say(room, `游戏结束。共鸣榜第一：${rank[0].name}（${rank[0].resonance} 点）——全场最懂人心的人。`, 'gold');
  sync(room);
  writeBios(deck, room.players, room.endings).then((bios) => {
    if (rooms.get(room.code) !== room) return;
    room.bios = bios;
    io.to(room.code).emit('bios', bios);
  });
}

io.on('connection', (socket) => {
  let myRoom = null;
  let me = null;

  socket.on('create', ({ name }, cb) => {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return cb({ error: '先给自己起个名字' });
    const room = {
      code: code4(), hostId: null, deckId: null, state: 'lobby', seq: 0,
      players: [], stageIndex: 0, turnIndex: 0, turnOrder: [],
      auction: null, auctionCards: [], drama: null, log: [], usedTrials: new Set(), bios: null,
    };
    rooms.set(room.code, room);
    joinInternal(room, name, cb);
  });

  socket.on('join', ({ code, name }, cb) => {
    const room = rooms.get(String(code || '').trim());
    name = String(name || '').trim().slice(0, 12);
    if (!room) return cb({ error: '没有这个房间号' });
    if (!name) return cb({ error: '先给自己起个名字' });
    const existing = room.players.find((p) => p.name === name);
    if (existing) {
      existing.connected = true;
      existing.socketId = socket.id;
      me = existing; myRoom = room;
      socket.join(room.code);
      cb({ ok: true, code: room.code, playerId: existing.id, rejoin: true, bios: room.bios });
      say(room, `${name} 回来了`);
      sync(room);
      return;
    }
    if (room.state !== 'lobby') return cb({ error: '这局已经开始了，等下一局吧' });
    if (room.players.length >= 15) return cb({ error: '满员了（最多15人）' });
    joinInternal(room, name, cb);
  });

  function joinInternal(room, name, cb) {
    const player = {
      id: 'p' + Math.random().toString(36).slice(2, 9),
      name, socketId: socket.id, connected: true,
      res: null, broken: [], hand: [], rares: [], sealed: null, pawned: [], scars: [], history: [], traded: [],
      resonance: 0, picked: false, redeemDone: false,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    me = player; myRoom = room;
    socket.join(room.code);
    cb({ ok: true, code: room.code, playerId: player.id });
    say(room, `${name} 加入了房间`);
    sync(room);
  }

  socket.on('selectDeck', ({ deckId }) => {
    if (!myRoom || me.id !== myRoom.hostId || myRoom.state !== 'lobby') return;
    if (!DECKS[deckId]) return;
    myRoom.deckId = deckId;
    sync(myRoom);
  });

  socket.on('startGame', () => {
    if (!myRoom || me.id !== myRoom.hostId || myRoom.state !== 'lobby') return;
    if (!myRoom.deckId) return socket.emit('toast', '先选一套卡组');
    if (myRoom.players.length < 2) return socket.emit('toast', '至少要2个人才能开始');
    myRoom.state = 'pick';
    const deck = DECKS[myRoom.deckId];
    myRoom.players.forEach((p) => {
      p.res = Object.fromEntries(deck.resources.map((r) => [r.id, START_RES]));
    });
    say(myRoom, `游戏开始 · ${deck.name}。每人三项资源（${deck.resources.map((r) => r.name).join('/')}）各 ${START_RES} 点，先选出 ${HAND_SIZE} 张最珍视的牌（可以自己写 ${MAX_CUSTOM} 张）。`);
    sync(myRoom);
  });

  socket.on('submitPick', ({ cards }) => {
    if (!myRoom || myRoom.state !== 'pick' || me.picked) return;
    const deck = DECKS[myRoom.deckId];
    const set = [...new Set((cards || []).map((c) => String(c).trim().slice(0, 12)).filter(Boolean))];
    if (set.length !== HAND_SIZE) return socket.emit('toast', `要正好选 ${HAND_SIZE} 张`);
    const customs = set.filter((c) => !deck.qualities.includes(c));
    if (customs.length > MAX_CUSTOM) return socket.emit('toast', `自己写的牌最多 ${MAX_CUSTOM} 张`);
    me.hand = set;
    me.picked = true;
    say(myRoom, `${me.name} 选好了${customs.length ? `（自己写了${customs.map((c) => `「${c}」`).join('、')}）` : ''}`);
    if (myRoom.players.every((p) => p.picked)) {
      const count = {};
      myRoom.players.forEach((p) => p.hand.forEach((c) => { count[c] = (count[c] || 0) + 1; }));
      const popular = Object.entries(count).filter(([, n]) => n >= Math.max(2, myRoom.players.length - 1)).map(([c]) => c);
      if (popular.length) say(myRoom, `全场共识：几乎所有人都留下了${popular.map((c) => `「${c}」`).join('、')}`, 'gold');
      startAuction(myRoom);
    } else {
      sync(myRoom);
    }
  });

  socket.on('submitBid', ({ bid }) => {
    if (!myRoom || myRoom.state !== 'auction' || !myRoom.auction) return;
    const cur = DECKS[myRoom.deckId].currency;
    bid = Math.max(0, Math.min(Math.floor(Number(bid) || 0), Math.max(0, me.res[cur])));
    if (myRoom.auction.bids[me.id] !== undefined) return;
    myRoom.auction.bids[me.id] = bid;
    if (Object.keys(myRoom.auction.bids).length >= myRoom.players.length) {
      resolveAuction(myRoom);
    } else {
      sync(myRoom);
    }
  });

  socket.on('submitGuess', ({ guess }) => {
    const room = myRoom;
    if (!room || room.state !== 'stage' || !room.drama) return;
    if (me.id === room.drama.playerId) return;
    const valid = room.drama.kind === 'op' ? ['take', 'pass'] : ['endure', 'pawn'];
    if (!valid.includes(guess)) return;
    if (room.drama.guesses[me.id]) return;
    room.drama.guesses[me.id] = guess;
    maybeResolve(room);
  });

  socket.on('resolveChoice', ({ choice, cards, rare }) => {
    const room = myRoom;
    if (!room || room.state !== 'stage' || !room.drama) return;
    if (me.id !== room.drama.playerId || room.drama.choice) return;
    const trial = room.drama.card;

    if (choice === 'rare') {
      if (!me.rares.includes(rare)) return;
      const deck = DECKS[room.deckId];
      if (rare === 'redraw') {
        me.rares = me.rares.filter((r) => r !== rare);
        say(room, `${me.name} 打出「${rareName(deck, 'redraw')}」，把「${trial}」扔回了牌堆重抽（本轮竞猜作废，没人得分）`, 'gold');
        startTurn(room);
        return;
      }
      if (rare === 'immune' && room.drama.kind === 'trial') {
        me.rares = me.rares.filter((r) => r !== rare);
        me.history.push(trial);
        say(room, `${me.name} 打出「${rareName(deck, 'immune')}」，「${trial}」被直接挡掉了。全场失算，没人得分`, 'gold');
        finishTurn(room);
        return;
      }
      return;
    }

    if (room.drama.kind === 'op') {
      if (choice === 'take') {
        const picked = [...new Set(cards || [])].filter((c) => me.hand.includes(c));
        if (picked.length !== 1) return socket.emit('toast', '要交出 1 张手牌来换');
        if (picked[0] === me.sealed) return socket.emit('toast', `「${me.sealed}」已被封存，动不了`);
        room.drama.choice = { type: 'take', cards: picked };
      } else if (choice === 'pass') {
        room.drama.choice = { type: 'pass' };
      } else {
        return;
      }
    } else if (choice === 'endure') {
      room.drama.choice = { type: 'endure' };
    } else if (choice === 'pawn') {
      const picked = [...new Set(cards || [])].filter((c) => me.hand.includes(c));
      if (me.hand.length < 2) return socket.emit('toast', '手牌不足2张，只能硬扛了');
      if (picked.length !== 2) return socket.emit('toast', '要选2张牌典当');
      if (picked.includes(me.sealed)) return socket.emit('toast', `「${me.sealed}」已被封存，动不了`);
      // 命运点名：关联品质在手（且没被封存）→ 典当必须包含它
      const rel = room.drama.rel;
      if (rel && me.hand.includes(rel) && me.sealed !== rel && !picked.includes(rel)) {
        return socket.emit('toast', `命运点名要「${rel}」：典当必须包含它（封存可免）`);
      }
      room.drama.choice = { type: 'pawn', cards: picked };
    } else {
      return;
    }
    say(room, `${me.name} 已经做出了选择，等大家猜完开牌`);
    maybeResolve(room);
  });

  socket.on('submitRedeem', ({ indices, useFree }) => {
    const room = myRoom;
    if (!room || room.state !== 'redeem' || me.redeemDone) return;
    const deck = DECKS[room.deckId];
    const cur = deck.currency;
    const curName = resName(deck, cur);
    const price = redeemPrice();
    const idxs = [...new Set((indices || []).map(Number))].filter((i) => me.pawned[i] && !me.pawned[i].redeemed && !me.pawned[i].dead);
    const free = !!useFree && me.rares.includes('freeRedeem') && idxs.length >= 1;
    const cost = Math.max(0, idxs.length - (free ? 1 : 0)) * price;
    if (idxs.length) {
      if (cost > me.res[cur]) return socket.emit('toast', `${curName}不够了`);
      me.res[cur] -= cost;
      if (free) me.rares = me.rares.filter((r) => r !== 'freeRedeem');
      const names = [];
      idxs.forEach((i) => { me.pawned[i].redeemed = true; me.hand.push(me.pawned[i].card); names.push(me.pawned[i].card); });
      say(room, `${me.name} ${free ? `打出「${rareName(deck, 'freeRedeem')}」，` : ''}花 ${cost} 点${curName}赎回了${names.map((c) => `「${c}」`).join('、')}`);
      ownerSay(room, { action: 'redeem', playerName: me.name, cards: names });
    }
    me.redeemDone = true;
    if (room.players.every((p) => p.redeemDone)) nextStageOrFinale(room);
    else sync(room);
  });

  socket.on('useSeal', ({ card }) => {
    const room = myRoom;
    if (!room || !me || !me.rares.includes('seal')) return;
    if (!me.hand.includes(card) || me.sealed) return;
    const deck = DECKS[room.deckId];
    me.sealed = card;
    me.rares = me.rares.filter((r) => r !== 'seal');
    say(room, `🔒 ${me.name} 打出「${rareName(deck, 'seal')}」，把「${card}」永远锁在了自己手里——谁也当不走它`, 'gold');
    sync(room);
  });

  socket.on('chat', ({ text }) => {
    const room = myRoom;
    if (!room || !me) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    say(room, text, '', 'player', me.name);
    // @老板 → 掌柜隔柜台搭腔（走全局队列，20秒限流，忙不过来就用兜底短语）
    if (/@(当铺老板|老板|掌柜)/.test(text)) {
      const now = Date.now();
      if (room.lastOwnerChat && now - room.lastOwnerChat < 20000) {
        deliverOwner(room, '一个一个来，柜台就我一个人。', 'annoyed');
        return;
      }
      room.lastOwnerChat = now;
      const deck = room.deckId ? DECKS[room.deckId] : null;
      const tableInfo = deck
        ? room.players.map((p) => `${p.name}(${deck.resources.map((r) => `${r.name}${p.res ? p.res[r.id] : '-'}`).join('/')},牌${p.hand.length})`).join('；')
        : '还没开局';
      ownerChat({
        playerName: me.name,
        question: text.replace(/@(当铺老板|老板|掌柜)/g, '').trim() || '（没说具体的话，就是喊了你一声）',
        deckName: deck ? deck.name : '未定',
        stageName: deck ? (deck.stages[room.stageIndex] || '开局前') : '开局前',
        tableInfo,
      }).then((line) => {
        if (rooms.get(room.code) !== room) return;
        deliverOwner(room, `${me.name}，${line}`, 'warm');
      });
    }
  });

  socket.on('react', ({ id, emoji }) => {
    if (!myRoom || !me) return;
    if (!REACT_EMOJIS.includes(emoji)) return;
    const msg = myRoom.log.find((m) => m.id === Number(id));
    if (!msg) return;
    const list = msg.reactions[emoji] || (msg.reactions[emoji] = []);
    const i = list.indexOf(me.name);
    if (i >= 0) list.splice(i, 1); else list.push(me.name);
    if (!list.length) delete msg.reactions[emoji];
    io.to(myRoom.code).emit('react', { id: msg.id, reactions: msg.reactions });
  });

  socket.on('disconnect', () => {
    if (!myRoom || !me) return;
    me.connected = false;
    if (myRoom.state === 'lobby') {
      myRoom.players = myRoom.players.filter((p) => p.id !== me.id);
      if (myRoom.hostId === me.id && myRoom.players.length) myRoom.hostId = myRoom.players[0].id;
      if (!myRoom.players.length) { rooms.delete(myRoom.code); return; }
      sync(myRoom);
      return;
    }
    say(myRoom, `${me.name} 掉线了（用同一昵称重进即可回来）`);
    // 掉线的人不再阻塞开牌
    if (myRoom.state === 'stage' && myRoom.drama) maybeResolve(myRoom);
    else sync(myRoom);
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log(`人生当铺：http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  同一WiFi：http://${ip}:${PORT}`));
});
