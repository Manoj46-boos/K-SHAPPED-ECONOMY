/**
 * Text & emotional beats: the hard-cut statement, stamp card, quote/caveat
 * cards, takeaways, comment prompt, and the end screen.
 */

import { clamp01, easeInOutSine, easeOutBack, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, TONE, card, rgba, roundRect, setFont, paintBg, FONT_DISPLAY, FONT_UI } from './theme';
import { bokehField, lightRays, softBloom, sparkles, drawK3D, kMotifs, floatCoins } from './effects';
import { SceneCtx } from './scene-context';
import { Stickman, POSES, blendPose } from './stickman';
import { drawStickmanV2 } from './stickman-v2';
import { wrapText } from './charts';

function bg(g: SceneCtx, seed: number, gold = 0.4): void {
  paintBg(g.ctx, g.W, g.H, g.t, g.chapterTone);
  bokehField(g.ctx, g.W, g.H, g.t, { intensity: 0.85, seed, gold });
  lightRays(g.ctx, g.W, g.H, g.t, { alpha: 0.5 });
}

// ── bigText: the hard cut ────────────────────────────────────────────────────
export function bigTextScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t, g.chapterTone);
  softBloom(ctx, W, H, t, 180); // v2: warm 12% bloom, not a white strobe (PATCH 5)
  const lines = (s.lines as string[]) || [];
  // P1-2 (report): the lines SNAP in as ONE block (80ms + a single 260ms
  // ramp — both lines solid by ~340ms) instead of the v5 per-line fade
  // (160 + 620 stagger + 700ms ramp, full at 860ms+). Two reasons: (1) the
  // director's bigText ANTICIPATION recoil peaks at ~350ms — it must land
  // on the COMPLETE statement, or the wind-up reads as a fade (the panel's
  // round-3 note); (2) a statement beat is one thought — "SEVEN COMPANIES.
  // OUT OF FIVE HUNDRED." lands harder as a single slam than as a two-step
  // reveal. The per-line stagger survives via the two-tone color split.
  lines.forEach((ln, i) => {
    const ap = clamp01((t - 80) / 260);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    const scale = 0.94 + 0.06 * easeOutBack(ap);
    // v10 (panel TYPE-2): EDITORIAL SIZE HIERARCHY — line 1 is the statement
    // in inkDeep (the display ink, 11.9:1), line 2 the punchline in goldDeep.
    // v10.1 (panel 11 re-review): the v10 step (108 → 88, a 19% ratio) still
    // read as "two lines near-equal in scale" — a couplet, not a headline.
    // The hierarchy is now unambiguous: line 1 at 118px (auto-fit to 1660),
    // line 2 at 62px/600 — a 1.9× editorial ratio, statement + kicker.
    const size = i === 0 ? 118 : 62;
    ctx.translate(W / 2, H * 0.36 + i * 118);
    ctx.scale(scale, scale);
    if (i === 0) {
      setFont(ctx, size, 700, FONT_DISPLAY);
      let s = size;
      while (ctx.measureText(ln).width > 1660 && s > 72) {
        s -= 2;
        setFont(ctx, s, 700, FONT_DISPLAY);
      }
    } else {
      setFont(ctx, size, 600, FONT_DISPLAY);
    }
    ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.inkDeep;
    ctx.fillText(ln, 0, 0);
    ctx.restore();
  });
  // supportive underline
  const up2 = clamp01((t - 1500) / 700);
  if (up2 > 0) {
    ctx.save();
    ctx.globalAlpha = up2;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const w = 420 * easeOutCubic(up2);
    ctx.beginPath();
    ctx.moveTo(W / 2 - w / 2, H * 0.66);
    ctx.lineTo(W / 2 + w / 2, H * 0.66);
    ctx.stroke();
    ctx.restore();
  }
  if (t > 1800) sparkles(ctx, W / 2, H * 0.42, t, t - 1800, { count: 10, radius: 260 });
  const hp = clamp01((t - 2200) / 600);
  if (hp > 0) {
    const pose = Stickman.poseAt(t, { gesture: 'count2', speaking: false });
    // v3 (panel P0-3): v2 renderer — one body style across the whole film
    // P1-1 (report): +30% (0.9 → 1.17); ground 756 → 726 (envelope bottom 768,
    // clear of the worst-case 2-row pill envelope 776).
    drawStickmanV2(ctx, W * 0.86, H * 0.672, 1.17, t, { pose, alpha: hp, look: -0.6 }, 31);
  }
}

// ── stampCard: "RECORD HIGHS — ACCURATE" ─────────────────────────────────────
export function stampCardScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 221, 0.55);
  const cx = W / 2;
  const cy = H * 0.42;
  const ap = clamp01(t / 500);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.globalAlpha = ap;
  const scale = 1 + (1 - easeOutBack(ap)) * 0.4;
  ctx.scale(scale, scale);
  const txt = (s.stamp as string) || 'RECORD HIGHS';
  setFont(ctx, 110, 700, FONT_DISPLAY);
  const tw = ctx.measureText(txt).width;
  // v8 (vision panel): the stamp frame strokes crossed THROUGH the
  // letterforms and muddied the R-E-C. A white knockout plate behind the
  // type keeps the brushed-frame energy while the word stays crisp.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, -tw / 2 - 44, -104, tw + 88, 148, 16);
  ctx.fill();
  ctx.restore();
  // stamp frame
  ctx.strokeStyle = PALETTE.up;
  ctx.lineWidth = 10;
  roundRect(ctx, -tw / 2 - 60, -110, tw + 120, 170, 18);
  ctx.stroke();
  ctx.fillStyle = PALETTE.up;
  // v8.1 root-cause fix: the word drew LEFT-anchored at local x=0 (the
  // frame/plate geometry assumes a centred word), so the stamp started at
  // the frame's centre line and overflowed right — the frame's edges cut
  // straight through the letterforms. This is the defect BOTH vision
  // reviews kept flagging; the knockout plate alone couldn't fix it
  // because the plate shares the same centred assumption.
  ctx.textAlign = 'center';
  ctx.fillText(txt, 0, 24);
  ctx.restore();
  // checkmark + sub
  const cp = clamp01((t - 700) / 700);
  if (cp > 0) {
    ctx.save();
    ctx.globalAlpha = cp;
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    // v8.1 recheck: the check sat at cx+250 — inside the word's extent,
    // its 14px strokes striking the letterforms. It now clears the stamp
    // frame entirely (frame edge is cx + tw/2 + 60).
    const cxx = cx + tw / 2 + 130;
    const cyy = cy + 40;
    ctx.beginPath();
    ctx.moveTo(cxx - 26, cyy);
    ctx.lineTo(cxx - 6, cyy + 20 * easeOutCubic(cp));
    ctx.stroke();
    if (cp > 0.4) {
      ctx.beginPath();
      ctx.moveTo(cxx - 6, cyy + 20);
      ctx.lineTo(cxx + 30, cyy - 26 * clamp01((cp - 0.4) / 0.6));
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    setFont(ctx, 40, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(s.sub as string, cx, cy + 160);
    ctx.restore();
    if (cp >= 1) sparkles(ctx, cx, cy, t, t - 1400, { count: 14, radius: 320 });
  }
  // host nodding
  const hp = clamp01((t - 900) / 600);
  if (hp > 0) {
    const pose = { ...POSES.close, headTilt: Math.sin(t / 700) * 4 };
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
    drawStickmanV2(ctx, W * 0.14, H * 0.667, 1.3, t, { pose, alpha: hp, look: 0.6 }, 32);
  }
}

// ── quoteCard: caveats, quotes, disclaimer ───────────────────────────────────
export function quoteCardScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 231);
  const soft = !!s.soft;
  const lines = (s.lines as string[]) || [];
  const ap = clamp01(t / 700);
  const cw = 980;
  const x = W / 2 - cw / 2;
  const y = H * 0.24;
  // PANEL-9 R7h (caveat lines colliding inside the card): ch was a flat
  // 200 + lines.length*60 — one 60px slot per line — but lines WRAP at
  // cw-160 = 820px, and a wrapped second row (46px below the first) crashed
  // into the NEXT line's slot (c4-caveat: "reignited" printed 22px under
  // "most interviews wrapped…", on top of "the mood by the time you
  // watch…"). The card is now sized from MEASURED wrapped rows: 46px
  // leading inside a wrap, 68px between logical lines, real bottom padding.
  const wrapped = lines.map((ln) => wrapText(ctx, ln, cw - 160, 36, 600));
  const ch =
    168 +
    wrapped.reduce((a, ls) => a + ls.length * 46, 0) +
    Math.max(0, lines.length - 1) * 22;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 36);
  card(ctx, x, y, cw, ch, { r: 34 });
  // accent
  ctx.fillStyle = soft ? rgba(PALETTE.grid, 0.9) : PALETTE.gold;
  roundRect(ctx, x + 44, y + 40, 8, ch - 80, 4);
  ctx.fill();
  // kicker
  setFont(ctx, 28, 700); // v9 (D-07): floor
  ctx.fillStyle = soft ? PALETTE.inkFaint : PALETTE.goldDeep;
  ctx.textAlign = 'left';
  ctx.fillText((s.kicker as string).toUpperCase(), x + 84, y + 78);
  // lines — R7h: running cursor; each logical line advances by its own
  // wrapped row count (was a flat i*68 slot that wrapped rows overprinted)
  setFont(ctx, 36, 600);
  ctx.fillStyle = PALETTE.ink;
  let lnY = y + 148;
  lines.forEach((ln, i) => {
    const lp = clamp01((t - 350 - i * 420) / 650);
    if (lp <= 0) return;
    ctx.globalAlpha = ap * lp;
    wrapped[i].forEach((wl) => {
      ctx.fillText(wl, x + 84, lnY);
      lnY += 46;
    });
    lnY += 22;
  });
  // icon
  const icon = s.icon as string;
  const ip = clamp01((t - 200) / 600);
  if (ip > 0) {
    ctx.globalAlpha = ap * ip;
    const ix = x + cw - 120;
    const iy = y + 80;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    if (icon === 'asterisk') {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(ix - Math.cos(a) * 26, iy - Math.sin(a) * 26);
        ctx.lineTo(ix + Math.cos(a) * 26, iy + Math.sin(a) * 26);
        ctx.stroke();
      }
    } else if (icon === 'shield') {
      ctx.beginPath();
      ctx.moveTo(ix, iy - 28);
      ctx.lineTo(ix + 24, iy - 16);
      ctx.lineTo(ix + 24, iy + 8);
      ctx.quadraticCurveTo(ix, iy + 32, ix - 24, iy + 8);
      ctx.lineTo(ix - 24, iy - 16);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix - 9, iy);
      ctx.lineTo(ix - 2, iy + 9);
      ctx.lineTo(ix + 11, iy - 9);
      ctx.stroke();
    }
  }
  ctx.restore();
  // host reacting
  const hp = clamp01((t - 800) / 600);
  if (hp > 0) {
    const gesture = (s.hostGesture as string) || 'think';
    const pose = Stickman.poseAt(t, { gesture, speaking: false });
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (0.94 → 1.22); ground → H*0.672 (envelope 770).
    drawStickmanV2(ctx, W * 0.85, H * 0.672, 1.22, t, { pose, alpha: hp, look: -0.7 }, 33);
  }
}

// ── takeaways: numbered cards 1-2-3 ──────────────────────────────────────────
export function takeawaysScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 241, 0.5);
  const focus = (s.focus as number) ?? 0;
  sceneTitleLocal(ctx, focus === 0 ? 'Three things worth sitting with' : `Takeaway ${focus}`, 110, 150, clamp01(t / 600), W);
  if (focus === 0) {
    // intro: three cards float + host counting
    for (let i = 0; i < 3; i++) {
      const ap = clamp01((t - 300 - i * 380) / 700);
      if (ap <= 0) continue;
      const x = W * 0.2 + i * (W * 0.22);
      const y = H * 0.3 + Math.sin(t / 900 + i * 2) * 10;
      ctx.save();
      ctx.globalAlpha = ap;
      card(ctx, x, y, W * 0.18, 220, { r: 30 });
      setFont(ctx, 92, 700, FONT_DISPLAY);
      ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.ink;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x + W * 0.09, y + 130);
      ctx.restore();
    }
    const pose = Stickman.poseAt(t, {
      gesture: t % 5000 < 2500 ? 'count1' : 'count2',
      speaking: false,
    });
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
    drawStickmanV2(ctx, W * 0.82, H * 0.667, 1.3, t, { pose, alpha: clamp01(t / 600), look: -0.5 }, 34);
  } else {
    // focused card zooms; other two minimized to the left rail
    for (let i = 1; i <= 3; i++) {
      const isFocus = i === focus;
      const ap = clamp01((t - (isFocus ? 150 : 400)) / 650);
      if (ap <= 0) continue;
      if (!isFocus) {
        // dim rail numbers
        const x = 110 + (i - 1) * 120;
        ctx.save();
        ctx.globalAlpha = ap * 0.35;
        setFont(ctx, 66, 700, FONT_DISPLAY);
        ctx.fillStyle = PALETTE.inkFaint;
        ctx.textAlign = 'left';
        ctx.fillText(String(i), x, H * 0.3);
        ctx.restore();
      }
    }
    // big focused card
    const ap = clamp01(t / 700);
    const cw = W * 0.62;
    const x = W * 0.28;
    // PANEL-9 R7g (takeaway text overflowing the card): the card height was
    // a flat 170 + pts.length*76 — one 76px slot per point — but points WRAP
    // (cw-260 ≈ 930px at 30px type), and the last point's baseline landed
    // exactly on the card's bottom edge (c9-one: "2026's small-cap rotation…"
    // half-in/half-out, flagged by the re-review). The card is now sized
    // from MEASURED content: wrapped line counts per point, 36px between
    // points, real bottom padding; the card starts at H*0.16 so even the
    // tallest stack (c9-two: 2-line title + a 2-line point) bottoms out
    // ≈699 — clear of CAPTION_ZONE_TOP with ~95px spare. A compress fallback
    // (36→22 gaps, 40→36 leading) is the safety net if future copy grows.
    const y = H * 0.16;
    const pts = (s.points as string[]) || [];
    const titleLines = wrapText(ctx, s.title as string, cw - 260, 44, 700);
    const pointLines = pts.map((pt) => wrapText(ctx, pt, cw - 260, 30, 600));
    let ptGap = 36;
    let lineStep = 40;
    const stackH = (gap: number, step: number): number =>
      182 + titleLines.length * 56 +
      pointLines.reduce((a, ls) => a + ls.length * step, 0) +
      Math.max(0, pointLines.length - 1) * gap;
    let ch = stackH(ptGap, lineStep);
    if (y + ch > 780 && ch > 220) {
      ptGap = 22;
      lineStep = 36;
      ch = stackH(ptGap, lineStep);
    }
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate(0, (1 - easeOutCubic(ap)) * 40);
    const scale = 0.96 + 0.04 * easeOutBack(ap);
    ctx.translate(x + cw / 2, y + ch / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + cw / 2), -(y + ch / 2));
    card(ctx, x, y, cw, ch, { r: 36, glow: rgba(PALETTE.gold, 0.12) });
    // number medallion
    ctx.fillStyle = PALETTE.goldWash;
    ctx.beginPath();
    ctx.arc(x + 110, y + 110, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + 110, y + 110, 62, 0, Math.PI * 2);
    ctx.stroke();
    setFont(ctx, 72, 700, FONT_DISPLAY);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'center';
    ctx.fillText(String(focus), x + 110, y + 136);
    // title
    setFont(ctx, 44, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    titleLines.forEach((ln, j) => ctx.fillText(ln, x + 210, y + 100 + j * 56));
    // rule
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 210, y + 130 + titleLines.length * 56);
    ctx.lineTo(x + 210 + 300, y + 130 + titleLines.length * 56);
    ctx.stroke();
    // points — each point advances by its own wrapped line count
    setFont(ctx, 30, 600);
    let ptY = y + 190 + titleLines.length * 56;
    pts.forEach((pt, i) => {
      const pp = clamp01((t - 500 - i * 550) / 700);
      if (pp <= 0) return;
      ctx.globalAlpha = ap * pp;
      ctx.fillStyle = i === pts.length - 1 ? PALETTE.goldDeep : PALETTE.inkSoft;
      pointLines[i].forEach((wl) => {
        ctx.fillText(wl, x + 210, ptY);
        ptY += lineStep;
      });
      ptY += ptGap;
    });
    ctx.restore();
    // host reacting on the left
    const hp = clamp01((t - 700) / 600);
    if (hp > 0) {
      // v5 (audit P1-3): takeaways 1–2 count on fingers; the third — the
      // earned-optimism payoff — gets the raised thumb
      const gesture = focus === 1 ? 'count1' : focus === 2 ? 'count2' : 'thumbsUp';
      const pose = Stickman.poseAt(t, { gesture, speaking: false });
      // v3 (panel P0-3): v2 renderer
      // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
      drawStickmanV2(ctx, W * 0.13, H * 0.667, 1.3, t,
        { pose, alpha: hp, look: 0.6, prop: focus === 3 ? 'thumb' : undefined }, 35);
    }
  }
}

function sceneTitleLocal(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: number,
  W: number
): void {
  const ap = clamp01(p / 0.35);
  ctx.save();
  ctx.globalAlpha = ap;
  setFont(ctx, 54, 600);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  let s = 54;
  while (ctx.measureText(text).width > W - 260 && s > 30) {
    s -= 2;
    setFont(ctx, s, 600);
  }
  ctx.fillText(text, x, y);
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, x, y + 16, tw * easeOutCubic(ap), 7, 3.5);
  ctx.fill();
  ctx.restore();
}

// ── commentPrompt: bubbles + the question ────────────────────────────────────
export function commentPromptScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 251, 0.5);
  const q = s.question as string;
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.textAlign = 'center';
  setFont(ctx, 84, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(q, W / 2, H * 0.32);
  setFont(ctx, 32, 600);
  ctx.fillStyle = PALETTE.inkSoft;
  const sub = s.sub as string;
  ctx.fillText(sub, W / 2, H * 0.42);
  ctx.restore();

  // floating comment bubbles — v8: white cards with teal/gold borders
  // (the panel called the old warm-tan fills "dirty paper scraps")
  // v10 (panel TYPE-4): bubbles get SENDER IDENTITY — a small tone-colored
  // avatar dot at the left inside each bubble, and a TAIL anchoring them to
  // the comment field. "Real comment UI has a sender identity" was the
  // panel's read; tag-chip → comment. The trailing ellipsis text is gone
  // (read as a truncation bug).
  const comments = [
    'the market side, honestly', 'a bit of both, honestly', 'sentiment side 100%',
    'gas prices got me', 'my portfolio disagrees with my mood',
  ];
  comments.forEach((c, i) => {
    const bp = clamp01((t - 600 - i * 500) / 800);
    if (bp <= 0) return;
    const x = W * (0.14 + (i % 3) * 0.3) + Math.sin(t / 1300 + i * 2.1) * 14;
    const y = H * (0.52 + (i % 2) * 0.14) + Math.cos(t / 1100 + i) * 10;
    const toneCol = i % 2 ? PALETTE.up : PALETTE.gold;
    ctx.save();
    ctx.globalAlpha = bp * 0.95;
    setFont(ctx, 28, 600); // v9 (D-07): floor
    const tw = ctx.measureText(c).width;
    const AV = 30; // avatar column
    ctx.fillStyle = i % 2 ? PALETTE.upSoft : PALETTE.goldWash;
    roundRect(ctx, x - tw / 2 - 26 - AV, y - 34, tw + 52 + AV, 62, 30);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(toneCol, 0.6);
    roundRect(ctx, x - tw / 2 - 26 - AV, y - 34, tw + 52 + AV, 62, 30);
    ctx.stroke();
    // tail — anchors the bubble into the field
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 26);
    ctx.lineTo(x - 2, y + 44);
    ctx.lineTo(x + 10, y + 26);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? PALETTE.upSoft : PALETTE.goldWash;
    ctx.fill();
    // sender avatar — a tone dot with a white core
    ctx.beginPath();
    ctx.arc(x - tw / 2 - 26 - AV + 30, y - 3, 11, 0, Math.PI * 2);
    ctx.fillStyle = rgba(toneCol, 0.85);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - tw / 2 - 26 - AV + 30, y - 3, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    ctx.fillText(c, x - tw / 2 + 6, y + 6);
    ctx.restore();
  });
  const pose = Stickman.poseAt(t, { gesture: 'pointR', speaking: false });
  // v3 (panel P0-3): v2 renderer
  // P1-1 (report): +30% (0.96 → 1.25); ground → H*0.667 (envelope 765).
  drawStickmanV2(ctx, W * 0.88, H * 0.667, 1.25, t, { pose, alpha: clamp01(t / 700), look: -0.5 }, 36);
}

// ── endScreen v2: next-video teaser + host, YouTube-safe (PATCH 6) ──────────
// The v1 SUBSCRIBE pill sat at W*0.58 — exactly where YouTube overlays its own
// end-screen elements (video card + subscribe placeholder cover roughly the
// right 40% and bottom 25%). Our branding got buried under their placeholder.
// v2 keeps ALL custom art in the LEFT 55% and leaves the right side empty for
// YouTube's two elements. Dashed placement hints render in the studio preview
// only (previewMode=true) — never in the final encode.
export function endScreenScene(g: SceneCtx): void {
  const { ctx, W, H, t, channelName, nextVideoTitle } = g;
  const showHints = (g as any).previewMode === true; // studio preview only
  paintBg(ctx, W, H, t, g.chapterTone);
  bokehField(ctx, W, H, t, { intensity: 1.1, seed: 261, gold: 0.6 });
  kMotifs(ctx, W, H, t, 0.05);
  floatCoins(ctx, W * 0.3, H * 0.32, t, 5, 200);

  // ── LEFT 55% — next-video teaser card (the real click driver) ──
  // v10 (panel GROWTH-1 — end-screen rebalance): the v9 frame parked the
  // card top-left and left the bottom 45% of the frame an empty void
  // ("a mostly blank screen with a postage stamp card" — and end screens
  // are where the money is). The card grows to 700×420 and sits lower;
  // WATCH NEXT moves directly under it as its caption; the channel lockup
  // rises to the top band; and a subscribe strip occupies the below-pill
  // gap so every vertical band of the frame carries a job.
  const ap = clamp01(t / 800);
  const nx = W * 0.06;
  const ny = H * 0.25;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 40);
  card(ctx, nx, ny, 700, 420, { r: 30 });
  // v8: card interior upSoft (teal wash) — the vision panel read the old
  // cream interior as the last big 'aged paper' wash in the film
  ctx.fillStyle = PALETTE.upSoft;
  roundRect(ctx, nx + 24, ny + 24, 612, 250, 20);
  ctx.fill();
  drawK3D(ctx, nx + 170, ny + 145, 76, clamp01((t - 300) / 900), t);
  ctx.strokeStyle = rgba(PALETTE.up, 0.8);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(nx + 320, ny + 210); ctx.lineTo(nx + 380, ny + 170);
  ctx.lineTo(nx + 420, ny + 190); ctx.lineTo(nx + 500, ny + 110);
  ctx.lineTo(nx + 580, ny + 80);
  ctx.stroke();
  setFont(ctx, 28, 700); // v9 (D-07): floor
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'left';
  ctx.fillText('NEXT WEEK', nx + 24, ny + 330);
  setFont(ctx, 29, 600);
  ctx.fillStyle = PALETTE.ink;
  wrapText(ctx, nextVideoTitle, 600, 29, 600).forEach((ln, i) => {
    ctx.fillText(ln, nx + 24, ny + 366 + i * 38);
  });
  ctx.restore();

  // ── v10.1 (panel 11 re-review): right-zone BRAND MARK — the pair judge
  // read the right half as "still largely vacant". A large soft gold K3D
  // (10% alpha, background layer) fills the void with the channel's own
  // mark; YouTube's end-screen elements overlay it cleanly at upload.
  {
    const kp = clamp01((t - 500) / 1200);
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.10 * kp;
      drawK3D(ctx, W * 0.74, H * 0.40, 300, kp, t);
      ctx.restore();
    }
  }

  // host waving, presenting the card from its right (inside safe zone) ──
  // v3 (P0-3): v2 renderer. v4 (vision panel, flagged twice): the host stood
  // at W*0.30 — directly UNDER the teaser card, and his head + waving arm
  // crossed the NEXT WEEK title text near “Concentration”. He now stands
  // clear to the card's right (body x≈795–895 vs text right edge ≈739),
  // still inside the left-55% YouTube-safe zone, waving toward the card.
  // v8: he PRESENTS — points at the WATCH NEXT arrow below (the scene's
  // click mechanism) instead of waving at nothing.
  const pose = {
    ...POSES.pointR,
    rAL: POSES.pointR.rAL + Math.sin(t / 900) * 4,
  };
  // v9 (report D-02): H*0.70 → H*0.675 — the guard caught this centered
  // figure's shadow grazing the 2-row pill envelope by 16px at the widest
  // captions; a touch more headroom settles it.
  // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.645 (envelope bottom
  // 697+47 = 744 — the widest-caption worst case clears by 32px).
  drawStickmanV2(ctx, W * 0.44, H * 0.645, 1.3, t, { pose, alpha: clamp01((t - 800) / 600), look: 0.6 }, 37);

  // ── v8: the WATCH NEXT arrow — the end screen's click mechanism ────────
  // The panel's verdict: "no thumbnail target = the most commercially
  // important frame does brand work only." YouTube fills the right 40% with
  // its own video element + subscribe circle; a bold outlined arrow + chip
  // INSIDE our safe zone points at exactly where those land, and the host's
  // pointing gesture sells it. Geometry-checked: clears the teaser card
  // (ends y≈659), the host (x≥785), and the coins (ends y≈570).
  {
    const ap = clamp01((t - 1400) / 600);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const ax = nx + 350; // v10: centred under the (wider) card
      const ay = ny + 420 + 76; // v10: rides directly under the card
      // v10.1 (panel 11 re-review, GROWTH-1): the outlined display word read
      // as "clashing with the clean system typography everywhere else" —
      // a stroked wordmark is a different type system. The CTA is now a
      // solid broadcast CHIP: teal plate, white 700 label, gold chevron
      // riding inside the chip's right end. Same slot under the card.
      const chipW = 470, chipH = 74;
      const chx = ax - chipW / 2, chy = ay - chipH / 2 - 4;
      ctx.fillStyle = rgba(PALETTE.shadow, 0.16);
      roundRect(ctx, chx + 2, chy + 8, chipW, chipH, 37);
      ctx.fill();
      ctx.fillStyle = PALETTE.up;
      roundRect(ctx, chx, chy, chipW, chipH, 37);
      ctx.fill();
      setFont(ctx, 42, 700, FONT_UI);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('WATCH NEXT', ax - 34, ay + 14);
      // the arrow — a chunky gold chevron INSIDE the chip
      const bounce = Math.sin(t / 480) * 6;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ax + 132, ay - 22 + bounce * 0.4);
      ctx.lineTo(ax + 186, ay + 2 + bounce * 0.4);
      ctx.lineTo(ax + 132, ay + 26 + bounce * 0.4);
      ctx.stroke();
      ctx.restore();
    }
  }

  // v10 (panel GROWTH-1): the SUBSCRIBE STRIP — the below-pill gap (pill
  // bottom ≈ 956, progress bar 1072) was dead void on the v9 end screen.
  // A quiet channel-mark + subscribe line occupies it without fighting the
  // pill or YouTube's right-zone elements.
  {
    const sp = clamp01((t - 2200) / 700);
    if (sp > 0) {
      ctx.save();
      ctx.globalAlpha = sp * 0.95;
      const sx = 150;
      const sy = 1006;
      // small gold K mark
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 15); ctx.lineTo(sx, sy + 13);
      ctx.moveTo(sx, sy - 1); ctx.lineTo(sx + 13, sy - 14);
      ctx.moveTo(sx, sy - 1); ctx.lineTo(sx + 13, sy + 12);
      ctx.stroke();
      setFont(ctx, 30, 700);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'left';
      ctx.fillText('SUBSCRIBE', sx + 34, sy - 4);
      setFont(ctx, 28, 600);
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.fillText('— data-driven breakdowns, every week', sx + 34 + ctx.measureText('SUBSCRIBE').width + 76, sy - 4);
      ctx.restore();
    }
  }

  // ── channel name + tagline, top band above the card ──
  const tp = clamp01((t - 500) / 700);
  if (tp > 0) {
    ctx.save();
    ctx.globalAlpha = tp;
    ctx.textAlign = 'center';
    setFont(ctx, 48, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(channelName.toUpperCase(), W * 0.28, H * 0.155);
    setFont(ctx, 27, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('data-driven breakdowns, every week', W * 0.28, H * 0.155 + 46);
    ctx.restore();
  }

  // ── RIGHT 40% — RESERVED for YouTube's own end-screen elements ──
  if (showHints) {
    // dashed hint boxes ONLY in the studio preview so you can drop YouTube's
    // subscribe/video elements onto them in YouTube Studio with confidence.
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = rgba(PALETTE.gold, 0.55);
    ctx.lineWidth = 3;
    // YouTube video element (square-ish, right-center)
    roundRect(ctx, W * 0.645, H * 0.20, 480, 300, 18);
    ctx.stroke();
    // YouTube subscribe element (circular, right-bottom)
    ctx.beginPath();
    ctx.arc(W * 0.76, H * 0.74, 150, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export { easeInOutSine, easeOutQuad, TONE };
