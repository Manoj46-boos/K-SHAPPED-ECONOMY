/**
 * Host-centric scenes: the stick man presenter in various staged moments,
 * the signature "diverging K" formation, split-number reveals, channel intro.
 */

import { clamp01, easeInOutSine, easeOutCubic, easeOutQuad, lerp } from './easing';
import { PALETTE, TONE, card, chip, chipWidth, rgba, roundRect, setFont, glowBlob, paintBg, FONT_DISPLAY, CAPTION_ZONE_TOP } from './theme';
import { bokehField, drawK3D, drawK, softBloom, kMotifs, lightRays, slideUp } from './effects';
import { Stickman, POSES, blendPose, walkIn, nodPulse } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';
import { SceneCtx } from './scene-context';
import { sourceTag, wrapText } from './charts';

const HOST_X = (W: number, side: 'center' | 'left' | 'right'): number =>
  side === 'left' ? W * 0.27 : side === 'right' ? W * 0.73 : W * 0.5;

function expressionPose(expression?: string): Partial<typeof POSES.idle> {
  switch (expression) {
    case 'warm':
      return { smile: 0.55, browRaise: 0.15 };
    case 'curious':
      return { browRaise: 0.5, smile: 0.2 };
    case 'serious':
      return { browAngle: 13, smile: 0 };
    default:
      return {};
  }
}

/** Common host stage: background, spotlight, optional stage decoration. */
function hostStage(g: SceneCtx, side: 'center' | 'left' | 'right'): void {
  const { ctx, W, H } = g;
  paintBg(ctx, W, H, g.t);
  bokehField(ctx, W, H, g.t, { intensity: 0.9, seed: 7 });
  lightRays(ctx, W, H, g.t, { alpha: 0.6 });
  kMotifs(ctx, W, H, g.t, 0.05);

  const stage = g.s.stage as string;
  const hx = HOST_X(W, side);
  const hy = H * 0.78;

  if (stage === 'spot' || !stage) {
    // soft spotlight pool
    const pulse = 0.5 + 0.5 * Math.sin(g.t / 2400);
    const grd = ctx.createRadialGradient(hx, hy + 30, 30, hx, hy + 30, 340);
    grd.addColorStop(0, rgba('#FFFFFF', 0.75));
    grd.addColorStop(0.55, rgba('#FFFFFF', 0.28 + 0.1 * pulse));
    grd.addColorStop(1, rgba('#FFFFFF', 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 34, 300, 74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#B9B4A6', 0.35);
    ctx.beginPath();
    ctx.ellipse(hx, hy + 30, 250, 52, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stage === 'chartstand') {
    // easel on the right the host points at
    const ex = W * 0.68;
    const ey = H * 0.42;
    const ap = easeOutCubic(clamp01(g.t / 700));
    ctx.save();
    ctx.globalAlpha = ap;
    card(ctx, ex - 210 * ap - (1 - ap) * 40, ey - 160, 420, 320, { r: 24 });
    ctx.strokeStyle = rgba('#B9B4A6', 0.7);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - 90, ey + 160);
    ctx.lineTo(ex - 150, ey + 250);
    ctx.moveTo(ex + 90, ey + 160);
    ctx.lineTo(ex + 150, ey + 250);
    ctx.stroke();
    // abstract rising chart doodle on the easel
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 8;
    ctx.beginPath();
    const pts = [
      [ex - 150, ey + 90], [ex - 80, ey + 40], [ex - 30, ey + 66],
      [ex + 30, ey - 30], [ex + 100, ey - 70],
    ];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();
  } else if (stage === 'kflip' || stage === 'kclimb' || stage === 'kdescend') {
    // giant soft K in the background
    const kg = clamp01(g.t / 1400);
    ctx.save();
    ctx.globalAlpha = 0.1;
    drawK3D(ctx, W * 0.66, H * 0.46, 260, kg, g.t);
    ctx.restore();
    if (stage === 'kclimb') {
      // rising gold ramp under the host
      ctx.strokeStyle = rgba(PALETTE.up, 0.8);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W * 0.16, H * 0.8);
      ctx.lineTo(W * 0.44, H * 0.66);
      ctx.stroke();
    } else if (stage === 'kdescend') {
      ctx.strokeStyle = rgba(PALETTE.down, 0.75);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W * 0.16, H * 0.66);
      ctx.lineTo(W * 0.44, H * 0.8);
      ctx.stroke();
    }
  }
}

/** The host himself, with entrance + gesture + speech energy.
 *  v3 (panel P0-3/P0-4): renders with drawStickmanV2 everywhere — the host
 *  visibly changed body style between scenes when only hostSceneV2 used v2 —
 *  and the mouth now articulates with the word timings (talk envelope).
 *  Nods and talk key off beatT (wordTimes are beat-local; the v2 dead
 *  `nod` computation and the group-time nodP are gone). */
function drawHost(g: SceneCtx, side: 'center' | 'left' | 'right'): void {
  const { ctx, W, H, t } = g;
  const hx = HOST_X(W, side);
  const hy = H * 0.78;
  const scale = 1.18;
  const entrance = g.s.entrance as string | undefined;
  let x = hx;
  let pose;
  if (entrance === 'walk') {
    const walkDur = 900;
    const r = walkIn(t, hx - 560, hx, walkDur);
    x = r.x;
    pose = r.walking ? r.pose : Stickman.poseAt(t, { gesture: g.s.gesture ?? 'present', speaking: g.speaking });
  } else {
    pose = Stickman.poseAt(t, { gesture: g.s.gesture ?? 'present', speaking: g.speaking });
    const expr = expressionPose(g.s.expression as string | undefined);
    pose = { ...pose, ...expr };
  }
  const nodP = g.speaking ? nodPulse(g.beatT, g.wordTimes) : 0;
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  const lookRight = g.s.lookRight ? 1 : g.s.lookLeft ? -1 : side === 'left' ? 0.8 : side === 'right' ? -0.8 : 0;
  const fade = entrance === 'walk' ? clamp01(t / 300) : clamp01(t / 420);
  drawStickmanV2(ctx, x, hy, scale, t, { pose, alpha: fade, look: lookRight, nod: nodP, scarf: true, talk }, 11);
}

/** Kicker / ribbon / chip below or above host. */
function hostChips(g: SceneCtx, side: 'center' | 'left' | 'right'): void {
  const { ctx, W, H, t } = g;
  const hx = HOST_X(W, side);
  const ribbon = g.s.ribbon as string | undefined;
  const kicker = g.s.kicker as string | undefined;
  const chipTxt = g.s.chip as string | undefined;
  if (ribbon) {
    const ap = clamp01((t - 300) / 500);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      setFont(ctx, 30, 700);
      const tw = ctx.measureText(ribbon).width;
      const rx = hx - tw / 2 - 30;
      const ry = H * 0.2;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, rx, ry, tw + 60, 58, 29);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, rx, ry, tw + 60, 58, 29);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(ribbon, rx + 30, ry + 39);
      ctx.restore();
    }
  }
  if (kicker) {
    const ap = clamp01((t - 400) / 600);
    if (ap > 0) {
      const kx = W / 2;
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.textAlign = 'center';
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      const lines = String(kicker).split(' — ');
      lines.forEach((ln, i) => {
        ctx.fillText(ln, kx, H * 0.9 + i * 44);
      });
      ctx.restore();
    }
  }
  if (chipTxt) {
    const ap = clamp01((t - 900) / 600);
    if (ap > 0) {
      setFont(ctx, 24, 600);
      const tw = ctx.measureText(chipTxt).width;
      ctx.save();
      ctx.globalAlpha = ap * 0.85;
      ctx.fillStyle = rgba('#FFFFFF', 0.9);
      roundRect(ctx, W / 2 - tw / 2 - 24, H * 0.12, tw + 48, 44, 22);
      ctx.fill();
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.textAlign = 'left';
      ctx.fillText(chipTxt, W / 2 - tw / 2, H * 0.12 + 29);
      ctx.restore();
    }
  }
}

// v5 (audit P1-1): scene headlines draw in the bundled display serif
// (Fraunces) — same face as every other serif moment in the film.
const FONT_SERIF = FONT_DISPLAY;

export function hostScene(g: SceneCtx): void {
  // v2 (PATCH 9): beats that carry an editorial `headline` get the composed
  // layout — host anchored at the left third, serif headline + sub filling
  // the right two-thirds (the v1 centered-host layout left the middle 40% of
  // the frame empty ivory; panel verdict 3/10). Beats with a chartstand /
  // kclimb / kdescend stage keep the legacy stage dressing.
  const stage = (g.s.stage as string) || 'spot';
  if (g.s.headline && stage === 'spot') {
    hostSceneV2(g);
    return;
  }
  const side = (g.s.hostSide as string) || (g.s.stage === 'chartstand' ? 'left' : 'center');
  hostStage(g, side as 'center' | 'left' | 'right');
  drawHost(g, side as 'center' | 'left' | 'right');
  hostChips(g, side as 'center' | 'left' | 'right');
}

/**
 * hostSceneV2 (PATCH 9) — editorial composition for pure host moments.
 * Host at the left third (rule of thirds), kicker chip + serif headline
 * (line 2 in gold) + hairline + sub copy filling the right two-thirds,
 * over a faint editorial column grid. Uses the v2 tapered-ink stickman
 * (PATCH 3). Rendered proof: panel frame A-hostscene-v2.png — graded
 * 8.5/10 by the vision panel vs 3/10 before.
 */
export function hostSceneV2(g: SceneCtx): void {
  const { ctx, W, H, t } = g;

  // ── stage: bg + soft bokeh + faint editorial column grid ──
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 0.85, seed: 7 });
  lightRays(ctx, W, H, t, { alpha: 0.45 });
  kMotifs(ctx, W, H, t, 0.04);
  ctx.strokeStyle = rgba('#8C8474', 0.07);
  ctx.lineWidth = 1.5;
  [W * 0.36, W * 0.62].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, H - 160); ctx.stroke();
  });

  // ── host at the left third, walking in then presenting ──
  const entrance = g.s.entrance as string | undefined;
  const hxTarget = W * 0.28;
  const walkP = entrance === 'walk' ? clamp01(t / 900) : 1;
  const ease = easeOutCubic(walkP);
  const hx = entrance === 'walk' ? hxTarget - 560 * (1 - ease) : hxTarget;
  const pose = Stickman.poseAt(t, {
    gesture: walkP < 0.98 ? 'idle' : (g.s.gesture ?? 'present'),
    speaking: g.speaking,
  });
  // v3 (panel P0-4): nods + articulate mouth on the editorial host too
  const nodP = g.speaking ? nodPulse(g.beatT, g.wordTimes) : 0;
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(
    ctx, hx, H * 0.80, 1.42, t,
    { pose, alpha: clamp01(t / 380), look: 0.8, scarf: true, nod: nodP, talk },
    11
  );

  // ── editorial type block, right two-thirds ──
  const hx2 = W * 0.42;
  const head = (g.s.headline as string) ?? 'Two numbers\nthat don’t add up.';
  const lines = head.split('\n');
  const sub = (g.s.sub as string) ??
    'Markets near record highs — and a country that feels like it’s\nfalling behind. Both are true.';

  // kicker chip
  const kick = (g.s.kicker as string) ?? 'THE K-SHAPED ECONOMY · CH 01';
  setFont(ctx, 26, 600);
  const kw = ctx.measureText(kick).width;
  const ap = clamp01((t - 150) / 500);
  if (ap > 0) {
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, hx2, 168, kw + 48, 52, 26);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.gold, 0.8);
    ctx.lineWidth = 2;
    roundRect(ctx, hx2, 168, kw + 48, 52, 26);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText(kick, hx2 + 24, 202);
    ctx.restore();
  }

  // serif headline (line 2 in gold)
  const hp = clamp01((t - 300) / 650);
  if (hp > 0) {
    ctx.save();
    ctx.globalAlpha = hp;
    setFont(ctx, 88, 700, FONT_SERIF);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(lines[0], hx2, 330);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(lines[1] ?? '', hx2, 428);
    // hairline + sub copy
    ctx.fillStyle = PALETTE.gold;
    roundRect(ctx, hx2, 468, 96, 6, 3);
    ctx.fill();
    setFont(ctx, 34, 400);
    ctx.fillStyle = PALETTE.inkSoft;
    sub.split('\n').forEach((ln, i) => ctx.fillText(ln, hx2, 540 + i * 44));
    ctx.restore();
  }
}

// ── splitNumbers: the cold-open two-sided reveal ─────────────────────────────
interface StatItem {
  big: string;
  label: string;
  tone?: string;
}

export function splitNumbersScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 0.7, seed: 12 });
  const mode = (s.mode as string) || 'left';

  const panelW = W * 0.38;
  // v2 (PATCH 4 follow-up): panels slightly shorter + higher, freeing a
  // clean anchored statement slot below them and clear of the caption pill
  // (2-row pill top sits at y≈808; the statement slot centers at y≈752).
  const panelH = H * 0.48;
  const lx = W * 0.07;
  const rx = W * 0.55;
  const py = H * 0.17;
  const cornerNote = s.cornerNote as string | undefined;

  if (mode === 'left' || mode === 'vs' || mode === 'vs-punch') {
    // v3 (panel P1-6): the market panel reads the script's `stats` prop
    // (previously allowed-but-unread — the panel's validator caught it);
    // the hardcoded list stays as the fallback.
    const marketStats: StatItem[] = (s.stats as StatItem[]) || [
      { big: '+18%', label: 'S&P 500 · past year', tone: 'up' },
      { big: '+20%', label: 'Nasdaq · past year', tone: 'up' },
      { big: 'RECORD', label: 'corporate profit margins', tone: 'gold' },
    ];
    // v4 (audit P1-5): break the mirror — the market panel rides 44px
    // higher than the mood panel so the divergence is felt in the layout
    // itself, not just in the numbers.
    drawNumberPanel(g, lx, py - 22, panelW, panelH, 'THE MARKET', marketStats, t, 0);
  }
  if (mode === 'right' || mode === 'vs' || mode === 'vs-punch') {
    const delay = mode === 'vs' || mode === 'vs-punch' ? 300 : 0;
    drawNumberPanel(g, rx, py + 22, panelW, panelH, 'THE MOOD', [
      { big: '16%', label: 'called the economy “good” or “excellent”', tone: 'down' },
      { big: '1 in 4', label: 'average recession odds · 72 economists (WSJ)', tone: 'down' },
    ], t, delay);
  }
  if (mode === 'vs' || mode === 'vs-punch') {
    // divider + anchored statement slot (PATCH 4 follow-up).
    // v1 drew 'SAME COUNTRY. / SAME YEAR.' at y≈860-910 — inside the caption
    // pill zone, where it ghosted through the subtitle plate. v2 anchors ONE
    // statement chip below the panels (y≈752, clear of both the panels and a
    // 2-row caption pill); in punch mode the payoff line swaps into the slot.
    const ap = clamp01((t - 500) / 600);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.strokeStyle = rgba('#B9B4A6', 0.8);
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 12]);
    ctx.beginPath();
    ctx.moveTo(W / 2, py + 30);
    ctx.lineTo(W / 2, py + panelH - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    const chipLine = (text: string, y: number, size: number, fg: string, bg: string): void => {
      setFont(ctx, size, 700);
      const tw = ctx.measureText(text).width;
      const ch = size * 1.5;
      ctx.fillStyle = bg;
      roundRect(ctx, W / 2 - tw / 2 - 24, y - ch / 2, tw + 48, ch, ch / 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba('#B9B4A6', 0.45);
      roundRect(ctx, W / 2 - tw / 2 - 24, y - ch / 2, tw + 48, ch, ch / 2);
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, y + size * 0.35);
    };
    const slotY = py + panelH + 50; // ≈ 752 — between panels and caption zone
    if (mode === 'vs-punch' && t > 700) {
      // payoff line swaps into the slot
      const pp = clamp01((t - 700) / 500);
      ctx.globalAlpha = ap * pp;
      chipLine('TWO COMPLETELY DIFFERENT STORIES.', slotY, 40, PALETTE.goldDeep, PALETTE.goldWash);
    } else {
      chipLine('SAME COUNTRY. SAME YEAR.', slotY, 34, PALETTE.ink, rgba('#FFFFFF', 0.96));
    }
    ctx.restore();
  }
  if (cornerNote) {
    const ap = clamp01((t - 1600) / 700);
    if (ap > 0) {
      setFont(ctx, 23, 600);
      const tw = ctx.measureText(cornerNote).width;
      ctx.save();
      ctx.globalAlpha = ap * 0.9;
      ctx.fillStyle = rgba('#FFFFFF', 0.92);
      // v5: was H-210 (y 870–914) — inside the caption pill band, grazing
      // wide pills (the v4 panel already called it “extremely close”).
      // Now it sits in the deliberate gap BELOW the pill (bottom ≈ 956) and
      // above the progress bar, right-aligned opposite the source tag.
      roundRect(ctx, W - tw - 160, H - 112, tw + 44, 44, 22);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba('#B9B4A6', 0.6);
      roundRect(ctx, W - tw - 160, H - 112, tw + 44, 44, 22);
      ctx.stroke();
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.textAlign = 'left';
      ctx.fillText(cornerNote, W - tw - 138, H - 83);
      ctx.restore();
    }
  }
}

function drawNumberPanel(
  g: SceneCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  kicker: string,
  stats: StatItem[],
  t: number,
  delay: number
): void {
  const { ctx } = g;
  const ap = clamp01((t - delay) / 650);
  if (ap <= 0) return;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 40);
  card(ctx, x, y, w, h, { r: 34 });
  setFont(ctx, 27, 600);
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.textAlign = 'left';
  ctx.fillText(kicker, x + 44, y + 66);
  // accent rail — v4 (audit P1-5): full-width tone rail instead of a 72px
  // sliver, so THE MARKET reads unmistakably teal and THE MOOD coral before
  // a single numeral is read (the vision panel called the sliver “a glitch”)
  ctx.fillStyle = kicker === 'THE MARKET' ? PALETTE.up : PALETTE.down;
  roundRect(ctx, x + 44, y + 84, w - 88, 8, 4);
  ctx.fill();
  // v4 (audit P0-2): row rhythm widens only when a label actually wraps
  const rowGap = stats.some((st) => wrapText(ctx, st.label, w - 88, 25, 600).length > 1) ? 138 : 118;
  stats.forEach((st, i) => {
    const sa = clamp01((t - delay - 350 - i * 480) / 600);
    if (sa <= 0) return;
    const sy = y + 160 + i * rowGap;
    ctx.globalAlpha = ap * sa;
    const tone = TONE(st.tone);
    setFont(ctx, 74, 700);
    ctx.fillStyle = tone.main;
    ctx.fillText(st.big, x + 44, sy + 62);
    // v4 (audit P0-2): wrap, never truncate. The v3 line hard-cut labels at
    // 33 characters with an ellipsis even when they FIT the panel — the
    // cold open shipped “called the economy “good” or “excell…””. Two wrap
    // lines max; if the wrapped stack would overrun the panel body the
    // label auto-shrinks onto one line instead (never truncates).
    setFont(ctx, 25, 600);
    let lines = wrapText(ctx, st.label, w - 88, 25, 600).slice(0, 2);
    const stackedBottom = 160 + (stats.length - 1) * rowGap + 132;
    if (lines.length > 1 && stackedBottom > h - 18) {
      let size = 25;
      while (ctx.measureText(st.label).width > w - 88 && size > 19) {
        size -= 1;
        setFont(ctx, size, 600);
      }
      lines = [st.label];
    }
    ctx.fillStyle = PALETTE.inkSoft;
    lines.forEach((ln, j) => ctx.fillText(ln, x + 44, sy + 100 + j * 32));
  });
  ctx.restore();
}

// ── divergeK: the signature moment — two lines become the letter K ──────────
export function divergeKScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 1.1, seed: 21, gold: 0.6 });
  lightRays(ctx, W, H, t, { alpha: 0.8 });

  const kx = W * 0.58;
  const ky = H * 0.47;
  const S = 210;

  // two diverging lines grow out of one point
  const growP = clamp01((t - 400) / 2300);
  const upP = clamp01((t - 400) / 1900);
  const dnP = clamp01((t - 1100) / 1900);

  ctx.save();
  ctx.lineCap = 'round';
  // up line (gold) with traveling dot
  if (upP > 0) {
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * upP, ky - S * 1.05 * upP);
    ctx.stroke();
    glowBlob(ctx, kx + S * 1.15 * upP, ky - S * 1.05 * upP, 42, PALETTE.up, 0.4);
  }
  // down line (coral)
  if (dnP > 0) {
    ctx.strokeStyle = PALETTE.down;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * dnP, ky + S * 1.05 * dnP);
    ctx.stroke();
    glowBlob(ctx, kx + S * 1.15 * dnP, ky + S * 1.05 * dnP, 42, PALETTE.down, 0.4);
  }
  ctx.restore();

  // the full K fades in as the lines complete (the lines ARE the K)
  if (growP > 0.55) {
    const kA = clamp01((growP - 0.55) / 0.45);
    ctx.save();
    ctx.globalAlpha = kA;
    drawK3D(ctx, kx, ky, S, 1, t);
    ctx.restore();
    // small population dots riding each arm
    const dotA = clamp01((t - 2600) / 600);
    if (dotA > 0) {
      ctx.fillStyle = PALETTE.up;
      ctx.beginPath();
      ctx.arc(kx + S * 0.9, ky - S * 0.82, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.down;
      ctx.beginPath();
      ctx.arc(kx + S * 0.9, ky + S * 0.82, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // v5 (audit P1-3): the K's lower arm personified — a second character
    // (same rig, coffee mug instead of the host's scarf) stands at the coral
    // arm's tip, gently bobbing: the "bottom half of the K" now has a face.
    // He faces the vertex/host (flip) and appears once the arms complete;
    // drawn BEFORE the arm labels so THE MOOD stays crisp on top of his soft
    // ground shadow, and he clears the caption zone (feet ≈ y 734).
    const bob = Math.sin(t / 850) * 4;
    const sp2 = clamp01((t - 3000) / 700);
    if (sp2 > 0) {
      const pose2 = Stickman.poseAt(t, { gesture: 'close', speaking: false, seed: 9 });
      drawStickmanV2(ctx, kx + S * 1.15 + 8, ky + S * 1.05 + 6 + bob, 0.55, t,
        { pose: pose2, alpha: sp2 * 0.96, flip: true, look: -0.7, scarf: false, prop: 'coffee' }, 9);
    }
  }

  // labels on the arms — v4 (audit P0-6): hidden in `opening` mode so the
  // cold open teases the shape and the naming beat (c1-k) lands the reveal
  const opening = s.opening === true;
  const lblA = clamp01((t - 3000) / 700);
  if (lblA > 0 && !opening) {
    ctx.save();
    ctx.globalAlpha = lblA;
    setFont(ctx, 30, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.up;
    ctx.fillText('THE MARKET', kx + S * 1.35, ky - S * 1.05);
    ctx.fillStyle = PALETTE.down;
    ctx.fillText('THE MOOD', kx + S * 1.35, ky + S * 1.25);
    setFont(ctx, 44, 700);
    ctx.fillStyle = PALETTE.ink;
    // v5: was ky + S*1.75 (y≈875) — under the caption pill, half-plated by
    // its opaque white. Now a proper sub-caption directly under the K's
    // waist, clear of the chip (top 744) and the pill zone (800+).
    ctx.fillText('the K-shaped economy', kx - S * 1.5, ky + S * 0.95);
    ctx.restore();
  }

  // twist chip — v4 (audit P0-6): held from the first scene; in the opening
  // beat it arrives at ~2.8s (mid cold-open), otherwise at 4.2s as before
  if (s.twistChip) {
    const ap = clamp01((t - (opening ? 2800 : 4200)) / 800);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const txt = 'a twist for your portfolio — later in this video';
      setFont(ctx, 26, 600);
      const tw = ctx.measureText(txt).width;
      const cx = W / 2 - tw / 2 - 28;
      // v5: the chip lived at H-236 — INSIDE the caption pill's band
      // (808–956), so whenever a caption was live the opaque pill plated
      // over the chip and left a garbled gold sliver (vision panel: “a
      // messy yellow highlight over the subtitle”). It now rides fully
      // ABOVE the pill zone, 10px clear of a two-row pill's top edge.
      const cy = CAPTION_ZONE_TOP - 56;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, cx, cy, tw + 56, 54, 27);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, cx, cy, tw + 56, 54, 27);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(txt, cx + 28, cy + 35);
      ctx.restore();
    }
  }

  // host on the left presenting the K — v3 (panel P0-3): v2 renderer, same
  // body style as every other scene
  const hx = W * 0.19;
  const hy = H * 0.8;
  // v5 (audit P1-3): as the K completes, the host leans INTO it — the
  // signature scene now has a third act of body language (present → leanIn)
  const pose = Stickman.poseAt(t, { gesture: upP < 0.5 ? 'present' : 'leanIn', speaking: g.speaking });
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(ctx, hx, hy, 1.05, t, { pose, alpha: clamp01(t / 400), look: 0.9, talk }, 5);
  softBloom(ctx, W, H, t - 3800, 180); // v2: warm 12% bloom, not a white strobe (PATCH 5)
}

// ── channelIntro: branding beat ──────────────────────────────────────────────
export function channelIntroScene(g: SceneCtx): void {
  const { ctx, W, H, t, channelName } = g;
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 1, seed: 33, gold: 0.6 });
  const cx = W / 2;
  const cy = H * 0.4;

  // logo: gold K in rounded square + rising data bars
  const ap = easeOutCubic(clamp01(t / 700));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.9 + 0.1 * ap, 0.9 + 0.1 * ap);
  ctx.globalAlpha = ap;
  const sq = 150;
  ctx.fillStyle = PALETTE.goldWash;
  roundRect(ctx, -sq / 2, -sq / 2, sq, sq, 38);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE.gold;
  roundRect(ctx, -sq / 2, -sq / 2, sq, sq, 38);
  ctx.stroke();
  drawK(ctx, 6, 0, 46, 11, PALETTE.goldDeep, 1);
  ctx.restore();

  // data bars under logo
  for (let i = 0; i < 5; i++) {
    const bp = clamp01((t - 400 - i * 140) / 600);
    const bh = (26 + i * 22) * easeOutCubic(bp);
    ctx.fillStyle = i === 4 ? PALETTE.gold : rgba(PALETTE.up, 0.65);
    roundRect(ctx, cx - 130 + i * 66, cy + 150 - bh, 40, Math.max(6, bh), 10);
    ctx.fill();
  }

  // channel name + tagline
  const np = clamp01((t - 800) / 700);
  if (np > 0) {
    ctx.save();
    ctx.globalAlpha = np;
    ctx.textAlign = 'center';
    setFont(ctx, 64, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(channelName.toUpperCase(), cx, cy + 250);
    setFont(ctx, 32, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('growing capital with actual data — not hot takes', cx, cy + 310);
    ctx.restore();
  }
  // "full range" motto chip
  const mp = clamp01((t - 1500) / 700);
  if (mp > 0) {
    ctx.save();
    ctx.globalAlpha = mp;
    ctx.textAlign = 'center';
    setFont(ctx, 28, 600);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText('the whole range — never just the best headline', cx, cy + 380);
    ctx.restore();
  }

  // host peeking from right, waving — v3 (panel P0-3): v2 renderer
  const pose = blendPose(POSES.wave, POSES.wave, 0);
  const wavePose = {
    ...pose,
    rAL: pose.rAL + Math.sin(t / 160) * 14,
  };
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(ctx, W * 0.85, H * 0.82, 0.98, t, { pose: wavePose, alpha: clamp01((t - 600) / 500), look: -0.6, talk }, 9);
}

// ── recapSplit (used at ch5 open and ch10 open) ─────────────────────────────
export function recapSplitScene(g: SceneCtx): void {
  const { ctx, W, H, t } = g;
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 0.8, seed: 44 });
  const pw = W * 0.36;
  const ph = H * 0.34;
  const py = H * 0.24;
  // left mini panel: market
  miniPanel(g, W * 0.09, py, pw, ph, 'MARKETS', 'near record highs', PALETTE.up, 0);
  // right mini panel: sentiment
  miniPanel(g, W * 0.55, py, pw, ph, 'SENTIMENT', 'crashed — partly recovered', PALETTE.down, 260);
  // big = sign between them becoming K
  const kp = clamp01((t - 900) / 900);
  if (kp > 0) {
    ctx.save();
    ctx.globalAlpha = easeInOutSine(kp);
    ctx.textAlign = 'center';
    setFont(ctx, 120, 400);
    ctx.fillStyle = rgba(PALETTE.goldDeep, 0.9);
    ctx.fillText('=', W / 2, py + ph * 0.66);
    ctx.restore();
  }
  const morph = clamp01((t - 1600) / 800);
  if (morph > 0) {
    ctx.save();
    ctx.globalAlpha = morph;
    ctx.translate(W / 2, py + ph * 0.6);
    ctx.rotate(-Math.PI / 2 * (1 - morph));
    drawK(ctx, 0, 0, 84, 14, PALETTE.ink, 1);
    ctx.restore();
  }
  const motto = g.s.motto as string | undefined;
  if (motto) {
    const mp2 = clamp01((t - 2400) / 700);
    if (mp2 > 0) {
      ctx.save();
      ctx.globalAlpha = mp2;
      ctx.textAlign = 'center';
      setFont(ctx, 40, 700);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(motto, W / 2, py + ph + 150);
      ctx.restore();
    }
  } else {
    const lp = clamp01((t - 2200) / 700);
    if (lp > 0) {
      ctx.save();
      ctx.globalAlpha = lp;
      ctx.textAlign = 'center';
      setFont(ctx, 36, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText('same economy · same months', W / 2, py + ph + 140);
      ctx.restore();
    }
  }
  // host small at bottom right — v3 (panel P0-3): v2 renderer + talk
  const pose = Stickman.poseAt(t, { gesture: 'present', speaking: g.speaking });
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(ctx, W * 0.86, H * 0.84, 0.86, t, { pose, alpha: clamp01((t - 700) / 500), look: -0.4, talk }, 17);
}

function miniPanel(
  g: SceneCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub: string,
  tone: string,
  delay: number
): void {
  const { ctx, t } = g;
  const ap = clamp01((t - delay) / 600);
  if (ap <= 0) return;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 30);
  card(ctx, x, y, w, h, { r: 28 });
  setFont(ctx, 28, 700);
  ctx.fillStyle = tone;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 38, y + 62);
  setFont(ctx, 27, 600);
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.fillText(sub, x + 38, y + 108);
  // sparkline
  const rising = tone === PALETTE.up;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const fx = x + 38 + (i / 10) * (w - 76);
    const v = rising
      ? Math.sin(i / 10 * Math.PI * 0.9) * 0.6 + i / 10 * 0.4
      : 0.8 - Math.sin(i / 10 * Math.PI * 0.8) * 0.5 - i / 10 * 0.15;
    const fy = y + h - 52 - v * (h - 150);
    if (i === 0) ctx.moveTo(fx, fy);
    else ctx.lineTo(fx, fy);
  }
  ctx.stroke();
  ctx.restore();
}

// ── paradoxResolve: the headline paradox resolves into the K ────────────────
export function paradoxResolveScene(g: SceneCtx): void {
  const { ctx, W, H, t } = g;
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 0.9, seed: 55, gold: 0.55 });
  const cx = W / 2;
  // the word "PARADOX" appears, then strikes through
  const wp = clamp01(t / 700);
  const sp = clamp01((t - 1400) / 600);
  ctx.save();
  ctx.globalAlpha = wp;
  ctx.textAlign = 'center';
  setFont(ctx, 96, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText('PARADOX', cx, H * 0.34);
  if (sp > 0) {
    ctx.strokeStyle = PALETTE.down;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    const sw = 460;
    ctx.beginPath();
    ctx.moveTo(cx - sw / 2, H * 0.34 - 36);
    ctx.lineTo(cx - sw / 2 + sw * easeOutCubic(sp), H * 0.34 - 20);
    ctx.stroke();
  }
  ctx.restore();
  // resolves into K + takeaway lines
  const kp = clamp01((t - 2200) / 900);
  if (kp > 0) {
    ctx.save();
    ctx.globalAlpha = kp;
    drawK3D(ctx, cx, H * 0.6, 120, 1, t);
    ctx.restore();
  }
  const lines = [
    'record highs — and most of the country left behind',
    'because most of it was never really in the market',
    'and those in it have more riding on it than ever',
  ];
  lines.forEach((ln, i) => {
    const lp = clamp01((t - 2800 - i * 700) / 700);
    if (lp <= 0) return;
    ctx.save();
    ctx.globalAlpha = lp;
    ctx.textAlign = 'center';
    setFont(ctx, 32, 600);
    ctx.fillStyle = i === 2 ? PALETTE.goldDeep : PALETTE.inkSoft;
    ctx.fillText(ln, cx, H * 0.6 + 220 + i * 52);
    ctx.restore();
  });
  const pose = Stickman.poseAt(t, { gesture: 'aha', speaking: g.speaking });
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(ctx, W * 0.14, H * 0.82, 1.0, t, { pose, alpha: clamp01((t - 600) / 500), look: 0.5, talk }, 23);
}

export { sourceTag, slideUp, lerp, easeOutQuad };
