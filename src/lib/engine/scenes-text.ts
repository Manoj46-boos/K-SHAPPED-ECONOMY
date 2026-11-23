/**
 * Text & emotional beats: the hard-cut statement, stamp card, quote/caveat
 * cards, takeaways, comment prompt, and the end screen.
 */

import { clamp01, easeInOutSine, easeOutBack, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, TONE, card, rgba, roundRect, setFont, paintBg, scenePlate, glowBlob, FONT_DISPLAY, FONT_UI, CAPTION_ZONE_TOP } from './theme';
import { bokehField, lightRays, softBloom, sparkles, drawK3D, kMotifs, floatCoins, impactRing, microShake, camState } from './effects';
import { SceneCtx, declareOnScreenHeadline } from './scene-context';
import { reactionAt } from './scene-context';
import { Stickman, POSES, blendPose, take } from './stickman';
import { pivotTakeStart } from './pivots';
import { HERO } from './perception';
import { drawStickmanV2 } from './stickman-v2';
import { wrapText } from './charts';
import { registerRect, registerText } from './collision';

function bg(g: SceneCtx, seed: number, gold = 0.4, strength = 0.72, bokeh = 0.85, furniture = true): void {
  paintBg(g.ctx, g.W, g.H, g.t, g.chapterTone);
  // P1-2 (report §12.2): statement scenes live in a room too — the plate
  // lands behind every text beat (stamp/quote/takeaways/comment), so a
  // full-bleed tint carries the frame instead of raw white.
  // PHASE-0 VISUAL AUDIT (frame evidence BEFORE_fix1-2): statement beats pass
  // furniture=false — typography-first frames get the clean stage (the
  // window/desk/shelf props read as ghost UI over the type).
  scenePlate(g.ctx, g.W, g.H, g.chapterTone ?? 'up', strength, undefined, { furniture });
  // P2-3 (100-judge audit, Table 4 — "no bokeh on statement beats":
  // "why bubbles, in a data film?"): the bokeh level is now a per-scene
  // param. Statement beats (the stamp slam) pass 0 — typography owns the
  // frame alone; typography-forward beats (the quote card) pass a
  // whisper; reading layouts keep the room's atmosphere.
  // B19 (TEXTURE STACK): the background bokeh + light-ray whisper layers
  // are cut — the committed stack is the room wash, the stage architecture,
  // one grain, one vignette.
}

// ── bigText: the hard cut ────────────────────────────────────────────────────
export function bigTextScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t, g.chapterTone);
  // P1-2 (report §12.2): the hard cut lands in a ROOM, not on a lightbox —
  // the 118px statement reads louder against a tinted field than against
  // 90% near-white. Panel re-review: statement scenes run the plate at 0.88
  // (the 0.72 default read as "a whisper of a wash" under a 118px slam).
  // PHASE-0 VISUAL AUDIT (Fix 2 — the statement frame stops sabotaging
  // itself): the per-tone furniture (window + desk edge) read on the slam
  // frame as a ghost UI panel top-right and a stray hairline through the
  // composition; the 0.1-alpha K-motif field added a second ghost outline.
  // A statement beat is typography + room tone — furniture OFF, kMotifs OFF.
  scenePlate(ctx, W, H, g.chapterTone ?? 'up', 0.88, null, { furniture: false });
  softBloom(ctx, W, H, t, 180); // v2: warm 12% bloom, not a white strobe (PATCH 5)
  // AUDIT-ROUND-3 iter-2 (Fix 4 — STATEMENT ATMOSPHERE): the re-review
  // read the statement room as "a flat gradient void with no atmosphere,
  // no vignette weight, no mid-ground element — depth by shadow alone is
  // one trick, not a spatial design". The statement room now carries the
  // film's atmosphere: a soft one-light shaft from the upper right (the
  // same light the shadows obey) and the K-motif field at furniture
  // alpha — the words sit IN the brand's room, not on a slide.
  // PHASE-0 VISUAL AUDIT: kMotifs retired here (the stray K outline on a
  // typography-only frame read as an artifact, not as branding).
  // AUDIT-2 / §10.4 (report Phase 3): THE IMPACT GRAMMAR — the slam fires
  // the full triple: a 2px/80ms MICRO-SHAKE (applied here at the TOP of the
  // scene draw so every element — block, underline, host — rides the
  // flinch), an expanding gold IMPACT RING from the statement, and ONE
  // double-radius warm glow frame at the strike. All deterministic, all
  // from machinery that already existed in effects.ts. The scale punch +
  // sparkles stay (the emphasis stack, not the whole budget).
  // 100-JUDGE DOSSIER (P3 — hero register): the statement slam shakes at
  // HERO.shakePx — 2.3x the ambient 6px reveal tick. Quiet scenes boil at
  // 0.8px; the slam flinches at 14px. Contrast, by measurement.
  {
    const shake = microShake(t, 340, HERO.shakePx);
    if (shake.dx !== 0 || shake.dy !== 0) ctx.translate(shake.dx, shake.dy);
  }
  const lines = (s.lines as string[]) || [];
  // PHASE-0 VISUAL AUDIT (Fix 1 — CAPTION NO LONGER REPEATS THE STATEMENT):
  // the karaoke pill used to print the same words the serif block had just
  // slammed ("Out of five hundred." under "OUT OF FIVE HUNDRED.") — the
  // dedup registry existed but only hostScene declared into it. Statement
  // beats declare their on-screen lines; drawCaptions stands down for any
  // window whose words are already on screen in the serif.
  declareOnScreenHeadline(lines.join(' '));
  // P2 density payload (100-judge dossier, Prototype 8-2 — THE STATEMENT
  // PAYOFF): the beat's dotPayoff prop draws the index field the statement
  // DESCRIBES — 500 whisper dots with the 7 gold members bracketed and
  // labelled — behind the type. Static furniture (pure function of W/H,
  // sits behind every content rect by construction, never guard-registered,
  // same register as the scene plates). The frame's info density rises from
  // the 3.3% typographic desert to a populated room, and the empty lower
  // band carries the label.
  const payoff = s.dotPayoff as { gold?: number; total?: number; label?: string } | undefined;
  if (payoff) {
    const totalDots = payoff.total ?? 500;
    const goldN = payoff.gold ?? 7;
    const cols = 50;
    const rows = Math.ceil(totalDots / cols);
    const fx = W * 0.115;
    const fy = H * 0.60;
    const fw = W * 0.77;
    const fh = H * 0.21;
    const pitchX = fw / cols;
    const pitchY = fh / rows;
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < totalDots; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = fx + col * pitchX + 8;
      const cy = fy + row * pitchY + 8;
      const isGold = i < goldN;
      // PHASE-0 VISUAL AUDIT: the 493 non-gold dots rode rgba(grid, 0.78) —
      // a pale wash that measured as an EMPTY band at the 320px gate once
      // the caption pill stopped breaking it up (Fix 1's dedup). The audit's
      // own two-tier doctrine: texture that cannot survive the transcode is
      // decoration. The field now draws in inkSoft at 0.95 — ink-tier at the
      // gate, the "seven gold among 493 ink" mass the statement describes.
      ctx.fillStyle = isGold ? PALETTE.gold : rgba(PALETTE.inkSoft, 0.95);
      ctx.beginPath();
      ctx.arc(cx, cy, isGold ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // the bracket cradles the gold members
    ctx.strokeStyle = rgba(PALETTE.goldDeep, 0.85);
    ctx.lineWidth = 3;
    roundRect(ctx, fx - 14, fy - 12, goldN * pitchX + 22, fh + 24, 14);
    ctx.stroke();
    // the label under the bracket
    if (payoff.label) {
      // C2 FIX (100-JUDGE PANEL REPORT §2.3 — WHISPER CAPTIONS): the payoff
      // line ('7 of 500 decide the year' — the statement's whole argument)
      // rode a 30px whisper. Ink at 0.9 on the 34px floor per the report.
      setFont(ctx, 34, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(String(goldN), fx - 14, fy + fh + 46);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(payoff.label, fx + 6, fy + fh + 46);
    }
    ctx.restore();
  }
  // P1-2 (report): the lines SNAP in as ONE block (80ms + a single 260ms
  // ramp — both lines solid by ~340ms) instead of the v5 per-line fade
  // (160 + 620 stagger + 700ms ramp, full at 860ms+). Two reasons: (1) the
  // director's bigText ANTICIPATION recoil peaks at ~350ms — it must land
  // on the COMPLETE statement, or the wind-up reads as a fade (the panel's
  // round-3 note); (2) a statement beat is one thought — "SEVEN COMPANIES.
  // OUT OF FIVE HUNDRED." lands harder as a single slam than as a two-step
  // reveal. The per-line stagger survives via the two-tone color split.
  //
  // P1-10 (report §12.10): the slam gets its frame of MOTION BLUR — the
  // block draws twice for one frame, the ghost copy offset 1.5% of W at
  // 0.35 alpha (a 4%-wide smear band at 1080p). The PANEL-12 white accent
  // flashes; the smear MOVES — together they read as mass hitting the
  // frame instead of a cut.
  const drawBlock = (dx: number, alphaMul: number): void => {
    lines.forEach((ln, i) => {
      const ap = clamp01((t - 80) / 260);
      if (ap <= 0 || alphaMul <= 0) return;
      ctx.save();
      ctx.globalAlpha = ap * alphaMul;
      ctx.textAlign = 'center';
      // P3 hero register: the slam travels 0.90 → 1.0 with a 10% overshoot
      // (double the ambient arrival) — the words LAND.
      const scale = 0.9 + HERO.blockTravel * easeOutBack(ap);
      // v10 (panel TYPE-2): EDITORIAL SIZE HIERARCHY — line 1 is the statement
      // in inkDeep (the display ink, 11.9:1), line 2 the punchline in goldDeep.
      // v10.1 (panel 11 re-review): the v10 step (108 → 88, a 19% ratio) still
      // read as "two lines near-equal in scale" — a couplet, not a headline.
      // The hierarchy is now unambiguous: line 1 at 118px (auto-fit to 1660),
      // line 2 at 62px/600 — a 1.9× editorial ratio, statement + kicker.
      const size = i === 0 ? 118 : 62;
      // PHASE-0 round 3 (bigText's residual 27% band measured at y 0-48 of
      // 180 — the zone ABOVE line 1's cap): line 1's baseline moves to
      // 0.30H (cap top ~0.21H); line 2 to 0.49H; underline 0.62H; host
      // 0.672H. Top gap ~0.21H < 20% bar. A statement beat starts high and
      // heavy — the top-heavy stack is also the correct editorial read.
      ctx.translate(W / 2, H * 0.30 + i * 190);
      ctx.scale(scale, scale);
      if (i === 0) {
        setFont(ctx, size, 700, FONT_DISPLAY);
        let s2 = size;
        while (ctx.measureText(ln).width > 1660 && s2 > 72) {
          s2 -= 2;
          setFont(ctx, s2, 700, FONT_DISPLAY);
        }
      } else {
        setFont(ctx, size, 600, FONT_DISPLAY);
      }
      // AUDIT-ROUND-3 (Fix 4 — STATEMENT MATERIALITY): the bigText frames
      // scored VFX 3/10 on the external audit ("literally nothing
      // happening... reads as a slide"). The type now SITS in the room: a
      // soft one-light drop shadow under the block. The cheapest material
      // cue in 2D typography: the words gain height without gaining noise.
      // PHASE-0 (panel report §7-D4): the offset unifies to the ONE-LIGHT
      // rule (−4, 0) — the exact vector groundShadowV2, card()'s passes and
      // the caption pill all obey (the (−2, +4) hand-roll was a fourth
      // dialect of the same light).
      ctx.fillStyle = rgba(PALETTE.shadow, 0.18);
      ctx.fillText(ln, dx - 4, 0);
      ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.inkDeep;
      ctx.fillText(ln, dx, 0);
      ctx.restore();
    });
  };
  const SMEAR = t >= 340 && t < 380; // the frame the block lands (ap completes at 340)
  drawBlock(SMEAR ? W * 0.015 : 0, SMEAR ? 0.35 : 0); // the motion-blur ghost, UNDER
  drawBlock(0, 1); // the solid block
  // AUDIT-2 / §10.4: the impact triple's visible members — ring + glow
  // (the micro-shake was applied at the top of the scene).
  // PHASE-0 (Fix 2): ring + glow pivot to the new statement center (0.40H).
  impactRing(ctx, W / 2, H * 0.36, t, 340, 210, HERO.ringScale);
  if (t >= 340 && t < 340 + 66) {
    // the double-radius glow frame — one beat of the number's own light
    glowBlob(ctx, W / 2, H * 0.32, 640, '#F7F0DC', 0.30);
  }
  // supportive underline
  // PHASE-0 round 2: the underline sits at 0.62H between line 2 (0.50H)
  // and the host (0.672H) — the three-element stack leaves no 20% gap.
  const up2 = clamp01((t - 1500) / 700);
  if (up2 > 0) {
    ctx.save();
    ctx.globalAlpha = up2;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    // AUDIT-ROUND-3 (Fix 4): the underline WIPES left→right (a drawn
    // gesture under the words) instead of expanding from the center
    // (a loading bar). Reading direction = wipe direction.
    // B4 FIX (100-JUDGE PANEL REPORT §2.2 — STATIC RULES CUT THROUGH THE
    // FIGURE): the rule wiped to 1240 — INTO the host's standing zone —
    // and passed behind/through his pointing arm while he arrived (the
    // engine solved hand-vs-text clearance but never rule-vs-figure). The
    // rule now ends 96px clear of the body core (1256): w 560 → 480, and
    // the contact verb retargets to the NEW end-cap so the palm still
    // brackets the statement's underline (contact-by-design preserved,
    // no shaft crossing at any frame of the wipe).
    const w = 480 * easeOutCubic(up2);
    ctx.beginPath();
    ctx.moveTo(W / 2 - 280, H * 0.585);
    ctx.lineTo(W / 2 - 280 + w, H * 0.585);
    ctx.stroke();
    ctx.restore();
  }
  // PANEL-12 / P2-3 (report §14.3): THE IMPACT FRAME — bigText lands the
  // film's loudest words, so it gets the film's loudest frame: a 2-frame
  // white accent at 8% alpha right after the slam (the block is solid at
  // t=340). Whisper-loud, not a strobe — 2 frames @30fps sits far below
  // the 3-per-second flash threshold by construction.
  if (t >= 340 && t < 340 + 66) {
    ctx.save();
    ctx.globalAlpha = 0.12; // P3 hero register: 0.08 -> 0.12 — the impact frame is FELT
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // P2-3 (audit Table 4 + panel round-3 note "dirt on the plate"): the
  // sparkle burst is GONE from the statement beat — celebration VFX
  // never sits on statement typography; the slam's own impact grammar
  // (micro-shake + ring) carries the emphasis.
  // PHASE-4 (report §11 Phase 4) + Table 2 receipt 8: the count host's
  // alpha keys to BEAT time (a 12s-cap re-split group no longer replays his
  // entrance mid-count) and commits to the 0.85 floor / 180ms ramp — he
  // arrives after the slam at full presence instead of condensing.
  const hp = g.beatT < 2200 ? 0 : 0.85 + 0.15 * clamp01((g.beatT - 2200) / 180);
  if (hp > 0) {
    const pose = Stickman.poseAt(t, { gesture: 'count2', speaking: false });
    // v3 (panel P0-3): v2 renderer — one body style across the whole film
    // P1-1 (report): +30% (0.9 → 1.17); ground 756 → 726 (envelope bottom 768,
    // clear of the worst-case 2-row pill envelope 776).
    // PANEL-12 / P2-1: foreground parallax.
    // AUDIT-3 / §2.4 (report Phase 2.4 — SQUASH ON LANDINGS): the count
    // host LANDS — a 300ms volume-preserving squash about his feet as he
    // arrives (the film's loudest words get a body that receives them).
    // 100-JUDGE PANEL / PHASE 1 item 1 — CONTACT IS MANDATORY (report §6
    // Phase 1). The count host's data is the STATEMENT — the near hand
    // SOLVES onto the gold underline's right end-cap (1160, 632 — the B4
    // shortened rule): the palm
    // BRACKETS the statement's underline while the far hand keeps the
    // count2 tally raised. The host steps in from W*0.83 to 1330 so the
    // underline tip is inside the 131px arm envelope (shoulder (1334, 543)
    // → tip lands); the body core 1256-1404 stays 96px right of the
    // underline's full extent (wipe ends 1160). Ground 735 keeps the feet
    // band clear of the 2-row pill (top 796).
    const sinceLand = t - 2200;
    const squash = sinceLand >= 0 && sinceLand < 300
      ? Math.sin((sinceLand / 300) * Math.PI)
      : 0;
    // 100-JUDGE PANEL / Phase 1 item 4 — CAST BY SILHOUETTE (report §6
    // Phase 1): "the count host gets rolled sleeves" — the counting
    // gesture is work; the sleeves roll. Driven inside drawStickmanV2
    // from the pose's own rHand count glyph (cuff at the forearm, on
    // the body's ivory) so every count host inherits it.
      drawStickmanV2(ctx, 1310, H * 0.681, 1.17, t, { pose, alpha: hp, look: -0.6, parallax: true, squash, contact: { x: 1160, y: 632, hand: 'palm' } }, 31);
  }
}

// ── stampCard: "RECORD HIGHS — ACCURATE" ─────────────────────────────────────
export function stampCardScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  // P1-2 + panel re-review: the stamp SLAMS — it gets the deep room (0.88)
  // P2-3: and NO bokeh — the stamp is a statement beat, typography owns
  // the frame alone.
  // PHASE-0 VISUAL AUDIT: furniture OFF (same ghost-UI defect as bigText on
  // a typography-first frame) + the stamp/sub declared so the caption pill
  // stops printing the words already on screen.
  bg(g, 221, 0.55, 0.88, 0, false);
  declareOnScreenHeadline(((s.stamp as string) || 'RECORD HIGHS') + ' ' + ((s.sub as string) || ''));
  // P3 hero register: the stamp SLAM shakes at HERO.shakePx (ambient
  // scenes had no shake at all here — the stamp now flinches like the
  // bigText block does).
  {
    const shake = microShake(t, 500, HERO.shakePx);
    if (shake.dx !== 0 || shake.dy !== 0) ctx.translate(shake.dx, shake.dy);
  }
  const cx = W / 2;
  // PHASE-0 round 2 (stampCard band went 23% -> 25%: the sub move alone
  // left the 0.10-0.30H zone dead above the stamp). A kicker chip at
  // 0.18H anchors the top — the stamp verdict needs a context line ("THE
  // RECEIPTS" register: what is being stamped and why). The stamp holds
  // 0.44H, the sub at cy+180 (~0.61H), the host envelope 0.667H+.
  {
    const kp = clamp01((t - 150) / 450);
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha = kp;
      const kx = 'THE RECEIPTS — CHECK THE RECORD';
      setFont(ctx, 34, 700);
      const tw = ctx.measureText(kx).width;
      ctx.fillStyle = rgba(PALETTE.white, 0.85);
      roundRect(ctx, W / 2 - tw / 2 - 30, H * 0.18 - 30, tw + 60, 60, 30);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.up, 0.6);
      roundRect(ctx, W / 2 - tw / 2 - 30, H * 0.18 - 30, tw + 60, 60, 30);
      ctx.stroke();
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.textAlign = 'center';
      ctx.fillText(kx, W / 2, H * 0.18 + 10);
      ctx.restore();
    }
  }
  const cy = H * 0.44;
  const ap = clamp01(t / 500);
  // P1-10 (report §12.10): the stamp draws as a function of dx so the slam
  // frame can draw it TWICE — solid at 0, plus a 1.5% offset ghost at 0.35
  // alpha — one frame of horizontal motion blur on the landing (the
  // PANEL-12 white accent stays; the smear adds the MOVEMENT).
  const drawStamp = (dx: number, alphaMul: number, ghost = false): number => {
    if (alphaMul <= 0) return 0;
    ctx.save();
    ctx.translate(cx + dx, cy);
    ctx.rotate(-0.06);
    ctx.globalAlpha = ap * alphaMul;
    // P3 hero register: the stamp drops from 1.55 (was 1.4) — a bigger
    // arrival travel, the slam read.
    const scale = 1 + (1 - easeOutBack(ap)) * 0.55;
    ctx.scale(scale, scale);
    const txt = (s.stamp as string) || 'RECORD HIGHS';
    setFont(ctx, 110, 700, FONT_DISPLAY);
    const tw = ctx.measureText(txt).width;
    // v8 (vision panel): the stamp frame strokes crossed THROUGH the
    // letterforms and muddied the R-E-C. A white knockout plate behind the
    // type keeps the brushed-frame energy while the word stays crisp.
    // P1-10: the GHOST copy skips the knockout — its own 0.35-alpha plate
    // was washing the smear ink, and the solid stamp's plate already
    // provides the knockout where they overlap (panel round-2 note: "no
    // ghost offset on the lettering, only a double box edge").
    if (!ghost) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      roundRect(ctx, -tw / 2 - 44, -104, tw + 88, 148, 16);
      ctx.fill();
      ctx.restore();
    }
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
    return tw;
  };
  const SMEAR = t >= 500 && t < 540; // the frame the stamp lands (ap completes at 500)
  if (SMEAR) drawStamp(W * 0.015, 0.35, true); // the ink-only motion-blur ghost, UNDER
  const tw = drawStamp(0, 1); // the solid stamp (also returns the word width)
  // P3 hero register: the stamp gets the impact ring it never had —
  // HERO.ringScale from the stamp's centre, the same slam grammar the
  // bigText block carries.
  impactRing(ctx, cx, cy, t, 500, 240, HERO.ringScale);
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
    // PHASE-0 (Fix 2): the sub moves from cy+160 (0.49H — left the band
    // below it dead) to cy+180 with its own fade-in clock — it fills the
    // pre-host gap; the checkmark keeps its position (outside the word).
    setFont(ctx, 40, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(s.sub as string, cx, cy + 180);
    ctx.restore();
    // 100-JUDGE VISUAL AUDIT (Phase 1 — CUT-TO-VALUE PACING): the merged
    // data chip — the neighboring journey chart's landing value, plated in
    // the film's own chip grammar, fading in after the sub settles. The
    // statement frame now carries the number behind its verdict: no
    // typography-only window in the chapter.
    const chip = s.dataChip as { big: string; label: string } | undefined;
    if (chip) {
      const dp = clamp01((t - 1200) / 600);
      if (dp > 0) {
        ctx.save();
        ctx.globalAlpha = dp;
        setFont(ctx, 56, 700);
        const bw = ctx.measureText(chip.big).width;
        setFont(ctx, 30, 600);
        const lw2 = ctx.measureText(chip.label).width;
        const cw = bw + lw2 + 96;
        const chx = cx - cw / 2;
        const chy = cy + 236;
        ctx.fillStyle = PALETTE.white;
        roundRect(ctx, chx, chy, cw, 74, 37);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(PALETTE.up, 0.5);
        roundRect(ctx, chx, chy, cw, 74, 37);
        ctx.stroke();
        ctx.fillStyle = PALETTE.gold;
        roundRect(ctx, chx + 26, chy + 14, 46 * easeOutCubic(dp), 5, 2.5);
        ctx.fill();
        setFont(ctx, 56, 700);
        ctx.fillStyle = PALETTE.up;
        ctx.textAlign = 'left';
        ctx.fillText(chip.big, chx + 30, chy + 52);
        setFont(ctx, 30, 600);
        ctx.fillStyle = PALETTE.inkSoft;
        ctx.fillText(chip.label, chx + 30 + bw + 24, chy + 47);
        ctx.restore();
      }
    }
    // P2-3: no sparkle burst on the stamp statement (see bigText note).
  }
  // PANEL-12 / P2-3 (report §14.3): THE IMPACT FRAME — the stamp SLAMS at
  // t=500 (ap completes); a 2-frame white accent at 8% lands the hit.
  if (t >= 500 && t < 500 + 66) {
    ctx.save();
    ctx.globalAlpha = 0.12; // P3 hero register
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // host nodding
  const hp = clamp01((t - 900) / 600);
  if (hp > 0) {
    const pose = { ...POSES.close, headTilt: Math.sin(t / 700) * 4 };
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
    // PANEL-12 / P2-1: foreground parallax.
    // P0 defect sweep: the exit's max camera still carried the feet band
    // 13px into the 2-row caption pill (traced at 1000.5s). The stage
    // rises to 0.62 — the band's worst-case bottom clears the pill by
    // ~16px, the card row and the pose are untouched.
    // P0 defect sweep: the FULL-FIGURE rect (feet + contact shadow) must
    // clear the 2-row caption pill's top at the exit's max camera — the
    // solved ground is 0.597 (feet 645, rect bottom 761, screen 782 at
    // the 1.116 lift — 14px of air over the pill). The crown stays ~86px
    // below the title band; the card row is untouched.
    // M/U6 arbitration: 0.19W → 0.21W — the stouter U6 body's apex band
    // grazed the frame-edge bound by 22px at the guard camera on this
    // staging; the figure steps right, the statement column is untouched.
    drawStickmanV2(ctx, W * 0.21, H * 0.597, 1.3, t, { pose, alpha: hp, look: 0.6, parallax: true }, 32); // PLAYBOOK D3: ground 0.667 -> 0.597 (full-figure rect clears the 2-row pill at max camera)
  }
}

// ── quoteCard: caveats, quotes, disclaimer ───────────────────────────────────
// PHASE-5 RE-STAGE (feed board: "a text card with a shrug; zero visual
// thought — first candidate for re-staging"). The cream card is GONE: this
// scene becomes the film's EDITORIAL PULL-QUOTE plane — a full-bleed
// magazine treatment that also breaks the 17-of-18 same-card-grammar read
// (D-15): Fraunces display serif quote text floating directly on the toned
// room, a giant ghost quotation mark as the anchor, ONE 6px gold vertical
// rule drawing on beside the text (the pull-quote bar), a hairline foot
// rule with the icon stamped at its end, and the host's palm resting ON
// the hairline like a hand on a desk. Editorial furniture, not a box.
export function quoteCardScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 231, 0.4, 0.72, 0.45, false); // P2-3: typography-forward beat — bokeh whisper, not 0.85; PHASE-0: furniture OFF
  const soft = !!s.soft;
  const lines = (s.lines as string[]) || [];
  // PHASE-0 VISUAL AUDIT (Fix 1 — CAPTION NO LONGER REPEATS THE STATEMENT):
  // the karaoke pill used to print the same words the serif block had just
  // slammed ("Out of five hundred." under "OUT OF FIVE HUNDRED.") — the
  // dedup registry existed but only hostScene declared into it. Statement
  // beats declare their on-screen lines; drawCaptions stands down for any
  // window whose words are already on screen in the serif.
  declareOnScreenHeadline(lines.join(' '));
  const ap = clamp01(t / 700);
  // the pull-quote plane's fixed furniture (fixed = the host's contact
  // target stays put no matter how many rows the quote wraps to)
  const ruleX = 340; // the vertical pull-quote bar
  const textX = 396; // the quote text's left edge
  const blockR = 1420; // the text zone's right edge (host keeps 80px clear)
  const accent = soft ? PALETTE.inkFaint : PALETTE.gold;
  const accentDeep = soft ? PALETTE.inkFaint : PALETTE.goldDeep;
  // THE SHEET — the editorial column: a full-bleed, edge-to-edge paper
  // band laid across the room (no corners, no border, no shadow — a value
  // plane, not a card). It gives the quote its feed-scale ink mass: the
  // 320px gate judged the first pass "an empty pink room" because 52px
  // serif on the bare tone room carries no silhouette. The sheet is the
  // magazine's tinted column — a DIFFERENT plane from the film's rounded
  // cream cards, which is the point (D-15).
  {
    const bp = clamp01((t - 40) / 600);
    if (bp > 0) {
      ctx.save();
      ctx.globalAlpha = ap * 0.5 * easeOutCubic(bp);
      ctx.fillStyle = PALETTE.card;
      // FRAME-LEDGER FIX (f362 — LOWER HALF EMPTY ON THE PEACH ROOM): the
      // sheet ended at y 648, leaving 650-780 as bare room under the quote.
      // The editorial column deepens to 728 — the paper plane closes the
      // dead band (68px above the caption pill) and the quote sits on a
      // full column, not a strip.
      ctx.fillRect(0, 168, W, 560 * easeOutCubic(bp));
      // V8/V1: the sheet's warm top-edge light line — the lit plane reads
      // as an object in the room, not a flat band.
      ctx.globalAlpha = ap * 0.55 * easeOutCubic(bp);
      ctx.fillStyle = rgba(PALETTE.gold, 0.5);
      ctx.fillRect(0, 168, W, 3.5);
      ctx.restore();
    }
  }
  // the eyebrow: a 44px gold dash + the kicker in small-caps register
  {
    const kp = clamp01((t - 120) / 500);
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha = ap * kp;
      ctx.fillStyle = accent;
      ctx.fillRect(ruleX, 226, 44 * easeOutCubic(kp), 7);
      setFont(ctx, 34, 700);
      ctx.fillStyle = accentDeep;
      ctx.textAlign = 'left';
      ctx.fillText((s.kicker as string).toUpperCase(), ruleX + 64, 241);
      ctx.restore();
    }
  }
  // the giant ghost mark — the beat IS a quotation; the glyph is the
  // composition's anchor, pulled INTO the block (left of the bar, behind
  // the first rows) instead of floating in the old top quarter
  // V8 FIX (market review §2.2 — STATIC PAGES): the statement beats drew
  // nothing that moved — the sweep read them as pages. The ghost mark now
  // BREATHES on the film's 4.8s clock (±2.5% scale about its own bowl) —
  // the frame is alive at a whisper, and the sheet gains a warm top-edge
  // light line (the one-light grammar) so the column reads as a lit plane.
  {
    const gp = clamp01((t - 200) / 700);
    if (gp > 0) {
      ctx.save();
      ctx.globalAlpha = gp * (soft ? 0.22 : 0.3);
      const breath = 1 + Math.sin(t / 2400) * 0.025;
      ctx.translate(ruleX - 74 + 70, 560 - 130);
      ctx.scale(breath, breath);
      setFont(ctx, 360, 700, FONT_DISPLAY);
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText('\u201C', -70, 130);
      ctx.restore();
    }
  }
  // the quote text — Fraunces 58px/700, measured wrap (the R7h cursor
  // logic survives; the type is now the display face the masthead uses,
  // sized so a row survives the 320px gate at a readable 9.7px)
  const quoteWrap = 980;
  setFont(ctx, 58, 700, FONT_DISPLAY);
  const wrapped = lines.map((ln) => wrapText(ctx, ln, quoteWrap, 58, 700));
  // compress leading if the quote runs long (the furniture never moves)
  const rows = wrapped.reduce((a, ls) => a + ls.length, 0);
  const leading = rows > 4 ? 64 : 72;
  const qY0 = 340;
  // the vertical pull-quote bar — draws on top→bottom, reaching the block's
  // full height just as the last line lands (the reveal reads as ONE pen)
  const ruleEnd = qY0 + Math.max(0, rows - 1) * leading + 48;
  {
    const rp = clamp01((t - 60) / 900);
    if (rp > 0) {
      const e = easeOutCubic(rp);
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.fillStyle = accent;
      ctx.fillRect(ruleX, 288, 8, (ruleEnd - 288) * e);
      ctx.restore();
    }
  }
  setFont(ctx, 58, 700, FONT_DISPLAY);
  ctx.fillStyle = soft ? PALETTE.inkSoft : PALETTE.ink;
  let lnY = qY0;
  lines.forEach((ln, i) => {
    const lp = clamp01((t - 350 - i * 420) / 650);
    if (lp <= 0) return;
    ctx.globalAlpha = ap * easeOutCubic(lp);
    wrapped[i].forEach((wl) => {
      ctx.fillText(wl, textX, lnY);
      lnY += leading;
    });
    lnY += 14;
  });
  // the foot rule + the stamped icon — the quote's editorial foot; the
  // hairline sweeps in from the left, the glyph pops at its far end
  const footY = 596;
  {
    const fp = clamp01((t - 560) / 500);
    if (fp > 0) {
      const e = easeOutCubic(fp);
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.strokeStyle = soft ? PALETTE.grid : rgba(PALETTE.goldDeep, 0.55);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ruleX, footY);
      ctx.lineTo(ruleX + (blockR - ruleX) * e, footY);
      ctx.stroke();
      // the icon stamp — the asterisk/shield glyph inside a thin ring,
      // pinned at the eyebrow row's RIGHT end (the footnote-marker
      // position; the first pass clipped the quote's last row)
      const ip = clamp01((t - 620) / 400);
      if (ip > 0) {
        ctx.globalAlpha = ap * ip;
        const ix = blockR - 44;
        const iy = 226;
        const pop = 0.6 + 0.4 * easeOutBack(ip);
        ctx.save();
        ctx.translate(ix, iy);
        ctx.scale(pop, pop);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        const icon = s.icon as string;
        if (icon === 'shield') {
          ctx.beginPath();
          ctx.moveTo(0, -16);
          ctx.lineTo(13, -9);
          ctx.lineTo(13, 5);
          ctx.quadraticCurveTo(0, 18, -13, 5);
          ctx.lineTo(-13, -9);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(-1, 5);
          ctx.lineTo(6, -5);
          ctx.stroke();
        } else {
          // asterisk (default)
          for (let k = 0; k < 3; k++) {
            const a2 = (k / 3) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(-Math.cos(a2) * 14, -Math.sin(a2) * 14);
            ctx.lineTo(Math.cos(a2) * 14, Math.sin(a2) * 14);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }
  registerRect('quoteCard:quote', ruleX, 220, blockR - ruleX, footY - 200);
  // P3 (Verdict report — KILL THE WASHES): the quote card's right zone —
  // the band between the text block and the host — gains the brand K as a
  // mid-ground layer (20% alpha, gold, filling the vertical band). The
  // frame now carries designed content in every quadrant; the host reads
  // as presenting BESIDE the mark, not floating in a wash.
  // FRAME-LEDGER FIX (f362): the mark drops into the LOWER-RIGHT quadrant
  // and commits (kS 0.30H → 0.36H, ky 0.52H → 0.58H, alpha 0.20 → 0.26) —
  // the deepened sheet plus the mark plus the re-staged host give every
  // quadrant committed ink (the ledger's "lower half empty" is dead).
  {
    const kp2 = clamp01((t - 500) / 700);
    if (kp2 > 0) {
      ctx.save();
      ctx.globalAlpha = kp2 * 0.26;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const kS = H * 0.36;
      const kx = W * 0.795, ky = H * 0.58;
      ctx.beginPath();
      ctx.moveTo(kx - kS * 0.40, ky - kS);
      ctx.lineTo(kx - kS * 0.40, ky + kS);
      ctx.moveTo(kx + kS * 0.30, ky - kS);
      ctx.lineTo(kx - kS * 0.16, ky - kS * 0.04);
      ctx.lineTo(kx + kS * 0.38, ky + kS);
      ctx.stroke();
      ctx.restore();
    }
  }
  // host reacting
  const hp = clamp01((t - 800) / 600);
  if (hp > 0) {
    // U14 (market review §3.4 — THE COUNTER-ARM GESTURE CYCLE): the
    // disclaimer host no longer holds one statue pose — the gesture
    // counter-arms between think/present on a slow per-sentence cycle
    // (5s half-period, keyed to the group clock like commentPrompt's).
    const gesture = (s.hostGesture as string) || (t % 5000 < 2500 ? 'think' : 'present');
    const pose = Stickman.poseAt(t, { gesture, speaking: false });
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (0.94 → 1.22); ground → H*0.672 (envelope 770).
    // PANEL-12 / P2-1: foreground parallax.
    // ── PHASE-5 (the pull-quote's contact verb): the palm rests ON the
    // foot rule's right end — a hand on the desk the quote is set on,
    // 8px clear of the text zone (body core 1480-1640).
    // FRAME-LEDGER FIX (f362 — HOST PARKED AT THE RIGHT EDGE): the 1.22
    // rig read as a speck in the corner. The host joins the premium
    // presence band (1.55, ground H*0.72) — a full column figure presenting
    // beside the K mark, palm still ON the foot rule's end (contact verb
    // preserved; the guard sweep re-arbitrates the wider envelope).
    drawStickmanV2(ctx, 1585, H * 0.72, 1.55, t, { pose, alpha: hp, look: -0.7, parallax: true, contact: { x: 1428, y: footY - 6, hand: 'palm' } }, 33);
  }
}

// ── takeaways: numbered cards 1-2-3 ──────────────────────────────────────────
export function takeawaysScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 241, 0.5);
  const focus = (s.focus as number) ?? 0;
  // QA-SWEEP: x 110→180, y 150→205 — the raised camera register (scenePush
  // 0.22 steady + drift ±22 + exit truck −26) crops a y=150 title ≈65px
  // off the left edge and grazes the fixed watermark band at the top;
  // the guard sweep is the referee.
  sceneTitleLocal(ctx, focus === 0 ? 'Three things worth sitting with' : `Takeaway ${focus}`, 180, 220, clamp01(t / 600), W);
  // V8 FIX: the intro's three-dot progress rail — deterministic from t, one
  // dot fills gold per card landed; the page breathes without leaving the
  // statement register.
  if (focus === 0) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const dp = clamp01((t - 300 - i * 260) / 700);
      ctx.fillStyle = dp > 0 ? rgba(PALETTE.gold, 0.55 + 0.45 * dp) : rgba(PALETTE.grid, 0.7);
      ctx.beginPath();
      ctx.arc(W - 300 + i * 44, 214, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (focus === 0) {
    // intro: three cards float + host counting
    // 100-JUDGE VISUAL AUDIT (Fix 2 — THE PLACEHOLDER CARDS): each card now
    // carries its takeaway's REAL title under the numeral — measured, wrapped
    // to two lines at the card's inner width, set at the read floor (28px).
    // The 6.6s intro frame stops reading as an unfinished template and starts
    // previewing the three payoffs (the retention grammar: show the list, then
    // pay each item).
    const introTitles = (s.titles as string[] | undefined) || [];
    // V8 FIX: the intro stagger tightens (380 → 260ms) — all three preview
    // cards carry their titles by ~1.2s instead of ~1.8s, and a three-dot
    // progress rail beside the title fills as the beat runs: the "static
    // page" gains a pulse that says where the film is going.
    for (let i = 0; i < 3; i++) {
      const ap = clamp01((t - 300 - i * 260) / 700);
      if (ap <= 0) continue;
      const x = W * 0.2 + i * (W * 0.22);
      const y = H * 0.3 + Math.sin(t / 900 + i * 2) * 10;
      ctx.save();
      ctx.globalAlpha = ap;
      card(ctx, x, y, W * 0.18, 220, { r: 30 });
      setFont(ctx, 92, 700, FONT_DISPLAY);
      ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.ink;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x + W * 0.09, y + 108);
      const tl0 = introTitles[i];
      if (tl0) {
        // fit-to-two-lines: the title shrinks (28 → 22 floor) until the wrap
        // fits two lines INSIDE the card — a dropped tail word is a defect,
        // never a windowing choice (the house "never truncate" law).
        let ts = 28;
        let lines = wrapText(ctx, tl0, W * 0.18 - 44, ts, 600);
        while (lines.length > 2 && ts > 22) {
          ts -= 1;
          lines = wrapText(ctx, tl0, W * 0.18 - 44, ts, 600);
        }
        setFont(ctx, ts, 600);
        ctx.fillStyle = PALETTE.inkSoft;
        lines.slice(0, 2).forEach((ln, j) => ctx.fillText(ln, x + W * 0.09, y + 152 + j * 34));
      }
      ctx.restore();
    }
    const poseBase = Stickman.poseAt(t, {
      gesture: t % 5000 < 2500 ? 'count1' : 'count2',
      speaking: false,
    });
    // PHASE 1.3 (panel audit — TAKE ON EVERY CHAPTER PIVOT): chapter 9's
    // opener IS this beat — the side host takes the card clear at 260ms,
    // once his own fade (t/600) has him on screen.
    let pose = poseBase;
    {
      const pt0 = pivotTakeStart(g.s.sceneKey, g.sentenceId, g.sentenceT, t, g.sceneT, 260);
      if (pt0 >= 0) pose = take(pose, t, pt0);
    }
    // v3 (panel P0-3): v2 renderer
    // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
    // ── 100-JUDGE PANEL / PHASE 1 item 1 — CONTACT IS MANDATORY: the same
    // palm-on-the-quote-card verb on the soft variant (shoulder (1499, 476)
    // → edge (1453, 480) = 46px, lands with elbow bend).
    // 100-JUDGE VISUAL AUDIT (Fix 2 regression sweep — TITLES NEED AIR): the
    // intro cards now carry their takeaway titles, and the old perch put the
    // host's head ON card 3's text. He steps right to 1620 (clear of card 3's
    // right edge 1574 by the guard's plating threshold) and the palm solves
    // onto that edge — the contact verb holds, the title reads.
    // M/U6 GUARD ARBITRATION: 1620 → 1596 — the stouter U6 envelope
    // crossed the frame edge by 23px under the guard camera at this rig.
    drawStickmanV2(ctx, 1596, H * 0.667, 1.3, t, { pose, alpha: clamp01(t / 600), look: -0.5, contact: { x: 1566, y: 480, hand: 'palm' } }, 34);
  } else {
    // focused card zooms; other two minimized to the left rail
    for (let i = 1; i <= 3; i++) {
      const isFocus = i === focus;
      const ap = clamp01((t - (isFocus ? 150 : 400)) / 650);
      if (ap <= 0) continue;
      if (!isFocus) {
        // dim rail numbers (B10: shifted left of the 2.0-rig host's
        // envelope — the old 110/230/350 rail put the third numeral
        // inside the bigger figure's head band)
        // M1 FIX (market review §2 — THE MINUTE THAT ONLY CHANGES A NUMBER):
        // the rail is now a PROGRESSION — completed takeaways' numerals
        // turn gold with an underline tick, and the numeral the film just
        // handed off fires a one-second gold ring at every transition. The
        // 60s run reads as a series advancing, not one card re-numbered.
        const done = i < focus;
        const handoff = i === focus - 1 && (g.sentenceT ?? 1e9) < 900;
        const x = 84 + (i - 1) * 92;
        ctx.save();
        ctx.globalAlpha = ap * (done ? 0.8 : 0.35);
        setFont(ctx, 66, 700, FONT_DISPLAY);
        ctx.fillStyle = done ? PALETTE.gold : PALETTE.inkFaint;
        ctx.textAlign = 'left';
        ctx.fillText(String(i), x, H * 0.3);
        if (done) {
          ctx.fillStyle = rgba(PALETTE.gold, 0.8);
          roundRect(ctx, x - 4, H * 0.3 + 14, 44, 5, 2.5);
          ctx.fill();
        }
        if (handoff) {
          const hr = 1 - (g.sentenceT ?? 0) / 900;
          ctx.strokeStyle = rgba(PALETTE.gold, 0.85 * hr);
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(x + 22, H * 0.3 - 24, 40 + 26 * (1 - hr), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // big focused card
    // M/U6 GUARD ARBITRATION: 0.62 → 0.60 width — the raised M2 drift
    // (camX ±78) mapped the old right edge 11px past the frame bound at
    // the guard camera; the card narrows instead of the camera reining in.
    const ap = clamp01(t / 700);
    const cw = W * 0.6;
    const x = W * 0.28;
    // FIX 3 (density payload): the "n of 3" kicker chip above the card —
    // the takeaway series' own navigation, content-true furniture at
    // readable register.
    {
      const kp = clamp01((t - 120) / 500);
      if (kp > 0) {
        ctx.save();
        ctx.globalAlpha = kp;
        const kt = `TAKEAWAY ${focus} OF 3`;
        setFont(ctx, 34, 700);
        const kw = ctx.measureText(kt).width;
        const kx3 = x + 210;
        const ky3 = H * 0.16 - 66;
        ctx.fillStyle = PALETTE.goldWash;
        roundRect(ctx, kx3, ky3, kw + 56, 54, 27);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = rgba(PALETTE.gold, 0.7);
        roundRect(ctx, kx3, ky3, kw + 56, 54, 27);
        ctx.stroke();
        ctx.fillStyle = PALETTE.goldDeep;
        ctx.textAlign = 'left';
        ctx.fillText(kt, kx3 + 28, ky3 + 36);
        ctx.restore();
      }
    }
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
    const dn = s.dataNumber as { big: string; sub: string } | undefined;
    const titleLines = wrapText(ctx, s.title as string, cw - 260, 44, 700);
    const pointLines = pts.map((pt) => wrapText(ctx, pt, cw - 260, 30, 600));
    let ptGap = 36;
    let lineStep = 40;
    const stackH = (gap: number, step: number): number =>
      182 + titleLines.length * 56 +
      pointLines.reduce((a, ls) => a + ls.length * step, 0) +
      Math.max(0, pointLines.length - 1) * gap +
      // C1 CARD DIET (100-JUDGE PANEL REPORT §2.3): the card carries ONE
      // data number — a full-width strip under the points (the card grows
      // to fit it, so the strip can never plate a point's tail).
      (dn ? 104 : 0);
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
    // U14 (market review §3.4 — BUILD, DON'T SWAP): the card's bullets now
    // build ONE PER SENTENCE — the reveal pitch keys to the beat's own
    // duration (≈ sentence cadence) instead of the fixed 550ms sprint, so
    // the takeaway constructs itself across the sentences that speak it.
    setFont(ctx, 34, 600);
    const bulletPitch = Math.max(650, ((g.d ?? 7000) * 0.72) / Math.max(1, pts.length));
    let ptY = y + 190 + titleLines.length * 56;
    pts.forEach((pt, i) => {
      const pp = clamp01((t - 500 - i * bulletPitch) / 700);
      if (pp <= 0) return;
      ctx.globalAlpha = ap * pp;
      ctx.fillStyle = i === pts.length - 1 ? PALETTE.goldDeep : PALETTE.inkSoft;
      pointLines[i].forEach((wl) => {
        ctx.fillText(wl, x + 210, ptY);
        ptY += lineStep;
      });
      ptY += ptGap;
    });
    // C1 CARD DIET — the ONE number: the strip the stack height reserved.
    if (dn) {
      const sy = y + ch - 92;
      registerText('takeaway:dataNumber', x + 40, sy, cw - 80, 68);
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, x + 40, sy, cw - 80, 68, 16);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.gold, 0.7);
      roundRect(ctx, x + 40, sy, cw - 80, 68, 16);
      ctx.stroke();
      ctx.textAlign = 'left';
      setFont(ctx, 48, 700, FONT_DISPLAY);
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(dn.big, x + 72, sy + 50);
      setFont(ctx, 26, 600);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(dn.sub, x + 268, sy + 44);
    }
    ctx.restore();
    // host reacting on the left
    const hp = clamp01((t - 700) / 600);
    if (hp > 0) {
      // v5 (audit P1-3): takeaways 1–2 count on fingers; the third — the
      // earned-optimism payoff — gets the raised thumb
      // PANEL-12 / P2-6 (report §14.6): the FINAL-TAKEAWAY REACTION SHOT —
      // during the reaction window the face draws 1.4× and the gesture
      // holds (the earned beat), while the camera pushes toward the head
      // zone (director.cameraV2, same reactionAt() clock).
      const rP = reactionAt(g.s.sceneKey, g.t, g.d);
      const gesture =
        rP > 0.5 ? 'aha'
        : focus === 1 ? 'count1'
        : focus === 2 ? 'count2'
        : 'thumbsUp';
      let pose = Stickman.poseAt(t, { gesture, speaking: false });
      // BLUEPRINT Phase 2 (report §11): the final takeaway's dedicated pose
      // key — WARM, the earned optimism (chest open, soft raised brows,
      // the big smile), blended by the envelope; the face draws to 1.65×.
      if (rP > 0.02) pose = blendPose(pose, POSES.warm, rP);
      // v3 (panel P0-3): v2 renderer
      // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.667 (envelope 767).
      // QA-SWEEP: W*0.155 → W*0.19 — under the worst steady camera (drift
      // −22 + exit truck −26, s 1.133, plus the 0.40× foreground parallax
      // shift) the feet+shadow envelope crossed the LEFT frame edge; the
      // focused card column (x = W*0.28) stays clear of the body envelope.
      // PLAYBOOK D3: ground 0.667 → 0.635 — the feet band cleared the
      // 2-row pill by zero at max camera (stickman@383,730, 22px).
      // DOSSIER FOLLOW-UP: ground 0.635 -> 0.615 — the 0.635 ground was
      // sweep-certified at ZERO margin and the sweep caught a 12px graze
      // into the 2-row pill at the max camera + mid-group reframe stack.
      // ── 100-JUDGE PANEL / PHASE 1 item 1 — CONTACT IS MANDATORY (report
      // §6 Phase 1): the host's hand ON the takeaway card he is walking
      // through. Steps in to 420 (body core 329-511 — 27px clear of the
      // card's registered left edge 538, feet band still clear of the
      // frame's left edge under the steady camera) and the near hand palms
      // the card's left edge at chest height — the hand on the list he is
      // counting down, contact shadow at the press point.
      // B10 RE-SPEC (Visual Quality Audit §3.2 — EMPTY-FIELD COMPOSITIONS):
      // the 1.3 rig left ~55% of the frame as mint field around a ~315px
      // figure — "passing a floor is not the same as owning a frame". The
      // editorial close-up bar: the host DOMINATES the left third at the
      // 2.0 rig (~485px, a third of the frame's height) with designed
      // space around him; the palm contact on the card's left edge still
      // lands (shoulder (420, ~365) -> (546, 460) = 158px, inside the
      // 228px arm envelope at this rig).
      drawStickmanV2(ctx, 420, H * 0.615, 2.0, t,
        {
          pose, alpha: hp, look: 0.6,
          prop: focus === 3 && rP <= 0.5 ? 'thumb' : undefined,
          // AUDIT-PHASE-3: faceScale peak 1.65 -> 1.8 — the face draws
          // larger during the reaction close-up; sclera eyes, brow
          // arches, talk envelope read at feed scale.
          faceScale: 1 + 0.8 * rP,
          parallax: true,
          contact: { x: 546, y: 460, hand: 'palm' },
        }, 35);
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
  // PHASE-0 (report §6, Fix 2 — KILL THE EMPTY BANDS, commentPrompt 21%):
  // the question rode 0.32H with nothing above it — the whole top band
  // read empty at the phone gate. A "YOUR TURN" kicker chip at 0.20H
  // (gold wash pill, the comment-field prompt) gives the frame a top
  // anchor; the question and sub then cascade 0.32/0.42H under it.
  {
    const kp = clamp01((t - 200) / 500);
    if (kp > 0) {
      ctx.save();
      ctx.globalAlpha = kp;
      const kx = 'YOUR TURN — DROP A COMMENT';
      setFont(ctx, 34, 700);
      const tw = ctx.measureText(kx).width;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, W / 2 - tw / 2 - 30, H * 0.20 - 30, tw + 60, 60, 30);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.gold, 0.7);
      roundRect(ctx, W / 2 - tw / 2 - 30, H * 0.20 - 30, tw + 60, 60, 30);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'center';
      ctx.fillText(kx, W / 2, H * 0.20 + 10);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.textAlign = 'center';
  setFont(ctx, 84, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(q, W / 2, H * 0.32);
  setFont(ctx, 34, 600);
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
  // B2 (market review — BUBBLES PACK, NOT COLLIDE): the per-index slot put
  // two clamped bubbles into the same region of one row, printing one
  // comment through another. Each row now packs LEFT-ALIGNED from measured
  // widths — real comment-field grammar — and the row yields to the
  // presenter's envelope like every other resident.
  const rowX = [40, 40];
  comments.forEach((c, i) => {
    const bp = clamp01((t - 600 - i * 500) / 800);
    if (bp <= 0) return;
    setFont(ctx, 34, 600); // v9 (D-07): floor
    const tw = ctx.measureText(c).width;
    const AV = 30; // avatar column
    const halfBW = tw / 2 + 26 + AV;
    const plateW = tw + 52 + AV;
    const row = i % 2;
    const hostLeftEdge = W * 0.805 - 150;
    let x = rowX[row] + halfBW;
    if (x + halfBW > hostLeftEdge - 20) return; // the row is full — the comment stays in the VO, never prints under the host
    rowX[row] = x + halfBW + 28;
    const y = H * (0.52 + row * 0.14) + Math.cos(t / 1100 + i) * 10;
    const toneCol = i % 2 ? PALETTE.up : PALETTE.gold;
    ctx.save();
    ctx.globalAlpha = bp * 0.95;
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
  // PANEL-12 / P2-1: foreground parallax.
  // QA-SWEEP: W*0.855 → W*0.845 — under the raised camera register
  // (scenePush 0.22 steady + drift +22, no hero move on this scene) the
  // feet+shadow envelope crossed the right frame edge at worst; the guard
  // sweep is the referee.
  // PLAYBOOK D3: anchor 0.845 → 0.83 and ground 0.667 → 0.635 — the feet
  // band clears both the frame edge and the 2-row pill at max camera.
  // M/U6 GUARD ARBITRATION: 0.83 → 0.805 — the stouter U6 envelope crossed
  // the frame edge by 39px under the guard camera at this staging.
  drawStickmanV2(ctx, W * 0.805, H * 0.635, 1.25, t, { pose, alpha: clamp01(t / 700), look: -0.5, parallax: true }, 36);
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
  // P1-2 (report §12.2): the farewell lands in the gold room — the last
  // frames of the film are no longer 80% near-white.
  scenePlate(ctx, W, H, g.chapterTone ?? 'gold');
  kMotifs(ctx, W, H, t, 0);
  // P2-3 (audit Table 4 — "coins only where money moves"): the end
  // screen's five floating coins were the same "sprinkles doing zero
  // work" as the gas pump's — no money moves in a farewell. Gone; the
  // teaser card, brand mark and CTA carry the frame.

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
  // BLUEPRINT Phase 5 (report §11 — "an end screen with parallax cards"):
  // the card rides the MID plane at 0.45x the camera (the far brand mark
  // below rides 0.12x, the coins 1.35x) — the farewell frame separates
  // into layers as the ch9 hero pullback breathes, instead of one flat
  // composition. Pure function of camState; the card is unregistered
  // background-grade furniture, so the guard is untouched.
  ctx.translate(camState.dx * 0.45, camState.dy * 0.45 + (1 - easeOutCubic(ap)) * 40);
  card(ctx, nx, ny, 700, 420, { r: 30 });
  // v8: card interior upSoft (teal wash) — the vision panel read the old
  // cream interior as the last big 'aged paper' wash in the film
  ctx.fillStyle = PALETTE.upSoft;
  roundRect(ctx, nx + 24, ny + 24, 612, 250, 20);
  ctx.fill();
  // PLAYBOOK T4 (report §8.5): the teaser thumbnail's K re-becomes MASS —
  // RETIRED (PHASE-5, D-08 follow-up): the turn param swept the extrusion
  // axis to 95° at t≈2s and crossfaded the FULL glossy stack back in —
  // walls, AO wedge, chamfer, glint — re-glossing the very K that Phase
  // 3.4 un-speculared, on the film's last frame. The farewell K stays the
  // PAINTED flat-gold mark (turn = 0): two-tone face + one-light depth
  // wall, the same ink language as everything else on screen. The card's
  // chart carries the motion instead — it's the real one (below).
  drawK3D(ctx, nx + 170, ny + 145, 76, clamp01((t - 300) / 900), t, false, 0);
  // PHASE-5 (feed board: "thumbnail-in-thumbnail with an unreadable chart
  // at 320px"): the decorative 4-point squiggle is GONE — the teaser now
  // carries a REAL labeled mini-chart of the film's own Nasdaq series:
  // draw-on reveal, endpoint dot, value badge, hairline baseline. A chart
  // that says what it shows survives the 320px gate; a squiggle never did.
  {
    const cp = clamp01((t - 500) / 1100);
    if (cp > 0) {
      const series: [number, number][] = [
        [0, 100], [3, 102], [5, 103], [7, 101], [9, 97.5], [11, 100.5],
        [13, 104], [16, 107], [19, 110.5], [22, 114], [25, 117],
        [28, 119.5], [31, 121.5], [34, 123], [37, 124.5], [40, 122],
      ];
      const px0 = nx + 306, px1 = nx + 612;
      const py0 = ny + 96, py1 = ny + 226;
      const vmin = 95, vmax = 127;
      const mx = 40;
      const fx = (u: number): number => px0 + (u / mx) * (px1 - px0);
      const fy = (v: number): number => py1 - ((v - vmin) / (vmax - vmin)) * (py1 - py0);
      // hairline baseline — the chart plane
      ctx.strokeStyle = rgba(PALETTE.inkSoft, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px0, py1 + 12);
      ctx.lineTo(px1, py1 + 12);
      ctx.stroke();
      let reveal = cp;
      if (reveal > 0.85) {
        const u2 = (reveal - 0.85) / 0.15;
        reveal = 0.85 + 0.15 * (1 - Math.pow(1 - u2, 2)); // the pen-lift settle
      }
      const drawnU = reveal * mx;
      ctx.strokeStyle = PALETTE.upVivid;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let ep: [number, number] | null = null;
      for (const [u, v] of series) {
        if (u > drawnU) break;
        const p: [number, number] = [fx(u), fy(v)];
        if (!ep) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
        ep = p;
      }
      ctx.stroke();
      if (ep && reveal >= 0.999) {
        const pop = 0.6 + 0.4 * clamp01((t - 500 - 1100) / 140);
        ctx.fillStyle = PALETTE.upVivid;
        ctx.beginPath();
        ctx.arc(ep[0], ep[1], 6.5 * pop, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ep[0], ep[1], 2.8 * pop, 0, Math.PI * 2);
        ctx.fill();
      }
      // the value badge — the chart's one number, data-true
      const bp3 = clamp01((t - 900) / 400);
      if (bp3 > 0) {
        ctx.globalAlpha *= bp3;
        setFont(ctx, 24, 700);
        const bt2 = '+22% · 12 mo';
        const bw2 = ctx.measureText(bt2).width;
        ctx.fillStyle = PALETTE.up;
        roundRect(ctx, px1 - bw2 - 26, py0 - 34, bw2 + 26, 34, 17);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(bt2, px1 - bw2 - 13, py0 - 11);
        ctx.globalAlpha /= Math.max(bp3, 1e-6);
      }
    }
  }
  setFont(ctx, 34, 700); // v9 (D-07): floor
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'left';
  ctx.fillText('NEXT WEEK', nx + 24, ny + 330);
  setFont(ctx, 34, 600);
  ctx.fillStyle = PALETTE.ink;
  wrapText(ctx, nextVideoTitle, 600, 29, 600).forEach((ln, i) => {
    ctx.fillText(ln, nx + 24, ny + 366 + i * 38);
  });
  ctx.restore();

  // AUDIT-ROUND-2 (fix 24, panel round 2 — "OR NOTHING"): the big soft
  // background K3D at whisper alpha was judged AGAIN as a ghost stamp
  // ("reads as texture rather than a deliberate mark") and it stacked a
  // THIRD K on a frame that already carries the teaser-card K and the
  // channel lockup — the audit's C3: "character, card, giant watermark K,
  // subscribe, captions all fighting". The four-ghost motif field is already
  // gone (kMotifs = 0 here); the right zone now breathes — the farewell
  // frame belongs to the card, the host and the subscribe, and the brand
  // rides the card's own K. Nothing else.

  // host waving, presenting the card from its right (inside safe zone) ──
  // v3 (P0-3): v2 renderer. v4 (vision panel, flagged twice): the host stood
  // at W*0.30 — directly UNDER the teaser card, and his head + waving arm
  // crossed the NEXT WEEK title text near “Concentration”. He now stands
  // clear to the card's right (body x≈795–895 vs text right edge ≈739),
  // still inside the left-55% YouTube-safe zone, waving toward the card.
  // v8: he PRESENTS — points at the WATCH NEXT arrow below (the scene's
  // click mechanism) instead of waving at nothing.
  // dossier follow-up (vision-verified): the host pointed screen-RIGHT —
  // into YouTube's reserved (rendered-empty) end-screen zone — while the
  // WATCH NEXT chip sits BELOW-LEFT of him under the card. The pose flips
  // to pointL so the gesture sells the actual click target.
  const pose = {
    ...POSES.pointL,
    lAU: POSES.pointL.lAU + Math.sin(t / 900) * 4,
  };
  // v9 (report D-02): H*0.70 → H*0.675 — the guard caught this centered
  // figure's shadow grazing the 2-row pill envelope by 16px at the widest
  // captions; a touch more headroom settles it.
  // P1-1 (report): +30% (1.0 → 1.3); ground → H*0.645 (envelope bottom
  // 697+47 = 744 — the widest-caption worst case clears by 32px).
  // ── 100-JUDGE PANEL / PHASE 1 item 1 — CONTACT IS MANDATORY (report
  // §6 Phase 1): the farewell host's hand ON the WATCH NEXT card. The
  // card rides the MID plane (camState 0.45×); the host joins the SAME
  // plane (parallax 0.45) so palm and card travel together under the
  // camera — the near hand palms the card's right edge at (820, 505)
  // every frame, contact shadow where hand meets card (reach check:
  // shoulder (849, 460) → edge 52px, lands).
  drawStickmanV2(ctx, W * 0.44, H * 0.645, 1.3, t, { pose, alpha: clamp01((t - 800) / 600), look: -0.5, parallax: true, parallaxAmt: 0.45, contact: { x: 820, y: 505, hand: 'palm' } }, 37);

  // ── v8: the WATCH NEXT arrow — the end screen's click mechanism ────────
  // The panel's verdict: "no thumbnail target = the most commercially
  // important frame does brand work only." YouTube fills the right 40% with
  // its own video element + subscribe circle; a bold outlined arrow + chip
  // INSIDE our safe zone points at exactly where those land, and the host's
  // pointing gesture sells it. Geometry-checked: clears the teaser card
  // (ends y≈659), the host (x≥785). (P2-3: the coins it used to clear are gone.)
  {
    const ap = clamp01((t - 1400) / 600);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const ax = nx + 350; // v10: centred under the (wider) card
      // P0 defect sweep (SUBSCRIBE VS CAPTION PILL): the row rode at
      // ~y790 — straddling CAPTION_ZONE_TOP (800), the karaoke pill plated
      // the click target. The row now RESERVES the caption strip the way
      // the one-row caption class does: it clamps above the zone with its
      // own shadow air, and the card-to-row gap absorbs the difference.
      const ay = Math.min(ny + 420 + 76, CAPTION_ZONE_TOP - 58);
      // v10.1 (panel 11 re-review, GROWTH-1): the outlined display word read
      // as "clashing with the clean system typography everywhere else" —
      // a stroked wordmark is a different type system. The CTA is now a
      // solid broadcast CHIP: teal plate, white 700 label, gold chevron
      // riding inside the chip's right end. Same slot under the card.
      const chipW = 470, chipH = 74;
      const chx = ax - chipW / 2, chy = ay - chipH / 2 - 4;
      // PANEL-12 / P3-3: one-light rule — the CTA chip's shadow falls
      // lower-left like every other shadow in the film
      ctx.fillStyle = rgba(PALETTE.shadow, 0.16);
      roundRect(ctx, chx - 6, chy + 12, chipW, chipH, 37);
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
      // PHASE 4 (audit Table 3, 19-endScreen): "the SUBSCRIBE affordance is
      // plain text with no target box — a lost click at the exact moment
      // clicks matter most." The strip becomes a real CLICK TARGET: the
      // platform's end-screen subscribe element is a BOX, so the film draws
      // one — a gold plate with an ink border (the clickable read), the
      // channel's K avatar, the SUBSCRIBE label and the bell affordance,
      // all in the film's own flat language (the WATCH NEXT chip's
      // sibling, one-light shadow lower-left like every shadow here).
      // the box sits in the certified-free band (below the WATCH NEXT chip
      // at y<=803, above the caption pill at y>=965) — the caption never
      // plates the click target.
      // 100-JUDGE REPORT (fix D30 — THE PLATED CLICK TARGET): the 108-tall
      // box at y 850-958 sat INSIDE the caption pill's band (top ≈864) —
      // the karaoke pill plated the box's right end every wide-caption
      // frame. The v10 "below-pill gap" fix (974-1054) FAILED THE SAME WAY:
      // CAPTION_ZONE_TOP is 800 and the 1-row karaoke pill tops at ≈990 —
      // the audit's frame 35 caught the pill plating the button's whole
      // upper half. There is NO caption-free band under y 800 on this beat
      // (the VO runs to the end), so the click target LEAVES the caption
      // zone entirely: it takes the free top band of the left-55% safe
      // zone, right of the channel lockup (lockup spans x≈373-703 at y
      // 137-225 — the box at x 730 clears it horizontally) and above the
      // teaser card (y 270). The standard channel-page pattern — subscribe
      // element beside the channel identity — and structurally unplatable.
      const bx = 748, by = 100, bw = 392, bh = 74;
      registerRect('endScreen:subscribe', bx - 6, by, bw + 6, bh + 14);
      // PANEL-12 / P3-3: one-light rule — the box's shadow falls
      // lower-left like the CTA chip's.
      ctx.fillStyle = rgba(PALETTE.shadow, 0.16);
      roundRect(ctx, bx - 6, by + 12, bw, bh, 18);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, bx, by, bw, bh, 18);
      ctx.fill();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.78);
      ctx.lineWidth = 3.5;
      roundRect(ctx, bx, by, bw, bh, 18);
      ctx.stroke();
      // the avatar — an ivory circle with the channel's gold K mark
      const avY = by + 40;
      ctx.fillStyle = '#FFFCF4';
      ctx.beginPath();
      ctx.arc(bx + 48, avY, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx + 48, avY, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + 48 - 9, avY - 12); ctx.lineTo(bx + 48 - 9, avY + 11);
      ctx.moveTo(bx + 48 - 9, avY); ctx.lineTo(bx + 48 + 4, avY - 12);
      ctx.moveTo(bx + 48 - 9, avY); ctx.lineTo(bx + 48 + 4, avY + 10);
      ctx.stroke();
      // the label + the bell affordance
      setFont(ctx, 34, 700, FONT_UI);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'left';
      ctx.fillText('SUBSCRIBE', bx + 92, avY + 12);
      const bellX = bx + 92 + ctx.measureText('SUBSCRIBE').width + 30;
      const bellY = avY - 7;
      ctx.strokeStyle = rgba(PALETTE.ink, 0.72);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bellX - 12, bellY + 10);
      ctx.quadraticCurveTo(bellX - 12, bellY - 14, bellX, bellY - 14);
      ctx.quadraticCurveTo(bellX + 12, bellY - 14, bellX + 12, bellY + 10);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bellX - 15, bellY + 10);
      ctx.lineTo(bellX + 15, bellY + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bellX, bellY + 16, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      // the sourcing promise — the box's second line (it rides INSIDE the
      // target now: the caption band below runs the whole end beat, and a
      // promise under the pill was a promise nobody reads).
      setFont(ctx, 24, 600);
      ctx.fillStyle = rgba(PALETTE.ink, 0.62);
      ctx.fillText('every source, linked below', bx + 104, by + 104);
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
    setFont(ctx, 34, 600);
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
