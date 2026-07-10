// 两个陪玩机器人(企鹅/好了)加入指定房间,拟人节奏
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const CODE = process.argv[2];
if (!CODE) { console.error('用法: node bots-join.js <房间号>'); process.exit(1); }
const names = ['企鹅', '好了'];

function human(fn) { setTimeout(fn, 1200 + Math.random() * 2200); }

function bot(name) {
  const s = io(URL);
  const st = { id: null, acted: {} };
  s.on('connect', () => {
    s.emit('join', { code: CODE, name }, (res) => {
      if (res.error) return console.error(`[${name}] join失败`, res.error);
      st.id = res.playerId;
      console.log(`[${name}] 进房`);
    });
  });
  s.on('state', (S) => {
    const me = S.players.find((p) => p.id === st.id);
    if (!me) return;
    const key = S.state + ':' + S.stageIndex + ':' + S.turnIndex + ':' + (S.auction ? S.auction.index : '') + ':' + (S.drama ? S.drama.phase + S.drama.card : '');

    if (S.state === 'pick' && !me.picked && !st.acted['pick']) {
      st.acted['pick'] = true;
      const cards = S.deck.qualities.slice().sort(() => Math.random() - 0.5).slice(0, 7);
      human(() => s.emit('submitPick', { cards }));
    }
    if (S.state === 'auction' && S.auction && !S.auction.submitted.includes(st.id) && !st.acted['bid' + S.auction.index]) {
      st.acted['bid' + S.auction.index] = true;
      human(() => s.emit('submitBid', { bid: Math.floor(Math.random() * 18) }));
    }
    if (S.state === 'stage' && S.drama) {
      const isOp = S.drama.kind === 'op';
      if (S.drama.playerId !== st.id && !S.drama.guessed.includes(st.id) && !st.acted['g' + key]) {
        st.acted['g' + key] = true;
        const g = isOp ? (Math.random() < 0.5 ? 'take' : 'pass') : (Math.random() < 0.5 ? 'endure' : 'pawn');
        human(() => s.emit('submitGuess', { guess: g }));
      }
      if (S.drama.playerId === st.id && !S.drama.chosen && !st.acted['c' + key]) {
        st.acted['c' + key] = true;
        human(() => {
          if (isOp) {
            if (me.hand.length >= 1 && Math.random() < 0.6) s.emit('resolveChoice', { choice: 'take', cards: me.hand.slice(0, 1) });
            else s.emit('resolveChoice', { choice: 'pass' });
          } else if (me.hand.length >= 2 && Math.random() < 0.6) {
            s.emit('resolveChoice', { choice: 'pawn', cards: me.hand.slice(0, 2) });
          } else {
            s.emit('resolveChoice', { choice: 'endure' });
          }
        });
      }
    }
    if (S.state === 'redeem' && !me.redeemDone && !st.acted['r' + S.stageIndex]) {
      st.acted['r' + S.stageIndex] = true;
      const idx = me.pawned.map((x, i) => ({ x, i })).filter(({ x }) => !x.redeemed && !x.dead).map(({ i }) => i);
      const pick = idx.slice(0, 1).filter(() => me.res && S.deck && me.res[S.deck.currency] >= (S.redeemPrice || 999) && Math.random() < 0.5);
      human(() => s.emit('submitRedeem', { indices: pick }));
    }
  });
}

bot(names[0]);
setTimeout(() => bot(names[1]), 700);
setTimeout(() => process.exit(0), 900000);
