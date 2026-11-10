/**
 * Light premium effects: bokeh particle field, floating motes, light rays,
 * film grain tile, soft vignette (bright edges), sparkle bursts, K motif glow.
 */

import { clamp01, drift, easeOutCubic, hash01, hashRange } from './easing';
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

// ── Grain (pre-rendered tiles, drawn once per frame at low alpha) ─────────────
// AUDIT-2 / 0.5 (report §10.1, M7): THREE-TILE FLICKER. One static tile
// stamped every frame read (the panel's word) as a paper texture overlay —
// "double-treating" the already-light composite. Real film grain is a
// different random field every frame: three pre-generated tiles cycled on
// a quantized clock restore the flicker for zero marginal render cost.
// Determinism survives because the tile choice is a pure function of t.
const GRAIN_TILES: Array<HTMLCanvasElement | OffscreenCanvas> = [];
const GRAIN_TILE_N = 3;

function getGrainTiles(size = 192): Array<HTMLCanvasElement | OffscreenCanvas> {
  if (GRAIN_TILES.length) return GRAIN_TILES;
  for (let k = 0; k < GRAIN_TILE_N; k++) {
    const c =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(size, size);
    c.width = size;
    c.height = size;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(size, size);
    // AUDIT-2 / 0.5 calibration: the old tile (±45 at alpha 26, soft-light)
    // produced sub-1/255 deltas on the film's light plates — a texture the
    // panel could only find by reading the code, i.e. a tax. ±64 at tile
    // alpha 96 under OVERLAY at the 0.30 production draw lands the grain
    // at perceptible-but-barely (the report's own bar for finishing), and
    // the three-tile flicker finally produces measurable frame deltas.
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (hash01(i / 4 + k * 9241) - 0.5) * 128;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 96;
    }
    g.putImageData(img, 0, 0);
    GRAIN_TILES.push(c);
  }
  return GRAIN_TILES;
}

export function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 0.5, t = 0): void {
  const tiles = getGrainTiles();
  // tile cycles on a ~16.7ms quantized clock — a NEW random field every
  // frame at both 30 and 60 fps (frameIndex modulo three, by time): the
  // flicker the film needed.
  const tile = tiles[Math.floor(t / 16.67) % GRAIN_TILE_N] ?? tiles[0];
  ctx.save();
  ctx.globalAlpha = alpha;
  // AUDIT-2 / 0.5: composite switches soft-light → OVERLAY. Soft-light on
  // the film's near-white plates is arithmetically a no-op (sub-1/255 —
  // the same trap the report flagged in lightRays); overlay of a
  // 128±64-centred tile at these alphas lands the grain at
  // perceptible-but-barely AND makes the three-tile flicker measurable.
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ── Bokeh / mote particle field (parallax layers, deterministic) ─────────────
// AUDIT-2 / §10.4 (report Phase 3): the field is re-engineered, not
// supplemented — HALF the count (34 → 17), every disc CAMERA-SCALED
// (radius × camState.scale: the world zooms and the lens artifacts zoom
// with it — the flat-read fix), depth coupling kept. Fewer, larger, moving
// WITH the camera reads as a lens; many static rings read as a stencil.
export function bokehField(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  opts: { intensity?: number; seed?: number; gold?: number } = {}
): void {
  const { intensity = 1, seed = 3, gold = 0.22 } = opts;
  const goldRatio = Math.min(0.18, gold);
  const N = 17;
  // v3 (panel P1-2): motes counter-shift by the camera motion the background
  // did NOT follow, so the bokeh slides against the scene plane at ~0.45×.
  const camX2 = camState.dx * (1 - BG_PARALLAX);
  const camY2 = camState.dy * (1 - BG_PARALLAX);
  for (let i = 0; i < N; i++) {
    const depth = 0.35 + hash01(i + seed * 31) * 0.65;
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
    // v8.2: gold motes also get a hard radius cap (14px core) — the v8.1
    // recheck still found one large gold mote reading as a blotch. Gold is
    // sparkle-sized, always; teal-white motes may stay large and soft.
    // AUDIT-2: every radius multiplies by camState.scale — the bokeh now
    // participates in the camera (the "world zooms and the effects do
    // not" flat-read, fixed at every call site from one factor).
    const r = Math.min((8 + hash01(i * 2.3) * 28) * depth * (isGold ? 0.72 : 1), isGold ? 14 : 1e9)
      * camState.scale;
    // v8: alpha floor 0.10→0.13 — the v5 field was sub-visible after
    // YouTube's transcode on phone screens (the panel saw "muddy smudges",
    // i.e. the bottom of the range, and nothing else). Barely-there is now
    // actually there. (Superseded for the ring stroke by ringA below — the
    // caps taught the field restraint; the rings carry their own ramp.)
    // P1-1 (report §12.1): CRISP STROKED DISCS, not glow stains. The
    // radial-gradient blob read as a soft stain ("aged paper", twice-convicted
    // panel verdict); a ring with a hard inner edge reads as a LENS artifact —
    // the bokeh look the field was always meant to have.
    // Panel re-review calibration: the first ring pass (alpha floor 0.16 off
    // the v8.2 caps) was judged "one lonely ring… a token gesture" — a thin
    // ring covers ~10× less area than the blob it replaces, so it needs real
    // ink to register. Rings now carry their OWN alpha ramp (0.26–0.62,
    // depth-weighted so far discs stay quieter): a field of confident,
    // varied discs — still light-register, never confetti.
    const ringA = Math.min(
      isGold ? 0.55 : 0.62,
      (isGold ? 0.28 + hash01(i * 9.2) * 0.27 : 0.26 + hash01(i * 9.2) * 0.36) *
        intensity * (0.55 + depth * 0.45)
    );
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.strokeStyle = isGold ? rgba(PALETTE.gold, ringA) : rgba('#7FB8AC', ringA);
    ctx.lineWidth = Math.max(2, r * 0.2); // ring reads at 320px
    ctx.stroke();
    if (r > 14) {
      // large discs only: inner highlight arc — the light bending through
      // the lens edge, what separates a disc from a drawn circle
      ctx.beginPath();
      ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.45, -2.6, -1.2);
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.5, ringA * 0.85).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
    }
  }
}

// ── AUDIT-3 / §3.5 (report Phase 3.5 — DEPTH PAYOFF): FOREGROUND BOKEH ───────
/**
 * Two or three LARGE defocused discs drifting IN FRONT of the scene — the
 * Kurzgesagt depth-stack move the report describes: "a foreground leaf
 * passes over the subject". The background bokehField is a ring field
 * behind the content; this is its foreground partner — filled (defocused
 * = no hard edges), very low alpha (0.05–0.09 — atmosphere, never a
 * screen), large (60–110px), riding 1.35× the camera motion so the
 * foreground plane separates on every push and truck. Called by the
 * director AFTER the scene drawer and BEFORE the captions, so it passes
 * over the world but never over the reading surfaces. Pure function of
 * (t, camState) — scrub-determinism preserved.
 */
export function fgBokeh(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  opts: { seed?: number; count?: number } = {}
): void {
  const { seed = 5, count = 3 } = opts;
  // 1.35× camera: foreground objects move MORE than the midground stage —
  // the differential the parallax planes were missing on the near side.
  const camX = camState.dx * 1.35;
  const camY = camState.dy * 1.35;
  for (let i = 0; i < count; i++) {
    const depth = 0.75 + hash01(i * 3.1 + seed) * 0.5;
    const r = (62 + hash01(i * 7.7 + seed * 3) * 48) * depth * camState.scale;
    // slow diagonal drift + camera coupling; wraps at the frame edge
    const bx = (hash01(i * 5.9 + seed) * (W + 240) + Math.sin(t / 6400 + i * 2.1) * 34 - camX * depth + W + 240) % (W + 240) - 120;
    const by = (hash01(i * 11.3 + seed * 2) * (H + 240) + Math.cos(t / 7100 + i * 1.7) * 26 - camY * depth + H + 240) % (H + 240) - 120;
    const a = 0.05 + hash01(i * 13.7 + seed) * 0.04;
    const isGold = hash01(i * 4.3 + seed * 5) < 0.3;
    const g = ctx.createRadialGradient(bx, by, r * 0.25, bx, by, r);
    if (isGold) {
      g.addColorStop(0, rgba(PALETTE.gold, a * 0.9));
      g.addColorStop(1, rgba(PALETTE.gold, 0));
    } else {
      g.addColorStop(0, rgba('#7FB8AC', a));
      g.addColorStop(1, rgba('#7FB8AC', 0));
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    // the defocused edge — one soft ring, no hard stroke (defocus has no
    // hard edges; that is what makes it read as LENS, not drawing)
    ctx.strokeStyle = isGold ? rgba(PALETTE.gold, a * 0.55) : rgba('#7FB8AC', a * 0.55);
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
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
    // PANEL-12 / P2-5 (report §14.5): 0.03–0.06 → 0.07–0.10. The old band
    // was sub-visible after the platform transcode — a render cost with no
    // visible result is a tax, not an effect. The new band registers on a
    // phone while staying inside the light register (no blown highlights).
    const a = (0.07 + hash01(i) * 0.03) * alpha;
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
// PANEL-12 / P2-4 (report §14.4) — THE BRAND PARTICLE. The burst used to
// be a generic 4-point star polygon — "a PowerPoint star", the panel said.
// It is now the channel's OWN mark: a ~12px mini-K glyph (drawK at
// lineWidth 2.2), rotating via the existing hash01 rotation and easing out
// along the same radius curve. Same cost, same determinism — and every
// celebration moment in the film becomes brand-reinforcing. Count is
// capped at 10 per burst (10+ reads as confetti noise at phone scale).
// AUDIT-2 / §10.4: radius AND glyph size multiply by camState.scale — the
// particles ride the camera like everything else in the world.
export function sparkles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  t0: number,
  opts: { count?: number; radius?: number; gold?: boolean } = {}
): void {
  const { count = 14, radius = 120, gold = true } = opts;
  const n = Math.min(count, 10); // ≤10 per burst
  const age = t - t0;
  if (age < 0 || age > 900) return;
  const p = age / 900;
  const cam = camState.scale;
  for (let i = 0; i < n; i++) {
    const ang = hash01(i * 12.9) * Math.PI * 2;
    const dist = radius * cam * (0.3 + hash01(i * 4.4) * 0.7) * easeOutCubic(p);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist - p * 30 * cam;
    const a = (1 - p) * 0.8;
    const s = (5 + hash01(i * 7.7) * 6) * (1 - p * 0.6) * cam; // 10–22px mini-K
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(hash01(i * 3.1) * Math.PI);
    drawK(ctx, 0, 0, s, 2.2, gold ? PALETTE.goldDeep : PALETTE.up, 1);
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
  // v10 (panel VFX-4): motifs pulled inward — at the old positions a
  // half-cut K bled off the right edge on wide scenes and read as an
  // export artifact ("a cropped K glyph looks like a bug", ownerWorker
  // frame). Every motif now sits fully inside the 140px safe margin.
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    // v3 (panel P1-2): counter-drift against the camera at ~0.45× — the
    // motifs sit behind the scene plane
    const x = (W * (0.18 + i * 0.21) + Math.sin(t / 7000 + i * 2) * 30
      - camState.dx * (1 - BG_PARALLAX) * 1.4 + W) % W;
    const y = H * (0.24 + hash01(i * 8.8) * 0.44) + Math.cos(t / 6000 + i) * 22;
    // P1-6 round 2: floor raised 52 → 64 — the panel read the two smallest
    // marks (52px) as 'specks'; the family now spans 64-120px
    // AUDIT-2 / §10.4: watermark scale rides the camera (camState.scale).
    const s = (64 + hash01(i * 3.3) * 56) * camState.scale;
    drawK(ctx, Math.min(Math.max(x, 170), W - 170), Math.min(Math.max(y, 190), H - 260), s, 4);
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

/**
 * PANEL-12 / P3.1 (report §15.1) — a TRUE oblique extrusion for the K.
 *
 * The v2 "3D" was an offset-copy stack (4 faded duplicates) — the panel
 * read its edges as "soft gray ghost lines / doubled strokes". This is a
 * real extrusion of the K outline: the K is three strokes; every stroke
 * segment is a quad of its two endpoints ± the width normal; each quad's
 * side walls are extruded along ONE fixed vector d = (0.35, −0.14) × depth
 * and filled in the shadow tone, and the ink face lands on top. The walls
 * are inset by half the stroke width so the squared corners stay inside
 * the face's round caps.
 *
 * AUDIT-2 / §10.4 (report Phase 3, D3): the TWO WALLS now shade by the
 * light — the wall whose outward normal faces the light (upper-right)
 * renders one step brighter than the wall facing away, so the extrusion
 * reads as lit volume instead of a flat decal.
 */
const K_EXTRUDE_D = { x: 0.35, y: -0.14 }; // oblique depth vector (upper-right light)

function extrudeStroke(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,   // stroke segment
  w: number, depth: number, colLit: string, colShadow: string
): void {
  const nx = -(y1 - y0), ny = x1 - x0;
  const L = Math.hypot(nx, ny) || 1;
  const ux = (nx / L) * (w / 2), uy = (ny / L) * (w / 2); // width normal
  // inset by half the stroke width so the squared wall ends stay inside
  // the face's round caps (no ghost corners poking past the letterform)
  const tx = ((x1 - x0) / L) * (w / 2), ty = ((y1 - y0) / L) * (w / 2);
  const ax = x0 + tx, ay = y0 + ty, bx = x1 - tx, by = y1 - ty;
  const dx = K_EXTRUDE_D.x * depth, dy = K_EXTRUDE_D.y * depth;
  // AUDIT-2 / D3: which +normal wall faces the light? Light from upper
  // right ≈ (0.7, −0.7): positive dot ⇒ lit tone, else shadow tone.
  const litP = ux * 0.7 + uy * -0.7 >= 0;
  const wall = (sx: number, sy: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax + sx, ay + sy);
    ctx.lineTo(bx + sx, by + sy);
    ctx.lineTo(bx + sx + dx, by + sy + dy);
    ctx.lineTo(ax + sx + dx, ay + sy + dy);
    ctx.closePath();
    ctx.fill();
  };
  wall(ux, uy, litP ? colLit : colShadow);
  wall(-ux, -uy, litP ? colShadow : colLit);
}

export function drawK3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  grow: number,
  t: number
): void {
  ctx.save();
  // AUDIT-2 / 0.7 + D4 (report §10.1/§10.4): the floor shadow obeys the
  // ONE-LIGHT rule — offset (−4, +8), the same vector groundShadowV2 uses
  // (the panel caught "two lighting systems in one frame") — and it
  // CATCHES the letter: its centre rides the wobble and its alpha/scale
  // key to grow, so the floor participates in the 3D read (a static
  // ellipse under a moving object is a decal).
  const wPh = Math.sin(t / 4000);
  if (grow > 0.15) {
    const shX = x - 4 + wPh * s * 0.05;
    const shY = y + 8 + s * 1.22;
    const a = 0.17 * clamp01(grow * 1.35);
    const g = ctx.createRadialGradient(shX, shY, 4, shX, shY, s * 1.15);
    g.addColorStop(0, rgba(PALETTE.shadow, a));
    g.addColorStop(0.6, rgba(PALETTE.shadow, a * 0.4));
    g.addColorStop(1, rgba(PALETTE.shadow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(shX, shY, s * 1.15 * (0.88 + 0.12 * grow), s * 0.2 * (0.88 + 0.12 * grow), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the wobble — AUDIT-2 / D3: ±2° on a 4s period. The old ±0.5°/9.1s was
  // measured by the panel as "invisible in both still and motion"; 2°
  // clears the perception floor while staying stately. The pivot sits at
  // the letter's OPTICAL centre (vertex + 0.05s down), so the rotation
  // reads as the object swaying, not the stem scraping.
  const pivY = y + s * 0.05;
  ctx.translate(x, pivY);
  ctx.rotate(wPh * 0.035);
  ctx.translate(-x, -pivY);
  // the TRUE extrusion — side walls of each stroke quad along ONE fixed
  // vector, two light shades (replaces the 4-layer copy loop entirely)
  const stemF = Math.min(1, grow * 2);
  const upArm = clamp01(grow * 2 - 0.6);
  const dnArm = clamp01(grow * 2 - 1.1);
  // AUDIT-2 / D3: the extrusion deepens as the camera pushes (camState
  // .scale-1 rides the depth) — the letter's volume answers the lens.
  const depth = s * 0.14 * (0.9 + 0.1 * clamp01(grow)) * (0.85 + 0.15 * camState.scale);
  // AUDIT-2 re-review calibration: the panel found the first two-wall pass
  // "barely differentiated" — the tones open to 0.26 / 0.11 so the lit and
  // shadow walls read as two values at any scale.
  const colLit = rgba(PALETTE.shadow, 0.26);
  const colShadow = rgba(PALETTE.shadow, 0.11);
  const W_K = 30;
  extrudeStroke(ctx, x, y - s * stemF, x, y + s * stemF, W_K, depth, colLit, colShadow);
  if (upArm > 0) {
    extrudeStroke(ctx, x, y + s * 0.1, x + s * 1.15 * upArm, y - s * 1.05 * upArm, W_K, depth, colLit, colShadow);
  }
  if (dnArm > 0) {
    extrudeStroke(ctx, x, y + s * 0.1, x + s * 1.15 * dnArm, y + s * 1.05 * dnArm, W_K, depth, colLit, colShadow);
  }
  // gold rim — a wide soft gold pass UNDER the face; the ink face
  // covers its centre and the gold peeks only at the silhouette edge
  // (a lit edge, not a halo)
  drawK(ctx, x, y, s, 38, rgba(PALETTE.gold, 0.16), grow);
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
 * PANEL-12 / P2-3 (report §14.3): `amp` — bigText and stampCard land the
 * film's loudest words, so their cut-punch runs 0.035 → 0.05.
 */
export function scalePunch(age: number, dur = 200, amp = 0.035): number {
  if (age < 0 || age > dur) return 1;
  const p = age / dur;
  return 1 + amp * Math.sin(p * Math.PI) * (1 - p);
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

/** Deterministic floating gold coins (for pump / wealth scenes).
 *  PANEL-12 / P2-5 (report §14.5): coins, not bubbles — an edge ring
 *  (goldDeep stroke) gives each disc a struck-metal rim, and a spin
 *  (scaleX = cos(t/260 + i), floored at ±0.18 so the coin never vanishes
 *  edge-on) with the highlight riding the spin converts flat circles
 *  into tumbling coins. Three lines of geometry, same determinism.
 *  AUDIT-2 / §10.4: coin radius rides camState.scale — the effect layer
 *  finally participates in the camera. */
export function floatCoins(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  n = 5,
  spread = 90
): void {
  const cam = camState.scale;
  for (let i = 0; i < n; i++) {
    const ph = (t / 1600 + hash01(i * 3.3)) % 1;
    const a = Math.sin(ph * Math.PI) * 0.7;
    const x = cx + hashRange(i * 9.1, -spread, spread) * cam;
    const y = cy - ph * 130 * cam;
    const r = (10 + hash01(i * 4.7) * 8) * cam;
    const spin = Math.cos(t / 260 + i);
    const sx = Math.abs(spin) < 0.18 ? (spin < 0 ? -0.18 : 0.18) : spin;
    // AUDIT-3 / Finding 9 (report Phase 2.5 adjacent — "coins read as
    // PowerPoint clipart next to otherwise designed figures"): the flat
    // gold fill + 2px rim is replaced by a STRUCK COIN — radial-gradient
    // face, beveled rim, embossed inner ring, specular crescent — plus a
    // two-ghost SPIN TRAIL so each coin reads as money in motion, the
    // same "there is mass and air here" language as the scarf fix.
    // 1) the spin trail: two fading echoes of the rim at wider/flatter
    //    scaleX — velocity the eye reads before the coin itself
    if (a > 0.18) {
      for (const [gsx, ga] of [[sx * 1.55, 0.20], [sx * 1.95, 0.10]] as Array<[number, number]>) {
        ctx.save();
        ctx.globalAlpha = a * ga;
        ctx.translate(x, y);
        ctx.scale(gsx, 1);
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = Math.max(1.2, r * 0.10);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    // 2) struck face — light catches the upper-left of the relief
    const face = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
    face.addColorStop(0, '#E8CB6B');
    face.addColorStop(0.55, PALETTE.gold);
    face.addColorStop(1, '#9F7D16');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // 3) beveled rim — the edge catch-light (bottom-right) vs shadow
    ctx.strokeStyle = 'rgba(255, 244, 204, 0.85)';
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth * 0.55, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    // 4) embossed inner ring — the struck relief, scales with the coin
    if (r > 11) {
      ctx.strokeStyle = 'rgba(143, 110, 18, 0.55)';
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      // the currency bar — a short embossed mark inside the ring
      ctx.strokeStyle = 'rgba(143, 110, 18, 0.5)';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, r * 0.28);
      ctx.lineTo(r * 0.22, r * 0.28);
      ctx.stroke();
    }
    // 5) specular crescent — the one bright thing on the coin
    ctx.strokeStyle = 'rgba(255, 252, 235, 0.9)';
    ctx.lineWidth = Math.max(1, r * 0.13);
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.16, r * 0.72, Math.PI * 1.08, Math.PI * 1.55);
    ctx.stroke();
    ctx.restore();
  }
}

// ── AUDIT-2 / §10.4 (report Phase 3): THE IMPACT GRAMMAR ────────────────────
/** Micro-shake — a 2px, 80ms camera jitter on data reveals. Deterministic
 *  per quantized frame (pure function of t). Apply to ctx.translate BEFORE
 *  the scene draws. */
export function microShake(t: number, t0: number): { dx: number; dy: number } {
  const age = t - t0;
  if (age < 0 || age > 80) return { dx: 0, dy: 0 };
  const decay = Math.sin((age / 80) * Math.PI);
  const f = Math.floor(t / 33.33);
  return {
    dx: (hash01(f * 13.7 + 0.5) - 0.5) * 4.4 * decay,
    dy: (hash01(f * 29.3 + 5.5) - 0.5) * 4.4 * decay,
  };
}

/** Impact ring — an expanding gold ring from the numeral, ~520ms, decaying
 *  stroke. The second member of the impact grammar (shake + ring + one
 *  double-radius glow frame at the strike). */
export function impactRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  t0: number,
  r = 150
): void {
  const age = t - t0;
  if (age < 0 || age > 520) return;
  const p = age / 520;
  // re-review calibration: the first pass fired at 0.55 peak alpha and
  // read "near-invisible against the pale plate" — the ring opens to 0.85
  // with a thicker decaying stroke so the slam COMMUNICATES.
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.85;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = Math.max(2.5, 14 * (1 - p));
  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.22 + 0.78 * easeOutCubic(p)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** AUDIT-2 / §10.4 (report Phase 3, D2): ATMOSPHERIC PERSPECTIVE — the
 *  cheapest depth upgrade available and the one the panel asked for in
 *  three separate passes ("no horizon fade, no gradient falloff"). Two
 *  soft overlay fills order the planes: a 4% background-tone wash over the
 *  rearmost band and an 8% band mid-scene. Draw AFTER far content, BEFORE
 *  the subject — whatever the band covers reads as further away. */
export function hazeBands(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: { rearY?: number; midY?: number; tone?: string } = {}
): void {
  const { rearY = H * 0.3, midY = H * 0.52, tone = PALETTE.bgSoft } = opts;
  ctx.save();
  // rear band — 4%: the far elements sink into the air
  let g = ctx.createLinearGradient(0, rearY - H * 0.17, 0, rearY + H * 0.05);
  g.addColorStop(0, rgba(tone, 0));
  g.addColorStop(0.72, rgba(tone, 0.05));
  g.addColorStop(1, rgba(tone, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, rearY - H * 0.17, W, H * 0.22);
  // mid band — 8%: the depth seam between mid-ground and fore
  g = ctx.createLinearGradient(0, midY - H * 0.075, 0, midY + H * 0.075);
  g.addColorStop(0, rgba(tone, 0));
  g.addColorStop(0.5, rgba(tone, 0.09));
  g.addColorStop(1, rgba(tone, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, midY - H * 0.075, W, H * 0.15);
  ctx.restore();
}
