/**
 * 100-JUDGE PANEL / Phase 3 item 1 — THE EMITTER PARTICLE LAYER
 * (report §6 Phase 3, p.17: "New particles.ts: deterministic emitters
 * (heat shimmer over the datacenter, gold motes over fundSplit, cold
 * drift over the mood chapters, dust in the walk scenes) as pure
 * functions of (t, camState) with per-chapter materials. Cap 120
 * particles/frame." Retention impact: +8-12% per-frame render cost on
 * the Dell — well inside budget.)
 *
 * DESIGN RULES (the film's own, inherited from effects.ts):
 *   • PURE FUNCTIONS of (t, camState) — every particle's position is a
 *     closed form of the clock; scrub-determinism survives exactly.
 *   • The layer composites as WORLD ATMOSPHERE — after the scene drawer
 *     (so motes float OVER the content) and under the fgBokeh lens plane
 *     and every reading surface (captions/watermark/grain).
 *   • Depth: three bands like the bokeh (near/mid/far), each drifting at
 *     its own parallax rate against camState.
 *   • The 120-PARTICLE CAP is enforced structurally — emitters declare a
 *     budget and the loop never exceeds it, worst case (all four
 *     emitters visible in one frame is impossible by scene type, but
 *     the cap holds even if it were).
 */

import { clamp01, hash01, hashRange, drift } from './easing';
import { PALETTE, rgba } from './theme';
import { camState } from './effects';

/** The report's hard cap: 120 particles per frame, across all emitters. */
export const PARTICLE_CAP = 120;

/** Which atmosphere a scene gets — the per-chapter materials. */
export type EmitterKind = 'heat' | 'gold' | 'cold' | 'dust' | 'none';

/**
 * The scene-type → material map (per-chapter materials without touching
 * every scene drawer): datacenter rooms get HEAT (rising shimmer — the
 * server floor's thermal exhaust), fund/bank rooms get GOLD (motesc
 * rising off the money), the mood chapters (recession/paradox/worker)
 * get COLD drift (falling slow flakes of blue-grey), and every walking
 * host scene gets DUST kicked at foot level. Statement frames (bigText
 * / stampCard) get none — typography owns the frame alone, the same
 * register the fgBokeh skip uses.
 */
const SCENE_KIND: Record<string, EmitterKind> = {
  aiDatacenter: 'heat',
  fundSplit: 'gold',
  statCards: 'gold',
  recessionGauge: 'cold',
  paradoxResolve: 'cold',
  ownerWorker: 'cold',
  quoteCard: 'cold',
  host: 'dust',
  chartTwin: 'gold',
  pieChart: 'gold',
  chartJourney: 'gold',
  dotGrid: 'gold',
  barsCompare: 'gold',
  gasPump: 'cold',
  splitNumbers: 'gold',
};

export function emitterKindFor(sceneType: string): EmitterKind {
  return SCENE_KIND[sceneType] ?? 'none';
}

interface ParticleSpec {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: string;
}

/** One deterministic particle's state at time t. Index-seeded, closed-form. */
function particle(
  i: number,
  t: number,
  W: number,
  H: number,
  kind: EmitterKind,
  seed: number
): ParticleSpec | null {
  // band: 0 near · 1 mid · 2 far — the bokeh's depth grammar
  const band = i % 3;
  const depth = band === 0 ? 0.95 : band === 1 ? 0.6 : 0.3;
  // particles ignore the camera's zoom, slide against it at (1-BG_PARALLAX)
  // — the same counter-drift the bokeh field uses
  const camX = camState.dx * 0.55 * depth;
  const camY = camState.dy * 0.55 * depth;
  const h1 = hash01(i * 3.7 + seed);
  const h2 = hash01(i * 7.1 + seed * 5);
  const h3 = hash01(i * 11.3 + seed * 9);

  if (kind === 'heat') {
    // HEAT SHIMMER over the datacenter: rises slow, tiny, warm-tinted,
    // with a horizontal wobble (thermal turbulence). Lifespan 7s.
    // P3 tuning: alpha 0.16 → 0.34, radius floor 1.4 → 2.2 — at 0.16 the
    // shimmer died in the transcode (the harness measured a 0.03% pixel
    // footprint); the report demands an ATMOSPHERE, visible at the 320px
    // feed: mid-luminance amber motes rising off the racks.
    const life = 7000;
    const ph = ((t / life) + h1) % 1;
    const y = H * (0.92 - ph * 0.55) - camY + Math.sin(t / 2600 + i * 2.1) * 14 * depth;
    const x = (h2 * W + drift(t / 4000 + i * 3, i) * 26 * depth - camX + W) % W;
    const fade = Math.sin(ph * Math.PI); // born at the floor, dies mid-air
    return { x, y, r: (2.2 + h3 * 3.0) * (0.5 + depth * 0.5), alpha: 0.34 * fade * (0.4 + depth * 0.6), color: '#E8963B' };
  }
  if (kind === 'gold') {
    // GOLD MOTES over the money scenes: rise off the content, sparkle
    // (alpha flicker on a slow sine), gold at far bands only — the
    // v8 "aged paper" lesson from bokehField, kept.
    // P3 tuning: alpha 0.20 → 0.34 — the motes must read at the 320px
    // feed (see the heat note).
    const life = 5200;
    const ph = ((t / life) + h1) % 1;
    const y = H * (0.85 - ph * 0.6) - camY;
    const x = (h2 * W + drift(t / 5000 + i * 2, i) * 20 * depth - camX + W) % W;
    const sparkle = 0.55 + 0.45 * Math.sin(t / 700 + i * 4.7);
    const fade = Math.sin(ph * Math.PI);
    const isGold = band !== 0 || h3 < 0.3; // near band: mostly the cream carrier
    return {
      x, y,
      r: (band === 0 ? 2.4 : band === 1 ? 1.8 : 1.2) * (0.7 + h3 * 0.6),
      alpha: 0.34 * fade * sparkle * (0.35 + depth * 0.65),
      color: isGold ? PALETTE.goldDisplay : '#D9C79A',
    };
  }
  if (kind === 'cold') {
    // COLD DRIFT over the mood chapters: falls (snow registers as
    // melancholy at 0.1-0.2 alpha), slow sine sway, blue-grey.
    // P3 tuning: alpha 0.13 → 0.26, radius floor 1.6 → 2.4 — the drift
    // must read at the 320px feed as falling weather, not a few stray
    // pixels (the harness measured the 0.16-register at ~0.03% frame
    // footprint — invisible after transcode).
    const life = 9000;
    const ph = ((t / life) + h1) % 1;
    const y = (ph * (H + 80) - 40) + camY;
    const x = (h2 * W + Math.sin(t / 3400 + i * 1.9) * 34 * depth - camX + W) % W;
    const fade = Math.sin(ph * Math.PI);
    return { x, y, r: (2.4 + h3 * 3.0) * (0.5 + depth * 0.5), alpha: 0.26 * fade * (0.4 + depth * 0.6), color: '#9FB4C4' };
  }
  if (kind === 'dust') {
    // DUST in the walk scenes: kicked at foot level, arcs with fake
    // gravity (a parabola in closed form), short 640ms life — the walk's
    // own contact-dust register (P2-5) generalized to the emitter layer.
    const life = 640;
    const cycle = 2200 + Math.floor(h1 * 500); // each mote re-kicks on its own cadence
    const kick = (t + i * 911) % cycle;
    if (kick > life) return null; // dead most of the time — dust is rare
    const p = kick / life;
    const side = i % 2 === 0 ? 1 : -1;
    const baseX = W * (0.22 + h2 * 0.5); // the walk lane
    const x = baseX + side * p * (30 + h3 * 46) + Math.sin(p * Math.PI) * 8 - camX;
    const y = H * (0.9 + 0.02) - p * p * (26 + h3 * 30) + camY;
    const fade = Math.sin(p * Math.PI);
    return { x, y, r: (1.8 + h3 * 1.6) * (0.5 + depth * 0.5), alpha: 0.22 * fade, color: '#B7AE9C' };
  }
  return null;
}

/**
 * Draw the emitter layer for a scene. Called by the director AFTER the
 * scene drawer, BEFORE fgBokeh/captions. `seed` rides the chapter so
 * each room's material is its own (deterministic per chapter, not per
 * frame — the atmosphere doesn't re-shuffle when you scrub).
 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  kind: EmitterKind,
  seed: number
): void {
  if (kind === 'none') return;
  // The budgets (sum ≤ 120 ALWAYS; the cap is structural, not a hope):
  // dust is rare-by-design (most dead at any t) so it can afford the
  // biggest nominal budget; heat/gold/cold run continuous.
  const budget = kind === 'dust' ? 64 : kind === 'heat' ? 48 : kind === 'gold' ? 56 : 44;
  const n = Math.min(budget, PARTICLE_CAP);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const p = particle(i, t, W, H, kind, seed);
    if (!p || p.alpha < 0.01) continue;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * camState.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
