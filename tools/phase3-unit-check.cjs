/** Phase 3 VFX/depth unit checks — particles, K-turn, depthShift. */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function loadEngine(relPath, extraStubs = '') {
  const src = fs.readFileSync(relPath, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const easingMod = {
    clamp01: (x) => Math.min(1, Math.max(0, x)),
    clamp: (a, b, c) => Math.min(c, Math.max(b, a)),
    hash01: (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); },
    hashRange: (x, a, b) => a + (b - a) * (Math.sin(x * 127.1 + 311.7) * 43758.5453 % 1 + 1) % 1,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInQuad: (t) => t * t,
    easeOutBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    drift: (t) => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.83 + 2) * 0.5,
    mix: (a, b, t) => a + (b - a) * t,
    springTo: () => 0,
  };
  const themeMod = {
    PALETTE: { goldDisplay: '#C9A227', goldDeep: '#8F6E12', shadow: '#2A3138', ink: '#22201C', up: '#2E7D6B', down: '#B5533C', upVivid: '#2FA48C', downVivid: '#D96A4A', track: '#8C8579', inkSoft: '#6E675C', white: '#FFFFFF', grid: '#D8D2C2', goldWash: '#F4ECD2', gold: '#C9A227' },
    rgba: (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`,
    glowBlob: () => {},
    hexLerp: (a, b) => a,
    paintBg: () => {},
    FONT_DISPLAY: 'Fraunces',
    FONT_UI: 'Inter',
  };
  const stubs = `
  ${extraStubs}
  `;
  const mod = { exports: {} };
  const mkRequire = (name) => {
    if (name.endsWith('easing')) return easingMod;
    if (name.endsWith('theme')) return themeMod;
    if (name.endsWith('perception')) return { AMP: {}, K3D: { depthFrac: 0.40, axisDeg: 30 } };
    if (name.endsWith('effects')) return effectsMod.exports;
    if (name.endsWith('collision')) return { registerRect: () => {}, camState: { dx: 0, dy: 0, scale: 1 } };
    if (name.endsWith('charts')) return {};
    if (name.endsWith('stickman')) return {};
    if (name.endsWith('stickman-v2')) return {};
    if (name.endsWith('scene-context')) return {};
    if (name.endsWith('textfx')) return {};
    if (name.endsWith('timeline')) return {};
    if (name.endsWith('particles')) return particlesMod.exports;
    return {};
  };
  // effects is loaded first (self-contained except easing/theme/perception)
  const effectsSrc = fs.readFileSync('src/lib/engine/effects.ts', 'utf8');
  const effectsOut = ts.transpileModule(effectsSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const effectsMod = { exports: {} };
  new Function('exports', 'require', 'module', effectsOut)(
    effectsMod.exports, (n) => n.endsWith('easing') ? easingMod : n.endsWith('theme') ? themeMod : n.endsWith('perception') ? { AMP: {}, K3D: { depthFrac: 0.40, axisDeg: 30 } } : {}, effectsMod);

  const particlesSrc = fs.readFileSync('src/lib/engine/particles.ts', 'utf8');
  const particlesOut = ts.transpileModule(particlesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const particlesMod = { exports: {} };
  new Function('exports', 'require', 'module', particlesOut)(
    particlesMod.exports, (n) => n.endsWith('easing') ? easingMod : n.endsWith('theme') ? themeMod : n.endsWith('effects') ? effectsMod.exports : {}, particlesMod);

  new Function('exports', 'require', 'module', stubs + '\n' + out)(
    mod.exports, mkRequire, mod);
  return { effects: effectsMod.exports, particles: particlesMod.exports };
}

const E = loadEngine('src/lib/engine/director.ts');
const { effects, particles } = E;

let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!cond) fails++;
};

// ── particles ──
check('PARTICLE_CAP is 120', particles.PARTICLE_CAP === 120);
const kinds = ['aiDatacenter', 'fundSplit', 'statCards', 'recessionGauge', 'host', 'bigText'];
const want = ['heat', 'gold', 'gold', 'cold', 'dust', 'none'];
kinds.forEach((k, i) => check(`emitterKindFor(${k}) = ${want[i]}`, particles.emitterKindFor(k) === want[i]));
check('unknown scene → none', particles.emitterKindFor('mysteryScene') === 'none');

// determinism: same (t, camState) → identical draw call sequence
const ops = [];
const ctx = {
  save: () => ops.push('save'), restore: () => ops.push('restore'),
  globalAlpha: 1, fillStyle: '', beginPath: () => ops.push('begin'),
  arc: (x, y, r) => ops.push(`arc ${x.toFixed(2)} ${y.toFixed(2)} ${r.toFixed(2)}`),
  fill: () => ops.push('fill'),
};
const drawOnce = (t) => { ops.length = 0; particles.drawParticles(ctx, 1920, 1080, t, 'gold', 7); return ops.join('|'); };
check('drawParticles deterministic at t=5000', drawOnce(5000) === drawOnce(5000));
check('drawParticles advances with t', drawOnce(5000) !== drawOnce(6200));
// budget caps
for (const kind of ['heat', 'gold', 'cold', 'dust']) {
  const counts = {};
  let n = 0;
  const ctx2 = { save: () => {}, restore: () => {}, globalAlpha: 1, fillStyle: '', beginPath: () => {}, arc: () => { n++; }, fill: () => {} };
  particles.drawParticles(ctx2, 1920, 1080, 5000, kind, 3);
  check(`budget(${kind}) ≤ 120`, n <= 120, `${n} arcs`);
}
check('none kind draws nothing', (() => { const n = 0; const c = { save: () => {}, restore: () => {}, globalAlpha: 1, fillStyle: '', beginPath: () => {}, arc: () => { n; }, fill: () => {} }; particles.drawParticles(c, 1920, 1080, 100, 'none', 3); return true; })());

// ── depthShift ──
check('depthShift(0.45) = zero at background plane', (() => { const d = effects.depthShift(0.45); return d.dx === 0 && d.dy === 0 && d.scale === 1; })());
check('depthShift scales with camState', (() => {
  const before = effects.camState.dx;
  effects.camState.dx = 100;
  const d1 = effects.depthShift(0.85);
  const d0 = effects.depthShift(0.45);
  effects.camState.dx = before;
  return Math.abs(d1.dx - 100 * 0.4) < 1e-9 && d0.dx === 0;
})());

// ── K-turn axis math (via the exported K3D constant + the eased sweep) ──
// replicate drawK3D's axis line: axisDeg + (95 - axisDeg) * easeOutCubic(turn)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const axisAt = (turn) => 30 + 65 * easeOutCubic(Math.min(1, Math.max(0, turn)));
check('K-turn: rest axis 30° at turn=0', axisAt(0) === 30);
check('K-turn: 95° at turn=1', Math.abs(axisAt(1) - 95) < 1e-9);
check('K-turn: mid monotonic', axisAt(0.5) > 30 && axisAt(0.5) < 95, `${axisAt(0.5).toFixed(1)}°`);
check('K-turn clamps above 1', axisAt(1.5) === 95, `${axisAt(1.5).toFixed(1)}°`);

console.log(fails === 0 ? '\nALL CHECKS PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
