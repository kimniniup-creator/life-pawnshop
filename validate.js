// 卡组完整性自检：node validate.js
const { DECKS, EXCLUSIONS } = require('./decks');
let errors = [];
const allTrialTexts = new Set();

for (const deck of Object.values(DECKS)) {
  const resIds = deck.resources.map((r) => r.id);
  const qSet = new Set(deck.qualities);
  if (deck.qualities.length !== qSet.size) errors.push(`[${deck.name}] 品质牌有重复`);
  if (!resIds.includes(deck.currency)) errors.push(`[${deck.name}] currency 不在资源里`);
  if (!deck.endureLabel) errors.push(`[${deck.name}] 缺 endureLabel`);
  if (!deck.rares || deck.rares.length !== 5) errors.push(`[${deck.name}] 稀有牌不是5张`);
  const rareIds = new Set((deck.rares || []).map((r) => r.id));
  for (const need of ['redraw', 'immune', 'freeRedeem', 'boost', 'seal']) {
    if (!rareIds.has(need)) errors.push(`[${deck.name}] 缺稀有效果 ${need}`);
  }
  deck.resources.forEach((r) => { if (!r.zero) errors.push(`[${deck.name}] 资源 ${r.name} 缺归零文案`); });

  const seen = new Set();
  deck.trials.forEach((stagePool, si) => {
    const trials = stagePool.filter((x) => x.kind !== 'op');
    const ops = stagePool.filter((x) => x.kind === 'op');
    if (trials.length !== 8) errors.push(`[${deck.name}] 阶段${si + 1} 挫折牌 ${trials.length} 张（应为8）`);
    if (ops.length !== 2) errors.push(`[${deck.name}] 阶段${si + 1} 机遇牌 ${ops.length} 张（应为2）`);
    for (const c of stagePool) {
      if (!c.t) { errors.push(`[${deck.name}] 阶段${si + 1} 有空文案`); continue; }
      if (seen.has(c.t)) errors.push(`[${deck.name}] 重复卡牌：${c.t}`);
      seen.add(c.t);
      allTrialTexts.add(c.t);
      if (c.kind === 'op') {
        if (!resIds.includes(c.gain)) errors.push(`[${deck.name}] 机遇「${c.t}」gain 非法：${c.gain}`);
        if (!c.s) errors.push(`[${deck.name}] 机遇「${c.t}」缺说明`);
      } else {
        if (!resIds.includes(c.cost)) errors.push(`[${deck.name}] 挫折「${c.t}」cost 非法：${c.cost}`);
        if (!c.rel) errors.push(`[${deck.name}] 挫折「${c.t}」缺关联品质 rel`);
        else if (!qSet.has(c.rel)) errors.push(`[${deck.name}] 挫折「${c.t}」的 rel「${c.rel}」不在品质池里`);
      }
    }
  });

  // 关联覆盖统计：哪些品质从没被任何挫折引用（信息，不算错误）
  const used = new Set(deck.trials.flat().filter((x) => x.rel).map((x) => x.rel));
  const unused = deck.qualities.filter((q) => !used.has(q));
  console.log(`[${deck.name}] 品质${deck.qualities.length} 挫折${deck.trials.flat().filter(x=>x.kind!=='op').length} 机遇${deck.trials.flat().filter(x=>x.kind==='op').length} 稀有${deck.rares.length}；被联动引用的品质 ${used.size} 个，未被引用：${unused.join('、') || '无'}`);
}

// 矛盾表校验：key 和 value 必须是同一副卡组里的真实挫折文案
for (const [k, vals] of Object.entries(EXCLUSIONS)) {
  const homeDeck = Object.values(DECKS).find((d) => d.trials.flat().some((x) => x.t === k));
  if (!homeDeck) { errors.push(`矛盾表 key 不存在：${k}`); continue; }
  for (const v of vals) {
    if (!homeDeck.trials.flat().some((x) => x.t === v)) {
      errors.push(`矛盾表「${k}」的排除项「${v}」不在同一卡组（${homeDeck.name}）里`);
    }
  }
}

if (errors.length) {
  console.error('\n❌ 发现问题：');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
} else {
  console.log('\n✅ 全部通过');
}
