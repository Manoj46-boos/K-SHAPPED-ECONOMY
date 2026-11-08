/**
 * Light premium effects: bokeh particle field, floating motes, light rays,
 * film grain tile, soft vignette (bright edges), sparkle bursts, K motif glow.
 */

import { clamp01, drift, easeOutCubic, hash01, hashRange, lerp } from './easing';
import { PALETTE, rgba, glowBlob } from './theme';

// ── v3 (panel P1-2): parallax camera state ─────────────────────────────────────
// cameraV2 scaled the whole frame uniformly — bokeh, cards and host all
// moved at the same rate, so a push-in read as the picture "breathing". The
// background planes now counter-drift so they move at ~BG_PARALLAX of the
// camera — instant depth, deterministically. Written by director.cameraV2
// once per frame BEFORE the scene drawer runs; a pure function of (gt,
// groupDur) so scrub-determinism is preserved exactly.
export const camState = { dx: 0, dy: 0, scale: 1 };

/** Background planes move at this fraction of camera motion (0 = frozen bg). */
export const BG_PARALLAX = 0.45;

// ── Grain (pre-rendered tile, drawn once per frame at low alpha) ─────────────
let grainTile: HTMLCanvasElement | OffscreenCanvas | null = null;

function getGrain(size = 192): HTMLCanvasElement | OffscreenCanvas {
  if (grainTile) return grainTile;
  const c =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(size, size);
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (hash01(i / 4) - 0.5) * 90;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

export function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 0.5): void {
  const tile = getGrain();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'soft-light';
  const pat = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ── Bokeh / mote particle field (parallax layers, deterministic) ─────────────
export function bokehField(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  opts: { intensity?: number; seed?: number; gold?: number } = {}
): void {
  const { intensity = 1, seed = 3, gold = 0.22 } = opts;
  // v8: gold ratio hard-capped — scene call sites still pass 0.5-0.6
  // from the v5 era and every one of them reads as 'aged paper stains' on
  // the white canvas (panel verdict, twice). v8.1 recheck: 0.28 still left
  // smudge-sized gold motes, so the cap drops to 0.18. The cap makes the
  // field safe no matter what the caller asks for.
  const goldRatio = Math.min(0.18, gold);
  const N = 26;
  // v3 (panel P1-2): motes counter-shift by the camera motion the background
  // did NOT follow, so the bokeh slides against the scene plane at ~0.45×.
  const camX2 = camState.dx * (1 - BG_PARALLAX);
  const camY2 = camState.dy * (1 - BG_PARALLAX);
  for (let i = 0; i < N; i++) {
    const depth = 0.25 + hash01(i + seed * 31) * 0.75;
    const speed = 8 + depth * 20;
    const bx = (hash01(i * 3.7 + seed) * W + drift(t / 9000 + i * 3, i) * 40 * depth - camX2 * depth + W) % W;
    const by =
      (hash01(i * 7.1 + seed * 5) * H - (t / 1000) * speed - camY2 * depth + Math.sin(t / 5000 + i) * 20 + H * 4) % H;
    // v8: on a white canvas only the GOLD motes are visible — at 0.45
    // ratio they read as 'aged paper stains' (panel verdict). v8.1 recheck:
    // even capped at 0.28 the large gold motes still read as smudges — the
    // cap drops to 0.18 AND gold motes render at 0.72× radius with a
    // dimmer alpha ceiling: gold is a rare sparkle, never a stain. The
    // field itself is carried by teal-white.
    const isGold = hash01(i * 5.3 + seed) < goldRatio;
    const col = isGold ? PALETTE.gold : '#F2FAF8';
    // v8.2: gold motes also get a hard radius cap (14px core) — the v8.1
    // recheck still found one large gold mote reading as a blotch. Gold is
    // sparkle-sized, always; teal-white motes may stay large and soft.
    const r = Math.min((5 + hash01(i * 2.3) * 26) * depth * (isGold ? 0.72 : 1), isGold ? 14 : 1e9);
    // v8: alpha floor 0.10→0.13 — the v5 field was sub-visible after
    // YouTube's transcode on phone screens (the panel saw "muddy smudges",
    // i.e. the bottom of the range, and nothing else). Barely-there is now
    // actually there.
    const a =
      (isGold ? 0.11 + hash01(i * 9.2) * 0.13 : 0.13 + hash01(i * 9.2) * 0.17) *
      intensity *
      depth;
    glowBlob(ctx, bx, by, r * 3, col, a);
  }
}

// ── Soft light rays from top corner ─────────────────────────────────────────
export function lightRays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  opts: { alpha?: number; x?: number } = {}
): void {
  const { alpha = 0.5, x = W * 0.86 } = opts;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const rot = -0.5 + Math.sin(t / 8000) * 0.04;
  ctx.translate(x, -80);
  ctx.rotate(rot);
  for (let i = 0; i < 5; i++) {
    const wRay = 90 + i * 70;
    const a = (0.03 + hash01(i) * 0.03) * alpha;
    const g = ctx.createLinearGradient(0, 0, 0, H * 1.3);
    g.addColorStop(0, rgba('#FFF9E8', a));
    g.addColorStop(1, rgba('#FFF9E8', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-wRay / 2, 0);
    ctx.lineTo(wRay / 2, 0);
    ctx.lineTo(wRay * 1.6 + 200, H * 1.3);
    ctx.lineTo(-wRay * 1.6 + 60, H * 1.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── Bright-edge vignette (keeps the light, airy feel) ────────────────────────
export function lightVignette(ctx: CanvasRenderingContext2D, W: number, H: number, strength = 1): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, rgba('#FFFFFF', 0));
  g.addColorStop(1, rgba('#FFFFFF', 0.34 * strength));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── Sparkle burst (count-up completions, record moments) ────────────────────
export function sparkles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  t0: number,
  opts: { count?: number; radius?: number; gold?: boolean } = {}
): void {
  const { count = 14, radius = 120, gold = true } = opts;
  const age = t - t0;
  if (age < 0 || age > 900) return;
  const p = age / 900;
  for (let i = 0; i < count; i++) {
    const ang = hash01(i * 12.9) * Math.PI * 2;
    const dist = radius * (0.3 + hash01(i * 4.4) * 0.7) * easeOutCubic(p);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist - p * 30;
    const a = (1 - p) * 0.8;
    const s = (5 + hash01(i * 7.7) * 7) * (1 - p * 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = gold ? PALETTE.goldDeep : PALETTE.up;
    ctx.translate(x, y);
    ctx.rotate(hash01(i * 3.1) * Math.PI);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a2 = (k / 4) * Math.PI * 2;
      const r1 = s;
      const r2 = s * 0.32;
      ctx.lineTo(Math.cos(a2) * r1, Math.sin(a2) * r1);
      ctx.lineTo(Math.cos(a2 + Math.PI / 4) * r2, Math.sin(a2 + Math.PI / 4) * r2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ── Floating K motifs in background (brand watermark texture) ───────────────
export function kMotifs(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  alpha = 0.05
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PALETTE.gold;
  // P1-6 (report): larger K-motif watermarks — the v8 field was 3 motifs
  // at 34-64px, which read as specks at 1080p and as NOTHING after the
  // platform transcode. Four motifs at 52-120px (weight 4) still sit at
  // whisper alpha, but the brand texture survives a phone screen. Gold
  // stays capped at low alpha — big AND loud read as a stain, not a mark.
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    // v3 (panel P1-2): counter-drift against the camera at ~0.45× — the
    // motifs sit behind the scene plane
    const x = (W * (0.16 + i * 0.25) + Math.sin(t / 7000 + i * 2) * 30
      - camState.dx * (1 - BG_PARALLAX) * 1.4 + W) % W;
    const y = H * (0.22 + hash01(i * 8.8) * 0.54) + Math.cos(t / 6000 + i) * 22;
    // P1-6 round 2: floor raised 52 → 64 — the panel read the two smallest
    // marks (52px) as 'specks'; the family now spans 64-120px
    const s = 64 + hash01(i * 3.3) * 56;
    drawK(ctx, x, y, s, 4);
  }
  ctx.restore();
}

/** P1-6 (report) — the soft radial SUBJECT HALO: a wide, barely-there white
 *  radial gradient placed behind a scene's subject (the host, the K
 *  formation) that lifts it off the flat white background. The v8 frames
 *  read as "subject drawn on paper"; a halo reads as "subject lit in a
 *  room". Pure add, drawn BEFORE the subject, zero cost. */
export function subjectHalo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  strength = 0.5
): void {
  const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  g.addColorStop(0, rgba('#FFFFFF', 0.55 * strength));
  g.addColorStop(0.55, rgba('#FFFFFF', 0.30 * strength));
  g.addColorStop(1, rgba('#FFFFFF', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The signature K — two strokes from one point (used everywhere). */
export function drawK(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  lineWidth: number,
  color = PALETTE.ink,
  grow = 1
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stem = Math.min(1, grow * 2);
  const upArm = clamp01(grow * 2 - 0.6);
  const dnArm = clamp01(grow * 2 - 1.1);
  // stem
  ctx.beginPath();
  ctx.moveTo(x, y - s * stem);
  ctx.lineTo(x, y + s * stem);
  ctx.stroke();
  // arms
  if (upArm > 0) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.1);
    ctx.lineTo(x + s * 1.15 * upArm, y - s * 1.05 * upArm);
    ctx.stroke();
  }
  if (dnArm > 0) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.1);
    ctx.lineTo(x + s * 1.15 * dnArm, y + s * 1.05 * dnArm);
    ctx.stroke();
  }
  ctx.restore();
}

/** 3D-extruded K (layered strokes for depth) — the hero moment.
 *  v8: the extrusion stack lightened (9→6 layers, 0.16→0.10 alpha) and
 *  the gold sheen narrowed to a specular band (0.5→0.30 alpha, half the
 *  height) — the pixel audit measured the old broad sweep at hue 46° /
 *  sat 0.78 as it crossed the ink face, which read as a brown wash, not a
 *  specular highlight. */
export function drawK3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  grow: number,
  t: number
): void {
  const layers = 6;
  for (let i = layers; i >= 1; i--) {
    const f = i / layers;
    const off = i * 5.4;
    ctx.save();
    ctx.translate(off, -off * 0.35);
    const shade = lerp(0.5, 0.95, f);
    ctx.globalAlpha = 0.9;
    drawK(ctx, x, y, s, 30 - i * 1.4, rgba(PALETTE.shadow, 0.10 * shade), grow);
    ctx.restore();
  }
  // face strokes
  drawK(ctx, x, y, s, 30, PALETTE.ink, grow);
  // gold sheen — a narrow specular band, not a wash
  const sweep = (t / 2400) % 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - s * 1.4, y - s * 1.3 + sweep * s * 2.6, s * 2.8, s * 0.28);
  ctx.clip();
  drawK(ctx, x, y, s, 30, rgba(PALETTE.gold, 0.30), grow);
  ctx.restore();
}

// ── Scene entry helpers (consistent motion grammar) ──────────────────────────
export function slideUp(t: number, dur = 620, dist = 46): { dy: number; a: number } {
  const p = clamp01(t / dur);
  return { dy: (1 - easeOutCubic(p)) * dist, a: Math.min(1, p * 2.2) };
}

export function popIn(t: number, dur = 560): { s: number; a: number } {
  const p = clamp01(t / dur);
  return { s: 0.86 + 0.14 * easeOutCubic(p), a: Math.min(1, p * 2) };
}

/** Soft radial flash used on hard cuts / reveals.
 *  @deprecated v1 strobe — use softBloom (PATCH 5) at new call sites. */
export function flash(ctx: CanvasRenderingContext2D, W: number, H: number, age: number, dur = 340): void {
  if (age < 0 || age > dur) return;
  const p = age / dur;
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.5;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * v2 soft bloom (PATCH 5) — replaces flash() at cut call sites.
 * The v1 50%-alpha full-screen white frame read as a strobe on a bright
 * theme (exactly the pattern photosensitivity guidance says to avoid) and
 * barely read as "impact" on a light palette anyway. v2 is a 12% warm
 * ivory-gold wash decaying over 180ms — felt, not seen.
 */
export function softBloom(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  age: number,
  dur = 180
): void {
  if (age < 0 || age > dur) return;
  const p = age / dur;
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.12;
  ctx.fillStyle = '#FFF3D6'; // warm ivory-gold, not white
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * v2 scale punch for hard cuts (PATCH 5) — 3.5% overshoot decaying over
 * 200ms (v8: was 2%/160ms — the panel found 2% below perception next to
 * the new 5% camera moves; the punch must clear the camera or it reads
 * as nothing). Multiply into the camera scale right after a cut.
 */
export function scalePunch(age: number, dur = 200): number {
  if (age < 0 || age > dur) return 1;
  const p = age / dur;
  return 1 + 0.035 * Math.sin(p * Math.PI) * (1 - p);
}

// ── v8: the K-WIPE — the brand-owned chapter transition ────────────────────
// A giant soft K sweeps left→right across the frame for the first 420ms of
// every chapter card: the audience learns it by chapter 3 and starts to
// feel "new section coming" — the same trick a great show's title sequence
// does with motion, not words. One clipped drawK per frame, fully
// deterministic, ~0.2ms of render time on the 8 GB Dell.
export function kWipe(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tMs: number,
  dur = 420
): void {
  if (tMs < 0 || tMs > dur) return;
  const p = tMs / dur;
  // easeInOut through the frame; alpha peaks mid-sweep
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const a = Math.sin(p * Math.PI) * 0.07;
  const cx = -W * 0.35 + e * W * 1.7;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = PALETTE.up;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // one huge K, arms trailing the vertex like a brush stroke
  const s = H * 0.42;
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.5 - s);
  ctx.lineTo(cx, H * 0.5 + s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.5 + s * 0.08);
  ctx.lineTo(cx + s * 1.12, H * 0.5 - s * 0.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.5 + s * 0.08);
  ctx.lineTo(cx + s * 1.12, H * 0.5 + s * 0.92);
  ctx.stroke();
  // a warm counter-stroke a beat behind — depth on the sweep
  ctx.globalAlpha = a * 0.6;
  ctx.strokeStyle = PALETTE.gold;
  const cx2 = cx - W * 0.05;
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(cx2, H * 0.5 - s * 0.9);
  ctx.lineTo(cx2, H * 0.5 + s * 0.9);
  ctx.stroke();
  ctx.restore();
}

/** Deterministic floating gold coins (for pump / wealth scenes). */
export function floatCoins(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  n = 5,
  spread = 90
): void {
  for (let i = 0; i < n; i++) {
    const ph = (t / 1600 + hash01(i * 3.3)) % 1;
    const a = Math.sin(ph * Math.PI) * 0.7;
    const x = cx + hashRange(i * 9.1, -spread, spread);
    const y = cy - ph * 130;
    const r = 10 + hash01(i * 4.7) * 8;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.goldWash;
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
