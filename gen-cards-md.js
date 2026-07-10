// 从 decks.js 生成 cards.md：node gen-cards-md.js
const fs = require('fs');
const { DECKS, EXCLUSIONS } = require('./decks');

let md = `# 人生当铺 · 全部卡牌 v1.1（本文件由 gen-cards-md.js 自动生成，与游戏内容严格一致）

## 通用规则速览
- 三项资源各 **60**：硬扛扣"最相关"的一项（基础 10+5×阶段，**关联品质在手 −5 / 不在手 +5**），扣到 0 当场崩局
- **命运点名**：挫折的关联品质在你手里时，选择典当就必须交出它（被「封存」锁住的可免——这是封存牌的核心用途）
- 拍卖/赎回用"货币"资源；赎回固定 15/张，**当票只保 2 个窗口，过期死当**
- 每阶段牌池：8 挫折 + 2 机遇（交 1 张手牌换 +25 资源；**换出去的牌永久失去，不可赎回**）
- 稀有牌每模块 5 张，**每局随机放出 3 张**暗拍（至少出 1 才算参拍）
- 老板台词在开牌后统一放出，不会提前剧透；聊天室 @老板 他会搭腔（20 秒限一次）
`;

for (const deck of Object.values(DECKS)) {
  const rn = (id) => deck.resources.find((r) => r.id === id).name;
  md += `\n---\n\n# ${deck.name} · ${deck.tagline}\n`;
  md += `\n**资源**：${deck.resources.map((r) => `${r.name}（归零：${r.zero}）`).join('｜')}\n`;
  md += `\n**货币**：${rn(deck.currency)}　**"自己受着"叫**：${deck.endureLabel}\n`;
  md += `\n## 稀有牌（每局随机拍 3 张）\n\n| 牌名 | 效果 |\n|---|---|\n`;
  deck.rares.forEach((r) => { md += `| ${r.name} | ${r.desc} |\n`; });
  md += `\n## 品质牌（${deck.qualities.length} 张，选 7，最多自写 2）\n\n`;
  if (deck.id === 'love') {
    md += `**我拥有的**：${deck.qualities.filter((q) => !q.startsWith('TA·')).join(' / ')}\n\n`;
    md += `**我希望TA拥有的**：${deck.qualities.filter((q) => q.startsWith('TA·')).join(' / ')}\n`;
  } else {
    md += deck.qualities.join(' / ') + '\n';
  }
  const used = new Set(deck.trials.flat().filter((x) => x.rel).map((x) => x.rel));
  const pure = deck.qualities.filter((q) => !used.has(q));
  if (pure.length) md += `\n> 纯珍视牌（无联动，选它纯粹因为你是这样的人）：${pure.join('、')}\n`;
  md += `\n## 阶段牌表\n`;
  deck.trials.forEach((pool, si) => {
    md += `\n### ${deck.stages[si]}\n\n| 牌 | 类型 | 硬扛扣/机遇得 | 关联品质 | 备注 |\n|---|---|---|---|---|\n`;
    pool.forEach((c) => {
      if (c.kind === 'op') md += `| ${c.t} | ✨机遇 | ${rn(c.gain)} +25 | — | ${c.s || ''} |\n`;
      else md += `| ${c.t} | 挫折 | ${rn(c.cost)} | ${c.rel} | ${c.s || ''} |\n`;
    });
  });
}

md += `\n---\n\n## 前后矛盾保护\n\n`;
for (const [k, v] of Object.entries(EXCLUSIONS)) {
  if (v.length) md += `- 抽过「${k}」的人，不会再抽到：${v.map((x) => `「${x}」`).join('、')}\n`;
}
md += `\n完整性校验：\`node validate.js\`（关联存在性/资源合法性/数量/排重/矛盾表跨模块，全绿才可上线）\n`;

fs.writeFileSync('cards.md', md);
console.log('cards.md generated,', md.length, 'chars');
