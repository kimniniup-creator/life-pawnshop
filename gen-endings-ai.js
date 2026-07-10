// 用 Pollinations(Flux, 免密钥) 生成 9 种结局 × 2 变体 = 18 张海报 → public/endings/
// node gen-endings-ai.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'public', 'endings');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'detailed cozy pixel art, 16-bit JRPG scene, oriental East-Asian pawnshop aesthetic, warm lantern glow, cinematic atmospheric lighting, rich shading, no text, no words, no letters, no watermark, no signature';

const SCENES = {
  'life-good':   'an elderly person standing before a glowing open wooden door with warm golden light spilling onto the ground, silhouettes of a lifetime of belongings, deep starry blue night sky, hopeful and warm, deep blue and amber palette',
  'life-mid':    'a middle-aged person sitting alone by a window at night, a half-cup of tea on the wooden table, distant city lights outside, calm bittersweet mood, deep blue and soft amber palette',
  'life-bad':    'a dim empty old room, a single empty wooden chair, a faded family photo on the cracked wall, cold desolate and sparse, muted dark blue-grey palette',
  'love-good':   'two white-haired elderly people seen from behind holding hands under a warm rosy sunset, tender and complete, glowing pink and gold palette',
  'love-mid':    'two figures in a dim warm kitchen at night each quietly doing their own chores, plain domestic tenderness, muted rose and candlelight palette',
  'love-bad':    'a rainy night street, one lone person under an umbrella with an empty space beside them, restrained quiet sorrow, cold rose-grey and blue palette',
  'founder-good':'a lone figure standing on a rooftop height overlooking a vast city of glittering lights like a sea of stars, triumphant yet serene, gold and teal night palette',
  'founder-mid': 'a single lit window in a dark office tower late at night, one person at a desk facing a glowing screen, tired but still holding on, amber and dark teal palette',
  'founder-bad': 'a dark empty office after the lights went out, cardboard boxes on the floor, an unplugged power cord, the back of the last person turning off the light, cold copper and shadow palette',
};

const jobs = [];
for (const [key, scene] of Object.entries(SCENES)) {
  for (const v of [1, 2]) jobs.push({ file: `${key}-${v}.png`, prompt: `${scene}, ${STYLE}`, seed: v === 1 ? 7 : 42 });
}

function gen(job) {
  return new Promise((resolve) => {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(job.prompt)}?width=900&height=1200&model=flux&seed=${job.seed}&nologo=true`;
    const req = https.get(url, (r) => {
      if (r.statusCode !== 200) { r.resume(); return resolve({ ok: false, code: r.statusCode }); }
      const chunks = [];
      r.on('data', (d) => chunks.push(d));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 5000) return resolve({ ok: false, code: 'tiny' });
        fs.writeFileSync(path.join(OUT, job.file), buf);
        resolve({ ok: true, kb: Math.round(buf.length / 1024) });
      });
    });
    req.on('error', (e) => resolve({ ok: false, code: e.message }));
    req.setTimeout(120000, () => { req.destroy(); resolve({ ok: false, code: 'timeout' }); });
  });
}

(async () => {
  for (const job of jobs) {
    let res, tries = 0;
    do { if (tries) await new Promise((r) => setTimeout(r, 3000)); res = await gen(job); tries++; }
    while (!res.ok && tries < 3);
    console.log(`${res.ok ? '✓' : '✗'} ${job.file} ${res.ok ? res.kb + 'KB' : res.code}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('done');
})();
