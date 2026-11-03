/**
 * Text & emotional beats: the hard-cut statement, stamp card, quote/caveat
 * cards, takeaways, comment prompt, and the end screen.
 */

import { clamp01, easeInOutSine, easeOutBack, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, TONE, card, rgba, roundRect, setFont, paintBg } from './theme';
import { bokehField, lightRays, softBloom, sparkles, drawK3D, kMotifs, floatCoins } from './effects';
import { SceneCtx } from './scene-context';
import { Stickman, POSES, blendPose } from './stickman';
import { drawStickmanV2 } from './stickman-v2';
import { wrapText } from './charts';

function bg(g: SceneCtx, seed: number, gold = 0.4): void {
  paintBg(g.ctx, g.W, g.H, g.t);
  bokehField(g.ctx, g.W, g.H, g.t, { intensity: 0.85, seed, gold });
  lightRays(g.ctx, g.W, g.H, g.t, { alpha: 0.5 });
}

// ── bigText: the hard cut ────────────────────────────────────────────────────
export function bigTextScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t);
  softBloom(ctx, W, H, t, 180); // v2: warm 12% bloom, not a white strobe (PATCH 5)
  const lines = (s.lines as string[]) || [];
  lines.forEach((ln, i) => {
    const ap = clamp01((t - 160 - i * 620) / 700);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    const scale = 0.94 + 0.06 * easeOutBack(ap);
    ctx.translate(W / 2, H * 0.36 + i * 130);
    ctx.scale(scale, scale);
    setFont(ctx, 108, 700, 'Georgia, "Times New Roman", serif');
    ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.ink;
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
    drawStickmanV2(ctx, W * 0.86, H * 0.84, 0.9, t, { pose, alpha: hp, look: -0.6 }, 31);
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
  setFont(ctx, 110, 700, 'Georgia, serif');
  const tw = ctx.measureText(txt).width;
  // stamp frame
  ctx.strokeStyle = PALETTE.up;
  ctx.lineWidth = 10;
  roundRect(ctx, -tw / 2 - 60, -110, tw + 120, 170, 18);
  ctx.stroke();
  ctx.fillStyle = PALETTE.up;
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
    const cxx = cx + 250;
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
    drawStickmanV2(ctx, W * 0.14, H * 0.84, 1.0, t, { pose, alpha: hp, look: 0.6 }, 32);
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
  const ch = 200 + lines.length * 60;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 36);
  card(ctx, x, y, cw, ch, { r: 34 });
  // accent
  ctx.fillStyle = soft ? rgba('#B9B4A6', 0.9) : PALETTE.gold;
  roundRect(ctx, x + 44, y + 40, 8, ch - 80, 4);
  ctx.fill();
  // kicker
  setFont(ctx, 27, 700);
  ctx.fillStyle = soft ? PALETTE.inkFaint : PALETTE.goldDeep;
  ctx.textAlign = 'left';
  ctx.fillText((s.kicker as string).toUpperCase(), x + 84, y + 78);
  // lines
  setFont(ctx, 36, 600);
  ctx.fillStyle = PALETTE.ink;
  lines.forEach((ln, i) => {
    const lp = clamp01((t - 350 - i * 420) / 650);
    if (lp <= 0) return;
    ctx.globalAlpha = ap * lp;
    wrapText(ctx, ln, cw - 160, 36, 600).forEach((wl, j) => {
      ctx.fillText(wl, x + 84, y + 148 + i * 68 + j * 46);
    });
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
    drawStickmanV2(ctx, W * 0.85, H * 0.84, 0.94, t, { pose, alpha: hp, look: -0.7 }, 33);
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
      setFont(ctx, 92, 700, 'Georgia, serif');
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
    drawStickmanV2(ctx, W * 0.82, H * 0.84, 1.0, t, { pose, alpha: clamp01(t / 600), look: -0.5 }, 34);
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
        setFont(ctx, 66, 700, 'Georgia, serif');
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
    const y = H * 0.2;
    const pts = (s.points as string[]) || [];
    const ch = 170 + pts.length * 76;
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
    setFont(ctx, 72, 700, 'Georgia, serif');
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'center';
    ctx.fillText(String(focus), x + 110, y + 136);
    // title
    setFont(ctx, 44, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    const titleLines = wrapText(ctx, s.title as string, cw - 260, 44, 700);
    titleLines.forEach((ln, j) => ctx.fillText(ln, x + 210, y + 100 + j * 56));
    // rule
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 210, y + 130 + titleLines.length * 56);
    ctx.lineTo(x + 210 + 300, y + 130 + titleLines.length * 56);
    ctx.stroke();
    // points
    setFont(ctx, 30, 600);
    pts.forEach((pt, i) => {
      const pp = clamp01((t - 500 - i * 550) / 700);
      if (pp <= 0) return;
      ctx.globalAlpha = ap * pp;
      ctx.fillStyle = i === pts.length - 1 ? PALETTE.goldDeep : PALETTE.inkSoft;
      wrapText(ctx, pt, cw - 260, 30, 600).forEach((wl, j) => {
        ctx.fillText(wl, x + 210, y + 190 + titleLines.length * 56 + i * 76 + j * 40);
      });
    });
    ctx.restore();
    // host reacting on the left
    const hp = clamp01((t - 700) / 600);
    if (hp > 0) {
      const gesture = focus === 1 ? 'count1' : focus === 2 ? 'count2' : 'count3';
      const pose = Stickman.poseAt(t, { gesture, speaking: false });
      // v3 (panel P0-3): v2 renderer
      drawStickmanV2(ctx, W * 0.13, H * 0.82, 1.0, t, { pose, alpha: hp, look: 0.6 }, 35);
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

  // floating comment bubbles
  const comments = [
    'the market side, honestly', 'a bit of both…', 'sentiment side 100%',
    'gas prices got me', 'my portfolio disagrees with my mood',
  ];
  comments.forEach((c, i) => {
    const bp = clamp01((t - 600 - i * 500) / 800);
    if (bp <= 0) return;
    const x = W * (0.14 + (i % 3) * 0.3) + Math.sin(t / 1300 + i * 2.1) * 14;
    const y = H * (0.52 + (i % 2) * 0.14) + Math.cos(t / 1100 + i) * 10;
    ctx.save();
    ctx.globalAlpha = bp * 0.95;
    setFont(ctx, 26, 600);
    const tw = ctx.measureText(c).width;
    ctx.fillStyle = i % 2 ? PALETTE.upSoft : PALETTE.goldWash;
    roundRect(ctx, x - tw / 2 - 26, y - 34, tw + 52, 62, 30);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(i % 2 ? PALETTE.up : PALETTE.gold, 0.5);
    roundRect(ctx, x - tw / 2 - 26, y - 34, tw + 52, 62, 30);
    ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 26);
    ctx.lineTo(x - 2, y + 44);
    ctx.lineTo(x + 10, y + 26);
    ctx.fillStyle = i % 2 ? PALETTE.upSoft : PALETTE.goldWash;
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(c, x, y + 6);
    ctx.restore();
  });
  const pose = Stickman.poseAt(t, { gesture: 'pointR', speaking: false });
  // v3 (panel P0-3): v2 renderer
  drawStickmanV2(ctx, W * 0.88, H * 0.84, 0.96, t, { pose, alpha: clamp01(t / 700), look: -0.5 }, 36);
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
  paintBg(ctx, W, H, t);
  bokehField(ctx, W, H, t, { intensity: 1.1, seed: 261, gold: 0.6 });
  kMotifs(ctx, W, H, t, 0.05);
  floatCoins(ctx, W * 0.3, H * 0.32, t, 5, 200);

  // ── LEFT 55% — next-video teaser card (the real click driver) ──
  const ap = clamp01(t / 800);
  const nx = W * 0.06;
  const ny = H * 0.24;
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.translate(0, (1 - easeOutCubic(ap)) * 40);
  card(ctx, nx, ny, 660, 400, { r: 30 });
  ctx.fillStyle = PALETTE.goldWash;
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
  setFont(ctx, 25, 700);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'left';
  ctx.fillText('NEXT WEEK', nx + 24, ny + 330);
  setFont(ctx, 29, 600);
  ctx.fillStyle = PALETTE.ink;
  wrapText(ctx, nextVideoTitle, 600, 29, 600).forEach((ln, i) => {
    ctx.fillText(ln, nx + 24, ny + 366 + i * 38);
  });
  ctx.restore();

  // ── host waving, bottom-left (inside safe zone) — v3 (P0-3): v2 renderer ──
  const pose = {
    ...blendPose(POSES.wave, POSES.wave, 0),
    rAL: POSES.wave.rAL + Math.sin(t / 160) * 16,
  };
  drawStickmanV2(ctx, W * 0.30, H * 0.86, 1.02, t, { pose, alpha: clamp01((t - 800) / 600), look: -0.4 }, 37);

  // ── channel name + tagline, bottom-center-left ──
  const tp = clamp01((t - 500) / 700);
  if (tp > 0) {
    ctx.save();
    ctx.globalAlpha = tp;
    ctx.textAlign = 'center';
    setFont(ctx, 44, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(channelName.toUpperCase(), W * 0.30, H * 0.20);
    setFont(ctx, 27, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('data-driven breakdowns, every week', W * 0.30, H * 0.20 + 48);
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
