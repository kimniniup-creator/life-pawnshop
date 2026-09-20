// AI 层 v1.3 —— 省用量原则：
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
let biosQueue = Promise.resolve();
const GENDER_ASSUMPTION = /叔叔|阿姨|哥哥|姐姐|先生|女士|爸爸|妈妈|父亲|母亲|丈夫|妻子|老公|老婆|男朋友|女朋友|爷爷|奶奶|外公|外婆|儿子|女儿|男人|女人|男孩|女孩/;
function neutralizeBio(text) {
  return String(text)
    .replace(/(?:叫|喊)(?:了)?你(?:一声)?(?:叔叔|阿姨|哥哥|姐姐)/g, '问你是谁')
    .replace(/男朋友|女朋友|丈夫|妻子|老公|老婆/g, '伴侣')
    .replace(/爸爸|妈妈|父亲|母亲/g, '家长')
    .replace(/爷爷|奶奶|外公|外婆/g, '家中长辈')
    .replace(/儿子|女儿|男孩|女孩/g, '孩子')
    .replace(/叔叔|阿姨|先生|女士/g, '长辈')
    .replace(/哥哥|姐姐/g, '手足')
    .replace(/男人|女人/g, '人');
}
function rawAsk(prompt, timeoutMs, model) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const args = [
        '-p',
        '--safe-mode',
        '--no-session-persistence',
        '--model', model || 'fable',
      ];
      const env = { ...process.env };
      const localProxy = env.LP_PROXY || 'http://127.0.0.1:7897';
      env.HTTP_PROXY = env.HTTP_PROXY || env.http_proxy || localProxy;
      env.HTTPS_PROXY = env.HTTPS_PROXY || env.https_proxy || localProxy;
      env.ALL_PROXY = env.ALL_PROXY || env.all_proxy || localProxy;
      env.NO_PROXY = env.NO_PROXY || env.no_proxy || 'localhost,127.0.0.1,::1';
      const child = spawn(env.LP_CLAUDE_BIN || 'claude.exe', args, { windowsHide: true, env });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch (e) {}
        console.error(`[bios] Claude timed out after ${timeoutMs}ms`);
        finish(null);
      }, timeoutMs);
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => {
        clearTimeout(timer);
        console.error(`[bios] Claude failed to start: ${e.message}`);
        finish(null);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const text = out.trim();
        if (code !== 0 || !text) {
          console.error(`[bios] Claude exited ${code}: ${err.trim().slice(0, 500) || 'empty response'}`);
        }
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
  if (process.env.LP_NO_AI) return null;

  const mark = (c) => (deck.qualities.includes(c) ? `「${c}」` : `「${c}」(TA自己写上桌的)`);
  const lines = players.map((p) => {
    const e = endings[p.id] || {};
    const kept = p.hand.map(mark).join('、') || '无';
    const lost = p.pawned.filter((x) => !x.redeemed).map((x) => `${mark(x.card)}(失于${stages[x.stage]})`).join('、') || '无';
    const back = p.pawned.filter((x) => x.redeemed).map((x) => mark(x.card)).join('、') || '无';
    const traded = (p.traded || []).map((x) => `${mark(x.card)}(换了「${x.op}」)`).join('、') || '无';
    const timeline = (p.timeline || []).map((item) => {
      const when = item.stage >= 0 ? (stages[item.stage] || `第${item.stage + 1}阶段`) : '故事开始前';
      if (item.kind === 'rewrite') {
        const cards = (item.cards || []).map(mark).join('、') || '重要的东西';
        return `${when}：【命运已改写】原本可能发生“${item.event}”，但TA失去${cards}作为代价，原事件没有按原样发生。必须另写一个符合TA其余人生、保留同类压力与后果的新版本`;
      }
      if (item.kind === 'endure') {
        return `${when}：【真实发生】TA经历了“${item.event}”，并为此损耗了${item.resource}`;
      }
      if (item.kind === 'op-take') {
        return `${when}：【抓住机遇】TA失去${(item.cards || []).map(mark).join('、')}，让“${item.event}”真实改变了往后的人生`;
      }
      if (item.kind === 'op-pass') return `${when}：【放过机遇】“${item.event}”出现过，但TA没有走上那条路`;
      if (item.kind === 'averted') return `${when}：【事件被避开】“${item.event}”没有发生，不得写成真实经历`;
      if (item.kind === 'redeem') return `${when}：【后来找回】TA以新的方式重新拥有${(item.cards || []).map(mark).join('、')}；这不会让此前被改写的事件重新发生`;
      return `${when}：${item.text}`;
    }).join('；') || '无额外记录';
    const brokenLine = (p.broken || []).map((b) => {
      const r = deck.resources.find((x) => x.id === b.res);
      return r ? `${stages[b.stage]}时${r.name}崩了(${r.zero})` : '';
    }).filter(Boolean).join('；') || '无';
    const resources = deck.resources.map((r) => `${r.name}${p.res ? p.res[r.id] : 0}`).join('、');
    return `【${p.name}】结局：${e.title || '未知'}｜成就：${e.ach || '无'}｜结局形状：${e.profile || e.tier || 'mid'}｜叙事语气：${e.tier || 'mid'}
时间线——${timeline}
终局账本——一直握着的：${kept}｜永远失去的：${lost}｜失而复得的：${back}｜拿去换机遇的：${traded}｜硬受下的遭遇：${p.scars.map((s) => `「${s}」`).join('、') || '无'}｜崩局：${brokenLine}｜最终资源：${resources}｜猜中朋友：${p.guessRight || 0}次｜共鸣：${p.resonance || 0}`;
  }).join('\n\n');

  const prompt = `你是卡牌游戏《人生当铺》里的当铺老板：五十来岁，见过太多人把最珍视的东西放上柜台。游戏结束了，你要给每位玩家写一段"人生小传"（主题:${deckName}）。素材：

${lines}

写作要求（重要）：
1. **虚构一个具体的人生故事，禁止复述游戏操作**。不许出现"典当""赎回""牌""当铺""游戏""选择了"这类词。把素材化成真实人生的画面。
2. 严格沿时间线写，从${stages[0]}自然走到${stages[stages.length - 1]}。前一阶段的得失必须成为后一阶段的原因，写成一条有因果、有回响的人生，不要把素材逐项罗列。
3. 每人至少写三个有镜头感的具体场景：地点、动作、旧物或一句没说出口的话。允许合理补充职业、关系和生活细节，但不得违背账本。
4. 留住、失去、失而复得、硬扛和抓住/放过的机遇都要转化成故事里的真实事件；最终资源是晚年处境，不要直接报数字。
5. **严格区分“真实发生”和“命运已改写”**：硬扛的原事件确实发生过；典当所对应的原事件只是本来可能发生的命运，已经被代价换走，禁止把它原样写进小传。你必须依据TA失去与保留的品质、前后经历和主题，另写一个只属于这个玩家的替代版本：保留相近的人生压力和因果重量，但关键事实、场景与结果都不能照抄原事件。后来找回品质，只能写成TA以新的方式重新拥有它，不能让被改写的旧事件倒过来发生。
6. 好的和坏的都写；语气对齐结局档位：good=温暖有光，mid=悲欣交集，bad=克制的疼。不要鸡汤，不要强行圆满。
7. 每人切入角度、职业和关键关系都不同，句式不许雷同。每人320-480个汉字，第二人称"你"，分成3-4个短段落，最后一句是只属于TA的判词。
8. **不得替玩家假定性别、性别身份、称谓或伴侣性别**。素材没有提供这些信息。叙述玩家只能用“你”，关系角色使用“伴侣、爱人、家人、孩子、晚辈、长辈、同事、朋友”等中性词；禁止把玩家写成叔叔、阿姨、哥哥、姐姐、先生、女士、父亲、母亲、丈夫、妻子等身份。
只输出严格的JSON对象，键是玩家名，值是小传文本，不要markdown代码块，不要任何其他文字。`;

  const generate = async () => {
    const model = process.env.LP_CLAUDE_MODEL || 'fable';
    const timeoutMs = Number(process.env.LP_BIOS_TIMEOUT) || 150000;
    const text = await rawAsk(prompt, timeoutMs, model);
    if (text) {
      try {
        const cleaned = text.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
        const obj = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
        players.forEach((p) => {
          if (typeof obj[p.name] === 'string') obj[p.name] = neutralizeBio(obj[p.name]);
        });
        if (players.every((p) => typeof obj[p.name] === 'string' && obj[p.name].length >= 220 && !GENDER_ASSUMPTION.test(obj[p.name]))) return obj;
        console.error('[bios] Fable returned incomplete or gender-assumptive biographies');
      } catch (e) {
        console.error(`[bios] Invalid JSON from Fable: ${e.message}`);
      }
    }
    return null;
  };

  const queued = biosQueue.then(generate, generate);
  biosQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

module.exports = { ownerLine, ownerChat, writeBios, neutralizeBio };
