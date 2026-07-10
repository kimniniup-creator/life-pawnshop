// AI 层 v1.2 —— 省用量原则：
//   唯一走大模型的：终局人生小传 writeBios（串行队列，最多重试1次）
//   老板点评 ownerLine / @老板搭腔 ownerChat：全部预制文案+模板插值，零调用零延迟
//   机器人测试时设 LP_NO_AI=1 可连小传也不调用
const { spawn } = require('child_process');

// ── 预制台词库（{trial}=挫折文案 {card}=牌 {cards}=多张牌 {player}=玩家名）──
const LINES = {
  pawn: [
    '「{trial}」这道坎，收你{cards}——这买卖我见得多了，不亏，走吧。',
    '{cards}就这么放我柜上了？行，我给你开张当票，别弄丢。',
    '上一个为「{trial}」当东西的人，也坐在你这个位置。TA没回来赎。',
    '拿{cards}换一夜好睡，你们年轻人的账，越算越看不懂。',
    '收了。当票只保两个窗口，过期死当，别怪我没提醒。',
    '{cards}……啧，这种东西一进我这门，十个里九个再也不出去。',
    '为「{trial}」舍得下这个本，你比看上去狠。',
    '眼都没眨一下。当得干脆的人，赎的时候哭得最凶。',
  ],
  endure: [
    '「{trial}」都能自己咽下去？你比看上去能扛。',
    '不当东西硬受着——省的是牌，费的是命，自己掂量。',
    '我见过太多硬撑的人，最后都是在我这儿一次当空的。',
    '牙一咬就过去了？行，疤留你自己身上，我这儿不收疤。',
    '这道坎你自己受了。以后夜里疼的时候，别怪没人提醒过你。',
    '骨头硬是好事，就怕命没有骨头硬。',
  ],
  redeem: [
    '「{card}」我给你擦干净了，它在这儿等你很久了。',
    '哟，真有人回来赎「{card}」？今天太阳打西边出来了。',
    '赎回去吧。记住这次的价，下次当之前先想三秒。',
    '「{card}」出柜喽——能把东西赎回去的人，日子都不会太差。',
    '失而复得比一直拥有金贵，你懂这个理，不枉来我这一趟。',
  ],
  take: [
    '拿「{card}」换个机会，赌性不小。机会这东西，从来不等犹豫的人。',
    '「{card}」换明天——会做生意。就是别回头。',
    '换了就别惦记。我这行的人都知道：惦记是最贵的利息。',
    '好眼力。不过记住，用「{card}」换来的东西，得配得上它。',
  ],
  pass: [
    '就这么放过去了？有些机会一辈子只敲一次门。',
    '不换就不换吧，守得住的人也有守得住的福气。',
    '你手里那几张牌，比机会还烫手是吧？我懂。',
  ],
};

// @老板 搭腔：关键词路由 + 兜底
const CHAT_ROUTES = [
  { re: /(规则|怎么玩|啥意思|什么意思|看不懂)/, lines: [
    '规则都贴在墙上（右下角那个问号），我只管收当放赎。',
    '三句话：珍视的能当，当了能赎，过期死当。剩下的自己悟。',
  ] },
  { re: /(赎|当票|死当)/, lines: [
    '当票只保两个窗口，过期死当。我这儿的规矩比人心可靠。',
    '想赎就趁早，柜上的灰不等人。',
  ] },
  { re: /(你是谁|老板.{0,4}(是|叫)|多大|哪里人|开多久)/, lines: [
    '这条街上开了三十年铺子，见过的舍不得，比你吃过的饭都多。',
    '一个看东西比看人准的生意人。',
  ] },
  { re: /(值多少|多少钱|贵不贵|价)/, lines: [
    '东西值多少不看牌面，看你半夜想不想它。',
    '我出的价从来公道——公道得让人心碎。',
  ] },
  { re: /(帮|怎么办|选哪|建议)/, lines: [
    '我只管柜台，不管人生。不过——舍不得的，往往才是该留的。',
    '问我？我要是会选，就不会在这儿守一辈子柜台了。',
  ] },
  { re: /(你好|在吗|哈喽|hi|hello)/i, lines: [
    '嗯，柜台就我一个，说事。',
    '在。东西带了吗？',
  ] },
];
const CHAT_DEFAULT = [
  '少打听，多做事。你的牌自己心里没数吗？',
  '我这儿只管收当放赎，不管排忧解难。',
  '这话你该问自己，不该问一个当铺老板。',
  '柜台后面忙着呢，回头再聊。',
  '嗯。（拨了两下算盘，没抬头）',
];

const lastUsed = {};
function pickFrom(pool, key) {
  let line;
  let guard = 0;
  do { line = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && line === lastUsed[key] && ++guard < 5);
  lastUsed[key] = line;
  return line;
}
function fill(tpl, ctx) {
  return tpl
    .replace(/\{trial\}/g, ctx.trial || '这道坎')
    .replace(/\{cards\}/g, (ctx.cards || []).map((c) => `「${c}」`).join('和') || '这东西')
    .replace(/\{card\}/g, (ctx.cards || [])[0] || '这东西')
    .replace(/\{player\}/g, ctx.playerName || '客人');
}

// 老板点评：纯预制，零调用
async function ownerLine(ctx) {
  const pool = LINES[ctx.action] || LINES.endure;
  return fill(pickFrom(pool, ctx.action), ctx);
}

// @老板 搭腔：纯预制，关键词路由
async function ownerChat(ctx) {
  const q = ctx.question || '';
  for (const r of CHAT_ROUTES) {
    if (r.re.test(q)) return pickFrom(r.lines, r.re.source);
  }
  return pickFrom(CHAT_DEFAULT, 'chatDefault');
}

// ── 唯一的模型调用：终局人生小传（串行，防并发） ──
let biosRunning = false;
function rawAsk(prompt, timeoutMs, model) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const args = ['-p', '--model', model || 'claude-sonnet-5'];
      const env = { ...process.env };
      const localProxy = env.LP_PROXY || 'http://127.0.0.1:7897';
      env.HTTP_PROXY = env.HTTP_PROXY || env.http_proxy || localProxy;
      env.HTTPS_PROXY = env.HTTPS_PROXY || env.https_proxy || localProxy;
      env.ALL_PROXY = env.ALL_PROXY || env.all_proxy || localProxy;
      env.NO_PROXY = env.NO_PROXY || env.no_proxy || 'localhost,127.0.0.1,::1';
      const child = spawn('claude', args, { shell: true, windowsHide: true, env });
      let out = '';
      const timer = setTimeout(() => { try { child.kill(); } catch (e) {} finish(null); }, timeoutMs);
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.on('error', () => { clearTimeout(timer); finish(null); });
      child.on('close', () => {
        clearTimeout(timer);
        const text = out.trim();
        finish(text.length > 0 ? text : null);
      });
      child.stdin.write(prompt, 'utf8');
      child.stdin.end();
    } catch (e) {
      finish(null);
    }
  });
}

async function writeBios(deck, players, endings) {
  const deckName = deck.name;
  const stages = deck.stages;
  const fallback = () => {
    const bios = {};
    for (const p of players) {
      const e = endings[p.id] || {};
      const kept = p.hand.slice(0, 3).map((c) => `「${c}」`).join('、');
      bios[p.name] = `${e.line || ''}${kept ? `走到最后，${kept}还握在你手里。` : '走到最后，你两手空空，但你走完了。'}${e.title ? `这一局，你的结局叫「${e.title}」。` : ''}`;
    }
    return bios;
  };
  if (process.env.LP_NO_AI) return fallback();

  const mark = (c) => (deck.qualities.includes(c) ? `「${c}」` : `「${c}」(TA自己写上桌的)`);
  const lines = players.map((p) => {
    const e = endings[p.id] || {};
    const kept = p.hand.map(mark).join('、') || '无';
    const lost = p.pawned.filter((x) => !x.redeemed).map((x) => `${mark(x.card)}(失于${stages[x.stage]})`).join('、') || '无';
    const back = p.pawned.filter((x) => x.redeemed).map((x) => mark(x.card)).join('、') || '无';
    const traded = (p.traded || []).map((x) => `${mark(x.card)}(换了「${x.op}」)`).join('、') || '无';
    const brokenLine = (p.broken || []).map((b) => {
      const r = deck.resources.find((x) => x.id === b.res);
      return r ? `${stages[b.stage]}时${r.name}崩了(${r.zero})` : '';
    }).filter(Boolean).join('；') || '无';
    return `【${p.name}】结局档位：${e.title || '未知'}（${e.tier || 'mid'}）
素材——一直握着的：${kept}｜永远失去的：${lost}｜失而复得的：${back}｜拿去换机遇的：${traded}｜硬受下的遭遇：${p.scars.map((s) => `「${s}」`).join('、') || '无'}｜崩局：${brokenLine}`;
  }).join('\n\n');

  const prompt = `你是卡牌游戏《人生当铺》里的当铺老板：五十来岁，见过太多人把最珍视的东西放上柜台。游戏结束了，你要给每位玩家写一段"人生小传"（主题:${deckName}）。素材：

${lines}

写作要求（重要）：
1. **虚构一个具体的人生故事，禁止复述游戏操作**。不许出现"典当""赎回""牌""当铺""游戏""选择了"这类词。把素材化成真实人生的画面。
2. 给每个人一两个有镜头感的细节场景（一个下午、一件旧物、一句没说出口的话）。
3. 时间感完整：从${stages[0]}走到${stages[stages.length - 1]}，像一部微缩传记。
4. 好的和坏的都写；语气对齐结局档位：good=温暖有光，mid=悲欣交集，bad=克制的疼。
5. 每人切入角度不同，句式不许雷同。每人130-180字，第二人称"你"，最后一句是只属于TA的判词。
只输出严格的JSON对象，键是玩家名，值是小传文本，不要markdown代码块，不要任何其他文字。`;

  if (biosRunning) return fallback(); // 同一时刻只允许一份小传在生成
  biosRunning = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await rawAsk(prompt, 100000, 'claude-sonnet-5');
      if (text) {
        try {
          const cleaned = text.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
          const obj = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
          if (players.every((p) => typeof obj[p.name] === 'string' && obj[p.name].length > 0)) return obj;
        } catch (e) { /* retry */ }
      }
    }
  } finally {
    biosRunning = false;
  }
  return fallback();
}

module.exports = { ownerLine, ownerChat, writeBios };
