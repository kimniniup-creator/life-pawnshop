// 三个机器人跑完整一局，验证全流程
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const names = ['阿芒', 'Kim', '狸花猫'];
let finished = false;

function bot(name, isHost) {
  const s = io(URL);
  const st = { id: null, code: null, acted: {} };

  s.on('connect', () => {
    if (isHost) {
      s.emit('create', { name }, (res) => {
        if (res.error) return console.error('create失败', res.error);
        st.id = res.playerId; st.code = res.code;
        console.log(`[${name}] 建房 ${res.code}`);
        global.roomCode = res.code;
      });
    } else {
      const tryJoin = () => {
        if (!global.roomCode) return setTimeout(tryJoin, 200);
        s.emit('join', { code: global.roomCode, name }, (res) => {
          if (res.error) return console.error('join失败', res.error);
          st.id = res.playerId;
          console.log(`[${name}] 进房`);
        });
      };
      tryJoin();
    }
  });

  s.on('logline', (l) => { if (isHost) console.log('  📜', l.text); });
  s.on('bios', (b) => {
    if (isHost) {
      console.log('\n===== 掌柜手记 =====');
      for (const [k, v] of Object.entries(b)) console.log(`【${k}】${v}\n`);
      finished = true;
      setTimeout(() => process.exit(0), 500);
    }
  });

  s.on('state', (S) => {
    const me = S.players.find((p) => p.id === st.id);
    if (!me) return;
    const key = S.state + ':' + S.stageIndex + ':' + S.turnIndex + ':' + (S.auction ? S.auction.index : '') + ':' + (S.drama ? S.drama.phase + S.drama.card : '');

    if (S.state === 'lobby' && isHost && S.players.length === 3 && !st.acted.start) {
      st.acted.start = true;
      s.emit('selectDeck', { deckId: 'founder' });
      setTimeout(() => s.emit('startGame'), 300);
    }
    if (S.state === 'pick' && !me.picked && !st.acted['pick']) {
      st.acted['pick'] = true;
      const cards = S.deck.qualities.slice().sort(() => Math.random() - 0.5).slice(0, 7);
      setTimeout(() => s.emit('submitPick', { cards }), 200);
    }
    if (S.state === 'auction' && S.auction && !S.auction.submitted.includes(st.id) && !st.acted['bid' + S.auction.index]) {
      st.acted['bid' + S.auction.index] = true;
      setTimeout(() => s.emit('submitBid', { bid: Math.floor(Math.random() * 20) }), 200);
    }
    if (S.state === 'stage' && S.drama) {
      const isOp = S.drama.kind === 'op';
      if (S.drama.playerId !== st.id && !S.drama.guessed.includes(st.id) && !st.acted['g' + key]) {
        st.acted['g' + key] = true;
        const g = isOp ? (Math.random() < 0.5 ? 'take' : 'pass') : (Math.random() < 0.5 ? 'endure' : 'pawn');
        setTimeout(() => s.emit('submitGuess', { guess: g }), 150);
      }
      if (S.drama.playerId === st.id && !S.drama.chosen && !st.acted['c' + key]) {
        st.acted['c' + key] = true;
        setTimeout(() => {
          if (isOp) {
            if (me.hand.length >= 1 && Math.random() < 0.6) s.emit('resolveChoice', { choice: 'take', cards: me.hand.slice(0, 1) });
            else s.emit('resolveChoice', { choice: 'pass' });
          } else if (me.hand.length >= 2 && Math.random() < 0.6) {
            // 命运点名：关联品质在手就必须包含
            let cards;
            const rel = S.drama.rel;
            if (rel && me.hand.includes(rel) && me.sealed !== rel) {
              cards = [rel, me.hand.find((c) => c !== rel)];
            } else {
              cards = me.hand.filter((c) => c !== me.sealed).slice(0, 2);
            }
            if (cards.length === 2) s.emit('resolveChoice', { choice: 'pawn', cards });
            else s.emit('resolveChoice', { choice: 'endure' });
          } else {
            s.emit('resolveChoice', { choice: 'endure' });
          }
        }, 150);
      }
    }
    if (S.state === 'redeem' && !me.redeemDone && !st.acted['r' + S.stageIndex]) {
      st.acted['r' + S.stageIndex] = true;
      const idx = me.pawned.map((x, i) => ({ x, i })).filter(({ x }) => !x.redeemed).map(({ i }) => i);
      const affordable = idx.slice(0, 1).filter(() => me.res && S.deck && me.res[S.deck.currency] >= (S.redeemPrice || 999) && Math.random() < 0.4);
      setTimeout(() => s.emit('submitRedeem', { indices: affordable }), 150);
    }
  });
}

bot(names[0], true);
setTimeout(() => bot(names[1], false), 500);
setTimeout(() => bot(names[2], false), 800);
setTimeout(() => { if (!finished) { console.error('❌ 240秒没跑完，卡住了'); process.exit(1); } }, 240000);
