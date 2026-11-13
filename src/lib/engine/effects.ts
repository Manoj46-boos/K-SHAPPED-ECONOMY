/**
 * Light premium effects: bokeh particle field, floating motes, light rays,
 * film grain tile, soft vignette (bright edges), sparkle bursts, K motif glow.
 */

import { clamp01, drift, easeOutCubic, hash01, hashRange } from './easing';
import { PALETTE, rgba, glowBlob, hexLerp } from './theme';
import { AMP, K3D } from './perception';

// ── v3 (panel P1-2): parallax camera state ─────────────────────────────────────
// cameraV2 scaled the whole frame uniformly — bokeh, cards and host all
// moved at the same rate, so a push-in read as the picture "breathing". The
// background planes now counter-drift so they move at ~BG_PARALLAX of the
// camera — instant depth, deterministically. Written by director.cameraV2
// once per frame BEFORE the scene drawer runs; a pure function of (gt,
// groupDur) so scrub-determinism is preserved exactly.
export const camState = { dx: 0, dy: 0, scale: 1 };
// BLUEPRINT Phase 5: the GUARD camera — the steady-state transform the
// collision guard asserts against (pre-reaction: the 1.2s emotional beats
// are punch-class transients, exempt exactly like scalePunch). Published
// by director.cameraV2 alongside camState.
export const guardCamState = { dx: 0, dy: 0, scale: 1 };

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
    // BLUEPRINT Phase 4 (report §11): the grain's register rises to
    // GENUINELY VISIBLE on ivory plates — the tiles widen ±64 -> ±80 so
    // the three-tile flicker survives the platform transcode on a phone
    // (the audit measured the old stack at ~1-3 luminance levels:
    // "texture tax, no flicker seen"). The mechanism stays: three tiles,
    // overlay composite, quantized flicker clock.
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (hash01(i / 4 + k * 9241) - 0.5) * 160;
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
  // BLUEPRINT Phase 4 (report §11): HALVE the count again (17 -> 9) and
  // DOUBLE the speed — few, confident, MOVING discs read as a lens;
  // many slow rings read as stamped confetti. The ring alpha floor
  // rises 0.26 -> 0.40 so the survivors register after the transcode.
  // 100-JUDGE AUDIT (Part 12.2): count lifted 9 → 14 — premium 2D
  // animation needs more varied disc sizes and speeds to read as a
  // real lens plane. Each disc still gets a depth band, still camera-
  // scaled, still varies by hash; only the count rises.
  const N = 14;
  // v3 (panel P1-2): motes counter-shift by the camera motion the background
  // did NOT follow, so the bokeh slides against the scene plane at ~0.45×.
  const camX2 = camState.dx * (1 - BG_PARALLAX);
  const camY2 = camState.dy * (1 - BG_PARALLAX);
  // AUDIT-ROUND-2 (fix 23 — BOKEH DEPTH BANDS): the ring alpha band was
  // 0.55-0.62 across ALL discs — a 7-percent spread the eye flattens; the
  // panel read the field as "the same stock circles pasted on every frame:
  // one size, one opacity, zero depth layering" / "UI watermarks, not
  // motion". THREE explicit depth bands now — NEAR (r≈60, alpha 0.75,
  // slight blur fill), MID (r≈40, alpha 0.50), FAR (r≈22, alpha 0.25, gold
  // rare) — one texture becomes a legible depth stack.
  for (let i = 0; i < N; i++) {
    const band = i % 3;                    // 0 near · 1 mid · 2 far — deterministic mix
    const depth = band === 0 ? 0.95 : band === 1 ? 0.62 : 0.3;
    const speed = 16 + (2 - band) * 40;
    const bx = (hash01(i * 3.7 + seed) * W + drift(t / 9000 + i * 3, i) * 40 * depth - camX2 * depth + W) % W;
    const by =
      (hash01(i * 7.1 + seed * 5) * H - (t / 1000) * speed - camY2 * depth + Math.sin(t / 5000 + i) * 20 + H * 4) % H;
    // v8: on a white canvas only the GOLD motes are visible — at 0.45
    // ratio they read as 'aged paper stains' (panel verdict). v8.1 recheck:
    // even capped at 0.28 the large gold motes still read as smudges — the
    // cap drops to 0.18 AND gold motes render at 0.72× radius with a
    // dimmer alpha ceiling: gold is a rare sparkle, never a stain. The
    // field itself is carried by teal-white.
    // AUDIT-ROUND-2 (fix 23): gold lives ONLY in the far band — a distant
    // sparkle, never a near-field stain (the v8 'aged paper' lesson, kept).
    const isGold = band === 2 && hash01(i * 5.3 + seed) < goldRatio * 2.6;
    // AUDIT-2: every radius multiplies by camState.scale — the bokeh now
    // participates in the camera (the "world zooms and the effects do
    // not" flat-read, fixed at every call site from one factor).
    // fix 23: the BAND SIZES — 60 / 40 / 22 (± variance), gold capped.
    const r = Math.min(
      (band === 0 ? 54 + hash01(i * 2.3) * 14 : band === 1 ? 36 + hash01(i * 2.3) * 10 : 19 + hash01(i * 2.3) * 6)
        * (isGold ? 0.72 : 1),
      isGold ? 14 : 1e9
    ) * camState.scale;
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
    // AUDIT-PHASE-1: ring alpha floor 0.40 -> 0.55 — lens artifacts
    // survive the 320 px downsample instead of vanishing.
    // AUDIT-ROUND-2 (fix 23): the BAND ALPHAS — 0.75 / 0.50 / 0.25 — the
    // spread the eye reads as DEPTH (replacing the old 0.55-0.62 flat band).
    const ringA = (band === 0 ? 0.75 : band === 1 ? 0.5 : 0.25) * intensity;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    if (band === 0) {
      // the NEAR band: a slight blur fill under the ring — defocus, not a
      // hard stencil (the lens disc you actually notice)
      ctx.fillStyle = isGold ? rgba(PALETTE.gold, ringA * 0.16) : rgba('#7FB8AC', ringA * 0.16);
      ctx.fill();
    }
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
  // 100-JUDGE AUDIT (Part 11.2 + 12.2 — MULTI-LAYER DEPTH-OF-FIELD).
  // Three foreground discs over a 20-minute video is too few. Premium
  // composition uses 8-12 foreground elements at varied depths, speeds
  // and sizes. Default count lifted 3 → 10. Each disc gets a varied
  // depth (0.75-1.25), varied speed coupling, and a soft radial gradient
  // fill (defocus, not hard stencil). The blur filter is applied via
  // offscreen canvas in the director's depth stack (see drawFrame); here
  // we just draw more varied discs.
  const { seed = 5, count = 10 } = opts;
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
    // BLUEPRINT Phase 4 (report Table 5 — "foreground bokeh: invisible
  // after transcode, no foreground plane felt"): the register rises
  // 0.05-0.09 -> 0.075-0.13 — the near lens plane finally READS on the
  // sparse host/walk frames (the feed panel's two weakest cells), while
  // staying under the captions and off the reading surfaces.
  const a = 0.075 + hash01(i * 13.7 + seed) * 0.055;
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
    // BLUEPRINT Phase 4 (report §11): 0.07-0.10 -> 0.14-0.18 — "no light
    // in the room" becomes a room with light. Still inside the light
    // register (overlay composite, warm ivory, no blown highlights).
    // AUDIT-PHASE-1: light rays alpha 0.14–0.18 -> 0.22–0.30 — the room
    // gains visible light; no longer a lightbox.
    const a = (0.22 + hash01(i) * 0.08) * alpha;
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

// ── PREMIUM UPGRADE V4: DARK-EDGE VIGNETTE ───────────────────────────────────
// The bright-edge vignette (white at edges) is replaced with a standard
// dark-edge vignette (shadow at edges). The eye is drawn to the brightest
// part of the frame; darkening the edges pushes attention inward, toward
// the subject. The bright-edge read as "flash photography"; the dark-edge
// reads as cinematic focus. Uses PALETTE.shadow (cool slate-teal) at 0.25
// alpha — felt, not heavy.
export function lightVignette(ctx: CanvasRenderingContext2D, W: number, H: number, strength = 1): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, rgba(PALETTE.shadow, 0));
  g.addColorStop(0.6, rgba(PALETTE.shadow, 0));
  g.addColorStop(1, rgba(PALETTE.shadow, 0.28 * strength));
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

// ── The watermark K (brand mark, background layer) ──────────────────────────
/**
 * AUDIT-ROUND-2 (fix 24 — THE WATERMARK DECISION): the four ghost motifs
 * at whisper alpha were judged "a placeholder logo stamp, not designed
 * light-play", and at 320px they were invisible dead weight — the audit's
 * rule: "a brand watermark either declares or disappears; the middle is
 * noise". The four ghosts are gone. ONE crisp K outline, top-right, at
 * 0.18 alpha with a one-light offset shadow (the same lower-left vector
 * every shadow in the film obeys) — a designed mark at a fraction of the
 * old render cost. Scenes that already carry their own brand object pass
 * alpha = 0 (the "or nothing" branch) — the end screen keeps its big K3D
 * and draws no second mark.
 */
export function kMotifs(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  alpha = 0.18
): void {
  if (alpha <= 0.01) return; // "or nothing" — the frame already carries the brand
  ctx.save();
  // fixed top-right (inside the 140px safe margin), gently camera-coupled
  // so the mark rides the background plane
  const x = Math.min(W - 300, W * 0.84 + Math.sin(t / 7000) * 8
    - camState.dx * (1 - BG_PARALLAX) * 0.6);
  const y = H * 0.17 + Math.cos(t / 6000) * 6;
  const s = 118 * camState.scale;
  // the one-light offset — the mark's shadow falls lower-left, exactly
  // like every card, chip and figure shadow in the film (P3-3)
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = rgba(PALETTE.goldDeep, 0.5);
  drawK(ctx, x - 5, y + 8, s, 5);
  // the mark itself — one crisp K outline at the declared alpha
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PALETTE.gold;
  drawK(ctx, x, y, s, 5);
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
 * AUDIT-ROUND-2 (fix 16 — ONE EXTRUSION AXIS): per-stroke convergence
 * toward a single vanishing point was mathematically true perspective and
 * perceptually a DEFECT — the trained eye read "the stem's depth face
 * offsets left while the upper diagonal's flips right… two flat letters
 * glued at different offsets". All three strokes now extrude along ONE
 * FIXED depth vector — down-left, 30° off the horizontal (K3D.axisDeg),
 * away from the film's upper-right light — with the upper arm's depth
 * foreshortened 12%. Solidity first, perspective second: one consistent
 * axis reads as a solid; convergence at these sizes reads as a mistake.
 */
function extrudeStroke(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,   // stroke segment
  w: number, depth: number, colLit: string, colShadow: string,
  d: { x: number; y: number }                        // AUDIT-ROUND-2: the ONE fixed depth vector
): void {
  const nx = -(y1 - y0), ny = x1 - x0;
  const L = Math.hypot(nx, ny) || 1;
  const ux = (nx / L) * (w / 2), uy = (ny / L) * (w / 2); // width normal
  // inset by half the stroke width so the squared wall ends stay inside
  // the face's round caps (no ghost corners poking past the letterform)
  const tx = ((x1 - x0) / L) * (w / 2), ty = ((y1 - y0) / L) * (w / 2);
  const ax = x0 + tx, ay = y0 + ty, bx = x1 - tx, by = y1 - ty;
  const dx = d.x, dy = d.y;
  // AUDIT-2 / D3: which +normal wall faces the light? Light from upper
  // right ≈ (0.7, −0.7): positive dot ⇒ lit tone, else shadow tone.
  const litP = ux * 0.7 + uy * -0.7 >= 0;
  // P2-1 (100-judge audit, Table 4 — "light it properly: gradient
  // walls"): each wall was ONE flat solid tone ("faux-3D — extrusion
  // with no lighting system... 2.5D cosplay"). Real extruded objects
  // shade: every wall is now a 3-STOP LINEAR GRADIENT along the depth
  // vector — base tone at the face, mid at 55%, BRIGHTER at the outer
  // edge (the edge catches the light). The lit wall rides
  // shadow→lit→bright-lit; the shadow wall dark→shadow→lit-deep.
  const wall = (sx: number, sy: number, stops: [number, string][]): void => {
    const gx0 = ax + sx, gy0 = ay + sy;
    const g = ctx.createLinearGradient(gx0, gy0, gx0 + dx, gy0 + dy);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax + sx, ay + sy);
    ctx.lineTo(bx + sx, by + sy);
    ctx.lineTo(bx + sx + dx, by + sy + dy);
    ctx.lineTo(ax + sx + dx, ay + sy + dy);
    ctx.closePath();
    ctx.fill();
  };
  wall(ux, uy, litP
    ? [[0, '#A8851B'], [0.5, colLit], [1, '#E9C94A']]
    : [[0, '#5F4A0E'], [0.55, colShadow], [1, '#A8851B']]);
  wall(-ux, -uy, litP
    ? [[0, '#5F4A0E'], [0.55, colShadow], [1, '#A8851B']]
    : [[0, '#A8851B'], [0.5, colLit], [1, '#E9C94A']]);
}

export function drawK3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  grow: number,
  t: number,
  // P0-2 (100-judge audit, Table 2 — THE ONE-MASCOT RULE): the K
  // performs its face ONLY when it is the subject of the frame — never
  // as background watermark furniture, never beside a second mascot.
  // Call sites that stage the K as subject (the cold-open formation, the
  // divergeK reveal) keep the default; every watermark / thumbnail /
  // host-adjacent K passes false.
  face = true
): void {
  ctx.save();
  // AUDIT-2 / 0.7 + D4 (report §10.1/§10.4): the floor shadow obeys the
  // ONE-LIGHT rule — offset (−4, +8), the same vector groundShadowV2 uses
  // (the panel caught "two lighting systems in one frame") — and it
  // CATCHES the letter: its centre rides the wobble and its alpha/scale
  // key to grow, so the floor participates in the 3D read (a static
  // ellipse under a moving object is a decal).
  const wPh = Math.sin(t / AMP.kWobblePeriodMs);
  if (grow > 0.15) {
    // P2-1 (audit Table 4 — "unified floor shadow language"): the old
    // big soft radial read as "a smudge — a different shadow language
    // than the character's clean contact shadow" ("two lighting systems
    // in one frame"). The K's floor shadow now speaks the CHARACTER's
    // language (groundShadowV2): a tighter 2-stop contact core (harder
    // falloff — contact, not blur) plus a CRISP contact line under the
    // stem's base — same (−4, +8) one-light offset, same alpha register.
    const shX = x - 4 + wPh * s * 0.05;
    const shY = y + 8 + s * 1.22;
    const a = 0.30 * clamp01(grow * 1.35);
    const g = ctx.createRadialGradient(shX, shY, 2, shX, shY, s * 0.85);
    g.addColorStop(0, rgba(PALETTE.shadow, a));
    g.addColorStop(0.45, rgba(PALETTE.shadow, a * 0.55));
    g.addColorStop(1, rgba(PALETTE.shadow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(shX, shY, s * 0.9 * (0.88 + 0.12 * grow), s * 0.2 * (0.88 + 0.12 * grow), 0, 0, Math.PI * 2);
    ctx.fill();
    // the contact line — the character-shadow register
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.35);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shX - s * 0.5, shY);
    ctx.lineTo(shX + s * 0.5, shY);
    ctx.stroke();
  }
  // the wobble — BLUEPRINT Phase 1 (Table 7): ±2°/4s -> ±5°/2.6s
  // (AMP.kWobbleDeg / kWobblePeriodMs). The audit read the old register as
  // "stately to the point of still"; physical objects at rest breathe, and
  // the brand object is the most alive thing on screen. The pivot stays at
  // the letter's optical centre (vertex + 0.05s down).
  const pivY = y + s * 0.05;
  ctx.translate(x, pivY);
  ctx.rotate(wPh * AMP.kWobbleDeg * Math.PI / 180);
  ctx.translate(-x, -pivY);
  // the TRUE extrusion — AUDIT-ROUND-2 (fix 16): ONE fixed depth axis for
  // all three strokes (down-left, K3D.axisDeg), the upper arm's depth
  // foreshortened 12% (it sits "higher" in the oblique projection).
  const stemF = Math.min(1, grow * 2);
  const upArm = clamp01(grow * 2 - 0.6);
  const dnArm = clamp01(grow * 2 - 1.1);
  // AUDIT-2 / D3: the extrusion deepens as the camera pushes (camState
  // .scale-1 rides the depth) — the letter's volume answers the lens.
  const depth = s * K3D.depthFrac * (0.9 + 0.1 * clamp01(grow)) * (0.85 + 0.15 * camState.scale);
  // THE ONE FIXED AXIS — down-left at K3D.axisDeg (30° below horizontal),
  // away from the upper-right light. Every wall of every stroke runs
  // parallel to this vector: one object, one extrusion, one read.
  const axis = K3D.axisDeg * Math.PI / 180;
  const dAll = { x: -Math.cos(axis) * depth, y: Math.sin(axis) * depth };
  const dArmUp = { x: dAll.x * 0.88, y: dAll.y * 0.88 }; // foreshortened
  // AUDIT-PHASE-4: SOLID GOLD material — the lit wall in the object's
  // OWN gold (signature material), the shadow wall in gold-oxide
  // (#8F6E12). One material, one signature.
  const colLit = PALETTE.goldDisplay;
  const colShadow = PALETTE.goldDeep;
  const W_K = 30;
  extrudeStroke(ctx, x, y - s * stemF, x, y + s * stemF, W_K, depth, colLit, colShadow, dAll);
  if (upArm > 0) {
    extrudeStroke(ctx, x, y + s * 0.1, x + s * 1.15 * upArm, y - s * 1.05 * upArm, W_K, depth, colLit, colShadow, dArmUp);
  }
  if (dnArm > 0) {
    extrudeStroke(ctx, x, y + s * 0.1, x + s * 1.15 * dnArm, y + s * 1.05 * dnArm, W_K, depth, colLit, colShadow, dAll);
  }
  // P2-1 (audit Table 4 — "AO at stem-arm junctions"): the junctions
  // where the arms meet the stem hold no ambient occlusion — flat walls
  // meeting flat walls. A soft goldDeep radial at the vertex (where both
  // arms root into the stem) darkens the wall seams BEFORE the face
  // strokes paint — the face stays bright, the seams recede, and the
  // object reads as assembled mass instead of layered cut-outs.
  // AUDIT-ROUND-2 (fix 17 — WIDENED AO WEDGE): the wedge widens (0.36r →
  // 0.46r) and the core deepens — the junction reads as the assembled
  // mass it is; the chamfer band above it catches the light.
  if (upArm > 0.35 && dnArm > 0.2) {
    const jx = x + s * 0.12;
    const jy = y + s * 0.14;
    const ao = ctx.createRadialGradient(jx, jy, 1, jx, jy, s * 0.46);
    ao.addColorStop(0, rgba(PALETTE.goldDeep, 0.55));
    ao.addColorStop(0.55, rgba(PALETTE.goldDeep, 0.24));
    ao.addColorStop(1, rgba(PALETTE.goldDeep, 0));
    ctx.fillStyle = ao;
    ctx.beginPath();
    ctx.arc(jx, jy, s * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }
  // gold rim — a wide soft gold pass UNDER the face; the ink face
  // covers its centre and the gold peeks only at the silhouette edge
  // (a lit edge, not a halo)
  // AUDIT-PHASE-1: gold rim alpha 0.16 -> 0.55 — the K's gold rim
  // becomes a lit edge, not a hint.
  drawK(ctx, x, y, s, 38, rgba(PALETTE.gold, 0.55), grow);
  // AUDIT-ROUND-2 (fix 17 — BEVEL + GOLD RAMP): the flat goldDisplay face
  // + striation bands read as "one mustard plus noise… no bevel, no edge
  // highlight… real premium gold in flat-style design is a 2-3 tone ramp
  // plus one white glint". The face is now a THREE-TONE RAMP — #F5E6A8
  // specular streak on the upper third, goldDisplay mid, goldDeep base —
  // and a CHAMFER BAND: a bright 3-stop gradient stroke inset along the
  // front-face outline (the "edge catches the light" cue — the same ramp
  // the struck-coin routine already uses, ported one scene over). The
  // striation noise and the sweeping sheen band are gone; one white glint
  // dot lands on the stem (below).
  {
    // 100-JUDGE AUDIT (Part 11.3 — PBR GOLD 7-TONE RAMP). The shipped
    // 3-stop face ramp (specular → mid → base) collapses into "mustard
    // plus noise" at the phone gate. Real PBR gold is a 5-7 tone ramp
    // plus an environment reflection plus a Fresnel edge highlight.
    // The 7-tone ramp: #FFF4D0 specular → #F5E6A8 bright → #D9B224 mid
    // → #C9A227 base → #8F6E12 shadow → #5F4A0E deep shadow → #3F3208
    // ambient occlusion. Each tone maps to a different lighting zone on
    // the K's face — the audience reads "struck coin" instead of
    // "mustard gradient".
    const ramp = ctx.createLinearGradient(x, y - s, x, y + s);
    ramp.addColorStop(0,    '#FFF4D0');   // specular highlight — top edge
    ramp.addColorStop(0.15, '#F5E6A8');   // bright lit zone
    ramp.addColorStop(0.40, '#D9B224');   // mid tone (goldDisplay)
    ramp.addColorStop(0.65, '#C9A227');   // base gold
    ramp.addColorStop(0.82, '#8F6E12');   // shadow zone
    ramp.addColorStop(0.93, '#5F4A0E');   // deep shadow
    ramp.addColorStop(1,    '#3F3208');   // ambient occlusion — bottom edge
    drawK(ctx, x, y, s, 30, ramp as unknown as string, grow);
    // the CHAMFER — a bright inset stroke along the face's own outline,
    // carrying a light-axis gradient (bright where the light catches the
    // bevel, deep on the shadow side): the edge between face and walls.
    // 100-JUDGE AUDIT: the chamfer now carries 4 stops — the Fresnel edge
    // highlight brightens where the surface normal is perpendicular to the
    // camera (top + right edges face upper-right toward the light).
    const cham = ctx.createLinearGradient(x + s * 0.9, y - s * 0.9, x - s * 0.7, y + s * 0.7);
    cham.addColorStop(0,    '#FFFAE8');   // Fresnel edge — bright where normal ⊥ camera
    cham.addColorStop(0.30, '#FFE9A8');   // lit edge
    cham.addColorStop(0.65, PALETTE.goldDisplay);
    cham.addColorStop(1,    rgba(PALETTE.goldDeep, 0.85));
    drawK(ctx, x, y, s, 13, cham as unknown as string, grow);
  }
  // fix 17: the WHITE GLINT — one bright specular dot on the stem's
  // upper section (the "plus one white glint" of premium gold; replaces
  // the old sweeping sheen band).
  if (grow > 0.8) {
    ctx.save();
    ctx.globalAlpha = clamp01((grow - 0.8) / 0.2);
    const gl = ctx.createRadialGradient(x - 4, y - s * 0.55, 0.5, x - 4, y - s * 0.55, 9);
    gl.addColorStop(0, 'rgba(255, 252, 235, 0.95)');
    gl.addColorStop(1, 'rgba(255, 252, 235, 0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.ellipse(x - 4, y - s * 0.55, 9, 6.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // AUDIT-PHASE-4: ANTHROPOMORPHIZATION — the K gets a FACE. Two ink-dot
  // eyes and a small smile arc below the vertex (where the three strokes
  // meet). The K becomes a CHARACTER the audience recognizes and looks
  // forward to seeing — the Kurzgesagt-duck move. Only renders once the
  // K is fully grown (grow > 0.7) so the reveal ritual lands first.
  // P0-2: gated on `face` — the one-mascot rule above.
  // AUDIT-ROUND-2 (fix 18 — FACE ON THE FRONT PLANE): the dots and smile
  // drew in screen space at the letter's vertex — the panel read "eyes
  // straddle the stem/depth-face seam and the smile crosses onto the
  // lower diagonal… the face is applied like a sticker, ignoring the
  // letter's internal geometry", with the right eye floating in the
  // counter reading as a stray dot. The face now draws in the FRONT
  // FACE's local frame: translated ALONG the single depth axis (12% of
  // depth, toward the viewer — proud of the face plane), scaled with
  // the depth, rotated with the wobble (it already rides the wobble
  // transform), and POSITIONED ON THE STEM's face — the eyes sit across
  // the stem's width, the right eye clear of the counter, the smile
  // under them still on the stem face. A face ON the object reads as a
  // mascot; a face NEAR the object reads as a sticker.
  if (face && grow > 0.7) {
    const faceAlpha = clamp01((grow - 0.7) / 0.3);
    // the face rides the front plane: proud of it by 12% of the depth
    // (opposite the extrusion axis), scaled with the depth
    const fShift = 0.12;
    const fS = 1 - 0.1 * K3D.depthFrac;
    ctx.save();
    ctx.globalAlpha = faceAlpha;
    ctx.translate(-dAll.x * fShift, -dAll.y * fShift);
    ctx.scale(fS, fS);
    ctx.fillStyle = PALETTE.ink;
    // eyes — ON the stem's face, across its width (±0.075s; the stem's
    // face is ±0.071s wide at s=210 — the eyes cover it, edge to edge)
    ctx.beginPath();
    ctx.arc(x - s * 0.075, y - s * 0.16, s * 0.058, 0, Math.PI * 2);
    ctx.arc(x + s * 0.075, y - s * 0.16, s * 0.058, 0, Math.PI * 2);
    ctx.fill();
    // smile — under the eyes, still on the stem face, spanning it
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(2.4, s * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.085, y - s * 0.04);
    ctx.quadraticCurveTo(x, y + s * 0.035, x + s * 0.085, y - s * 0.04);
    ctx.stroke();
    ctx.restore();
  }
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
 *  the scene draws.
 *  AUDIT-PHASE-4: duration 80 -> 60ms, amplitude via AMP.microShakePx 9 -> 18.
 *  Faster + harder = impact; slower + smaller = camera drift. */
export function microShake(t: number, t0: number): { dx: number; dy: number } {
  const age = t - t0;
  if (age < 0 || age > 60) return { dx: 0, dy: 0 };
  const decay = Math.sin((age / 80) * Math.PI);
  const f = Math.floor(t / 33.33);
  // BLUEPRINT Phase 1 (Table 7): 4.4 -> 9 px (AMP.microShakePx) — the
  // reveal impact must register as a hit, not a tick.
  return {
    dx: (hash01(f * 13.7 + 0.5) - 0.5) * AMP.microShakePx * 2 * decay,
    dy: (hash01(f * 29.3 + 5.5) - 0.5) * AMP.microShakePx * 2 * decay,
  };
}

/** Impact ring — an expanding gold ring from the numeral, ~520ms, decaying
 *  stroke. The second member of the impact grammar (shake + ring + one
 *  double-radius glow frame at the strike).
 *  AUDIT-PHASE-4: 520ms -> 380ms, stroke 14px -> 22px. A faster, thicker
 *  ring reads as a slam; a slower, thinner ring reads as a ripple. */
export function impactRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  t0: number,
  r = 150
): void {
  const age = t - t0;
  if (age < 0 || age > 380) return;
  const p = age / 380;
  // re-review calibration: the first pass fired at 0.55 peak alpha and
  // read "near-invisible against the pale plate" — the ring opens to 0.85
  // with a thicker decaying stroke so the slam COMMUNICATES.
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.85;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = Math.max(2.5, 22 * (1 - p));
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
  // AUDIT-PHASE-3: rear haze 0.05 -> 0.12 — the rear band becomes visible
  // atmospheric recession; far racks now read as further away, not at the
  // same plane as the near content.
  let g = ctx.createLinearGradient(0, rearY - H * 0.17, 0, rearY + H * 0.05);
  g.addColorStop(0, rgba(tone, 0));
  g.addColorStop(0.72, rgba(tone, 0.12));
  g.addColorStop(1, rgba(tone, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, rearY - H * 0.17, W, H * 0.22);
  // mid band — 8%: the depth seam between mid-ground and fore
  // AUDIT-PHASE-3: mid haze 0.09 -> 0.20 — the depth seam between the
  // rack field and the stat cards becomes a real atmospheric break.
  g = ctx.createLinearGradient(0, midY - H * 0.075, 0, midY + H * 0.075);
  g.addColorStop(0, rgba(tone, 0));
  g.addColorStop(0.5, rgba(tone, 0.20));
  g.addColorStop(1, rgba(tone, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, midY - H * 0.075, W, H * 0.15);
  ctx.restore();
}
