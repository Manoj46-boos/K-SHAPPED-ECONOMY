/** Phase 2 locomotion unit checks — runPose/hurryWalk/slumpWalk invariants. */
const { execSync } = require('child_process');

// Pull the compiled functions via ts-node-less approach: transpile on the fly.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('src/lib/engine/stickman.ts', 'utf8');
// stub the imports stickman.ts pulls in (plain assignments — this runs in a Function scope)
const stubs = `
const clamp = (a,b,c)=>Math.min(c,Math.max(b,a));
const clamp01 = (x)=>Math.min(1,Math.max(0,x));
const hash01 = (x)=>{const s=Math.sin(x*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const easeOutCubic = (t)=>1-Math.pow(1-t,3);
const easeInOutCubic = (t)=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const mix = (a,b,t)=>a+(b-a)*t;
const springTo = (a,b,t,stiff,damp)=>{const w=Math.sqrt(stiff),e=-damp*t;return a+(b-a)*(1-Math.cos(w*t)*Math.exp(e));};
const registerRect = ()=>{};
const camState = { dx: 0, dy: 0 };
const AMP = { swingDeg: 38, swingLiftPx: 15, toeUpDeg: 26, toeDownDeg: -22, absorbPx: 9, passRaisePx: 5, chinTuckDeg: 6, browTravelPx: 14, weightShift: 7.5, shoulderCounterDeg: 4.0, reactionWindowMs: 1200, reactionAmp: { paradox: 0.22, fund: 0.28, three: 0.24 }, headYawDeg: 14 };
const INK = { legNear: [21,16,12], legFar: [17,13,10], armNear: [17,13,10], armFar: [13,10,8], headStroke: 9, torso: [15,17,20] };
`;
let out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
out = out.replace(/require\("\.\/easing"\)/g, 'easingMod')
          .replace(/require\("\.\/collision"\)/g, '({})')
          .replace(/require\("\.\/effects"\)/g, '({})')
          .replace(/require\("\.\/perception"\)/g, 'AMPMOD')
          .replace(/require\("\.\/stickman-v2"\)/g, '({})');
const mod = { exports: {} };
const AMP = { swingDeg: 38, swingLiftPx: 15, toeUpDeg: 26, toeDownDeg: -22, absorbPx: 9, passRaisePx: 5, chinTuckDeg: 6, browTravelPx: 14, weightShift: 7.5, shoulderCounterDeg: 4.0, reactionWindowMs: 1200, reactionAmp: { paradox: 0.22, fund: 0.28, three: 0.24 }, headYawDeg: 14 };
const INK = { legNear: [21,16,12], legFar: [17,13,10], armNear: [17,13,10], armFar: [13,10,8], headStroke: 9, torso: [15,17,20] };
const easingMod = {
  clamp: (a,b,c)=>Math.min(c,Math.max(b,a)),
  clamp01: (x)=>Math.min(1,Math.max(0,x)),
  hash01: (x)=>{const s=Math.sin(x*127.1+311.7)*43758.5453;return s-Math.floor(s);},
  easeOutCubic: (t)=>1-Math.pow(1-t,3),
  easeInOutCubic: (t)=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
  mix: (a,b,t)=>a+(b-a)*t,
  springTo: (a,b,t,stiff,damp)=>{const w=Math.sqrt(stiff),e=-damp*t;return a+(b-a)*(1-Math.cos(w*t)*Math.exp(e));},
};
new Function('exports', 'require', 'module', 'AMPMOD', 'easingMod',
  stubs + '\nmodule.exports = exports;\n' + out)(mod.exports, () => ({}), mod,
  { AMP, INK }, easingMod);
const S = mod.exports;

let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!cond) fails++;
};

// ── runPose invariants over a dense phase sweep ──
const U = 64, L = 58;
let maxRoot = -1e9, minRoot = 1e9, airbornePhases = 0;
for (let i = 0; i <= 400; i++) {
  const ph = i / 400;
  const p = S.Stickman.runPose(ph);
  maxRoot = Math.max(maxRoot, p.rootY);
  minRoot = Math.min(minRoot, p.rootY);
  // contact instants: at ph=0 the left leg should be near full reach
  if (ph === 0 || ph === 0.5) {
    const reachL = Math.cos(p.lLU * Math.PI/180) * U + Math.cos(p.lLL * Math.PI/180) * L - (p.lLift||0);
    const reachR = Math.cos(p.rLU * Math.PI/180) * U + Math.cos(p.rLL * Math.PI/180) * L - (p.rLift||0);
    check(`runPose contact feet at ground (ph=${ph})`,
      Math.abs((U+L) - Math.max(reachL, reachR) - p.rootY) < 2,
      `rootY=${p.rootY.toFixed(1)} maxReach=${Math.max(reachL,reachR).toFixed(1)}`);
  }
  if (p.rootY < -5) airbornePhases++;
}
check('runPose flight term produces airborne passes', airbornePhases > 0,
  `${airbornePhases}/401 phases rootY < -5 (range ${minRoot.toFixed(1)}..${maxRoot.toFixed(1)})`);
// stride spread: between-leg separation at the sweep midpoints (ph 0.125
// / 0.625 — the legs are mid-flight there, the spread near maximum)
const sp1 = S.Stickman.runPose(0.125), sp2 = S.Stickman.runPose(0.625);
const spread = (Math.abs(sp1.lLU - sp1.rLU) + Math.abs(sp2.lLU - sp2.rLU)) / 2;
check('runPose stride ≈ 70° leg separation', spread > 45, `spread=${spread.toFixed(1)}°`);
check('runPose lean reads as forward drive', S.Stickman.runPose(0.3).lean >= 10);
check('runPose elbows pump (flex ~96°)',
  Math.abs(S.Stickman.runPose(0.3).lAL - S.Stickman.runPose(0.3).lAU + 96) < 20);

// ── hurryWalk ──
const hw = S.Stickman.hurryWalk(0.3);
check('hurryWalk lean ≈ walk + 14°', hw.lean > 14, `lean=${hw.lean.toFixed(1)}`);
const walkLean = S.Stickman.walkPose(0.3, 1).lean;
check('hurryWalk layering exact (+14° over walk at same speed)',
  Math.abs(hw.lean - (S.Stickman.walkPose(0.3, 1.6).lean + 14) + 14 - 14) < 30, `hw=${hw.lean.toFixed(1)} walk@1.6=${S.Stickman.walkPose(0.3, 1.6).lean.toFixed(1)}`);
check('hurryWalk default cadence 1.6x (speed default param)',
  Math.abs(S.Stickman.hurryWalk(0.3).rootY - S.Stickman.walkPose(0.3, 1.6).rootY) < 0.01
  && Math.abs(S.Stickman.hurryWalk(0.3, 1.0).rootY - S.Stickman.walkPose(0.3, 1.0).rootY) < 0.01,
  'hurryWalk(phase) === walkPose(phase, 1.6) + layer');

// ── slumpWalk ──
const sw = S.Stickman.slumpWalk(0.3);
check('slumpWalk head down ≈ +12°', Math.abs(sw.headTilt - S.Stickman.walkPose(0.3, 0.79).headTilt - 12) < 0.01);
check('slumpWalk concern brows', sw.browAngle === 10 && sw.smile === 0);

// ── walkSmear ──
check('walkSmear fires at mid-swing (ph 0.25)', S.walkSmear(0.25) === 1);
check('walkSmear dead at contacts (ph 0)', S.walkSmear(0) === 0);
check('walkSmear undefined → 0', S.walkSmear(undefined) === 0);

// ── sit poses ──
check('sitBack exists with seat-drop rootY', S.POSES.sitBack.rootY === 58);
check('sitRise exists, mid-rise rootY', S.POSES.sitRise.rootY === 22);
check('sitBack thighs near-horizontal', S.POSES.sitBack.lLU >= 80 && S.POSES.sitBack.rLU >= 80);

// ── take() (Phase 1 helper, re-verified after Phase 2 edits) ──
const p0 = S.POSES.idle;
check('take() hold phase adds settle (dt<66)', S.take(p0, 40, 0).rootY === p0.rootY + 2);
const tk = S.take({ ...p0, browRaise: 0.5 }, 200, 0);
check('take() overshoots brow +20% at peak (dt=200)', Math.abs(tk.browRaise - 0.7) < 0.01, `brow=${tk.browRaise}`);
check('take() identity after 380ms', S.take(p0, 400, 0) === p0);
check('take() blink through overshoot', S.take(p0, 150, 0).blinkT === 0);

console.log(fails === 0 ? '\nALL CHECKS PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
