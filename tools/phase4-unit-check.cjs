/** Phase 4 unit checks — light shafts, scene caps, washes, chapter accent. */
const ts = require('typescript');
const fs = require('fs');

function transpile(rel) {
  return ts.transpileModule(fs.readFileSync(rel, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const easingMod = {
  clamp01: (x) => Math.min(1, Math.max(0, x)),
  clamp: (a, b, c) => Math.min(c, Math.max(b, a)),
  hash01: (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); },
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  drift: () => 0,
};
const themeMod = {
  PALETTE: {
    goldDisplay: '#C9A227', goldDeep: '#8F6E12', shadow: '#2A3138', ink: '#22201C',
    up: '#2E7D6B', down: '#B5533C', upVivid: '#2FA48C', downVivid: '#D96A4A',
    gold: '#C9A227', grid: '#D8D2C2', upSoft: '#E2EFEA', downSoft: '#F6E7DC', goldWash: '#F4ECD2',
  },
  rgba: (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`,
  glowBlob: (ctx, x, y, r, color, strength) => { (ctx.__glows ||= []).push({ x, y, r, color, strength }); },
  hexLerp: (a) => a, paintBg: () => {}, scenePlate: () => {},
  card: () => {}, roundRect: () => {}, setFont: () => {}, chip: () => {}, chipWidth: () => 40,
  FONT_DISPLAY: 'F', FONT_UI: 'I',
};

// effects.ts (with lightRays + chapterAccent)
const effectsMod = { exports: {} };
new Function('exports', 'require', 'module', transpile('src/lib/engine/effects.ts'))(
  effectsMod.exports,
  (n) => (n.endsWith('easing') ? easingMod : n.endsWith('theme') ? themeMod : n.endsWith('perception') ? { AMP: {}, K3D: { depthFrac: 0.4, axisDeg: 30 } } : {}),
  effectsMod
);
effectsMod.exports.camState.dx = 0; effectsMod.exports.camState.dy = 0; effectsMod.exports.camState.scale = 1;

let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!cond) fails++;
};

// ── lightRays: scene-relative + host-cross darkening ──
const mkCtx = () => {
  const ops = [];
  return {
    ops,
    save: () => ops.push('save'), restore: () => ops.push('restore'),
    globalCompositeOperation: '', translate: (x, y) => ops.push(`t${x.toFixed(0)}_${y.toFixed(0)}`),
    rotate: () => ops.push('rot'),
    createLinearGradient: (x0, y0, x1, y1) => ({
      addColorStop: (o, c) => { (ops.gradient ||= []).push(o); void c; },
    }),
    fillStyle: '', beginPath: () => ops.push('begin'), moveTo: () => {}, lineTo: () => {},
    closePath: () => {}, fill: () => ops.push('fill'),
    rect: (x, y, w, h) => ops.push(`rect ${x.toFixed(0)} ${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`),
    arc: () => {}, stroke: () => {},
    // the darkening plate signals with a fill carrying gradient + rect
    __glows: undefined,
  };
};

// no host: no darkening plate (no rect op)
{
  const c = mkCtx();
  effectsMod.exports.lightRays(c, 1920, 1080, 5000, { alpha: 0.6, x: 1300 });
  check('lightRays: no hostX → no shadow plate', !c.ops.some((o) => typeof o === 'string' && o.startsWith('rect')), c.ops.filter((o) => typeof o === 'string' && o.startsWith('rect')).join(';'));
}
// host crossing: the plate paints (rect op present)
{
  const c = mkCtx();
  effectsMod.exports.lightRays(c, 1920, 1080, 5000, { alpha: 0.6, x: 1300, hostX: 1300, hostR: 170 });
  check('lightRays: host crossing → shadow plate paints', c.ops.some((o) => typeof o === 'string' && o.startsWith('rect')));
}
// host far away: no plate
{
  const c = mkCtx();
  effectsMod.exports.lightRays(c, 1920, 1080, 5000, { alpha: 0.6, x: 1300, hostX: 200, hostR: 170 });
  check('lightRays: host far → no shadow plate', !c.ops.some((o) => typeof o === 'string' && o.startsWith('rect')));
}

// ── chapterAccent: per-tone object ──
{
  const c = mkCtx();
  effectsMod.exports.chapterAccent(c, 1920, 1080, 1000, 'down');
  check('chapterAccent(down): gauge (arc+needle strokes)', c.ops.some((o) => o === 'begin'));
}
{
  const fills = [];
  const proxy = { ...mkCtx(), fillRect: (x, y, w, h) => fills.push([x, y, w, h]) };
  effectsMod.exports.chapterAccent(proxy, 1920, 1080, 1000, 'up');
  check('chapterAccent(up): racks (3 fillRect bars)', fills.length === 3, `${fills.length} bars`);
}

// ── washes: the 15-20% band (source-truth probe on theme.ts) ──
{
  const src = fs.readFileSync('src/lib/engine/theme.ts', 'utf8');
  const seg = src.slice(src.indexOf('const strength ='), src.indexOf('glowBlob(ctx, W * 0.82'));
  const nums = [...seg.matchAll(/\? 0(\.\d+)|: 0(\.\d+)/g)].map((m) => parseFloat(m[0].replace(/[?:] /, '')));
  check('paintBg wash strengths = 15-20% band', nums.length === 4 && nums.every((n) => n >= 0.145 && n <= 0.205), nums.join('/'));
}

// ── scene caps: the packing math (replicated) ──
{
  const mkTl = (beats) => ({
    beats: beats.map((b) => ({
      startMs: b[0], endMs: b[1],
      beat: { scene: { sceneKey: b[2] } },
      sentences: (b[3] || []).map((sm) => ({ startMs: sm })),
    })),
  });
  const pack = (tl) => {
    const CAP = 12000;
    const groups = [];
    let i = 0;
    while (i < tl.beats.length) {
      const key = tl.beats[i].beat.scene.sceneKey;
      let end = i;
      while (end + 1 < tl.beats.length && tl.beats[end + 1].beat.scene.sceneKey === key) end++;
      const seams = [];
      for (let b = i; b <= end; b++) {
        const beat = tl.beats[b];
        seams.push(beat.startMs);
        if (beat.endMs - beat.startMs > CAP) {
          for (const s of beat.sentences.slice(1)) seams.push(s.startMs);
        }
      }
      const runStart = seams[0];
      const runEnd = tl.beats[end].endMs;
      let gFrom = runStart;
      while (gFrom < runEnd) {
        let gTo = gFrom;
        for (let si = 0; si < seams.length; si++) {
          const cand = seams[si];
          if (cand > gFrom && cand - gFrom <= CAP) gTo = cand;
        }
        if (runEnd - gFrom <= CAP) gTo = runEnd;
        if (gTo <= gFrom) gTo = runEnd;
        groups.push({ s: gFrom, e: gTo });
        gFrom = gTo;
      }
      i = end + 1;
    }
    return groups;
  };
  // 30s host run of 3 beats → split at beats: 0-12s, 12-24s, 24-30s
  let g = pack(mkTl([[0, 10000, 'host'], [10000, 20000, 'host'], [20000, 30000, 'host']]));
  check('cap: 30s run splits at beat seams ≤12s', g.length === 3 && g.every((x) => x.e - x.s <= 12000), g.map((x) => `${x.s}-${x.e}`).join(' '));
  // single 24s beat with sentences at 0/9/18 → seams at 9k & 18k: [0,9] [9,18] [18,24]
  g = pack(mkTl([[0, 24000, 'host', [0, 9000, 18000]]]));
  check('cap: long beat splits at sentence seams', g.length === 3 && g[0].e === 9000 && g[1].e === 18000, g.map((x) => `${x.s}-${x.e}`).join(' '));
  // 15s beat with sentences at 0/4s: splits [0-4] + [4-15] (11s ≤ cap)
  g = pack(mkTl([[0, 15000, 'host', [0, 4000]]]));
  check('cap: 15s beat splits at its inner sentence seam', g.length === 2 && g[0].e === 4000 && g[1].e - g[1].s === 11000, g.map((x) => `${x.s}-${x.e}`).join(' '));
  // truly atomic (one sentence only, >cap) stays whole
  g = pack(mkTl([[0, 15000, 'host', [0]]]));
  check('cap: atomic >12s single-sentence span stays whole', g.length === 1 && g[0].e - g[0].s === 15000, g.map((x) => `${x.s}-${x.e}`).join(' '));
  // two scenes: never merges across sceneKeys
  g = pack(mkTl([[0, 8000, 'host'], [8000, 16000, 'chart']]));
  check('cap: distinct sceneKeys never merge', g.length === 2 && g[0].e === 8000);
  // no gaps, no overlaps
  g = pack(mkTl([[0, 10000, 'host'], [10000, 20000, 'host'], [20000, 30000, 'host']]));
  const ok = g.every((x, i2) => i2 === 0 || x.s === g[i2 - 1].e);
  check('cap: groups tile without gaps/overlaps', ok);
}

console.log(fails === 0 ? '\nALL CHECKS PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
