/**
 * Data scenes: chart pairs, the big annotated journey chart, pies, dot grids,
 * Mag-7 chips, comparison bars, trio convergence, K definition, gas pump,
 * recession gauge, AI datacenter, stat cards, owner-vs-worker, fund split,
 * odds spread.
 */

import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, springTo } from './easing';
import { PALETTE, TONE, card, chip, chipWidth, rgba, roundRect, setFont, paintBg, glowBlob, scenePlate, CAPTION_ZONE_TOP, TYPE_FLOOR } from './theme';
import { bokehField, kMotifs, lightRays, drawK, drawK3D, floatCoins, sparkles, hazeBands, impactRing, microShake, depthShift } from './effects';
import { SceneCtx } from './scene-context';
import { reactionAt, reactionStart } from './scene-context';
import { lineChart, pieChart, barRow, dotGrid, gauge, statCard, sourceTag, sceneTitle, wrapText } from './charts';
import { Stickman, POSES, blendPose, accentPulse, take } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';
import { registerRect, registerText } from './collision';

// v10 (panel COLOR-2): bg() takes an optional PLATE tone — data scenes sit on
// a soft tinted plate instead of raw white.
// P1-2 (report §12.2): the plate is no longer optional — EVERY scene sits in
// a room. Callers that hand-picked a tone keep it; the rest inherit the
// chapter's tone (the color journey), so the whole film carries a field.
function bg(g: SceneCtx, seed: number, gold = 0.4, plate?: 'up' | 'down' | 'gold' | 'neutral'): void {
  paintBg(g.ctx, g.W, g.H, g.t, g.chapterTone);
  scenePlate(g.ctx, g.W, g.H, plate ?? g.chapterTone ?? 'up');
  // PLAYBOOK T2 (report §8.5 — A FLOOR FOR THE FLAT ROOMS): every data
  // room gains a 1-POINT FLOOR — 6 receding hairlines converging on a
  // horizon at 0.66H (the same grammar the datacenter's corridor uses,
  // at whisper register). 8 strokes, ~0.5% render cost, instant
  // room-ness on every scene that shares this bg(): the "assembled, not
  // animated" flat-canvas read dies. Pure function of (W, H) — static
  // furniture, scrub-safe, never registers with the guard (it sits
  // behind every content rect by construction).
  {
    const { ctx, W, H } = g;
    const horizon = H * 0.66;
    const vpX = W / 2;
    ctx.save();
    ctx.strokeStyle = rgba(PALETTE.grid, 0.5);
    ctx.lineWidth = 1.4;
    // the horizon hairline (broken at centre so it never reads as a rule)
    ctx.beginPath();
    ctx.moveTo(W * 0.04, horizon);
    ctx.lineTo(W * 0.44, horizon);
    ctx.moveTo(W * 0.56, horizon);
    ctx.lineTo(W * 0.96, horizon);
    ctx.stroke();
    // 6 floor lines receding to the VP — spaced wide at the frame edge,
    // converging as they approach centre (perspective division)
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const xEdge = vpX + k * W * 0.30;
      ctx.beginPath();
      ctx.moveTo(xEdge, H * 0.995);
      ctx.lineTo(vpX + (xEdge - vpX) * 0.18, horizon + 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  bokehField(g.ctx, g.W, g.H, g.t, { intensity: 0.75, seed, gold });
  lightRays(g.ctx, g.W, g.H, g.t, { alpha: 0.45 });
  kMotifs(g.ctx, g.W, g.H, g.t, 0.18);
}

function hostSmall(
  g: SceneCtx, x: number, gesture = 'present', seed = 3,
  // v9 (report D-02): default ground H*0.86 → H*0.68 — the side hosts'
  // feet+shadows (to y≈985) sat inside the caption pill band on every
  // wide-pill frame (caught by the P0-1 guard sweep at pie/dot/bars/pump/
  // gauge/AI/odds scenes). Same stage line as the editorial hosts, with
  // worst-case camera margin.
  // P1-1 (report): +30% (0.84 → 1.09); ground H*0.68 → H*0.66 — envelope
  // bottom 713+39 = 752, clear of the worst-case 2-row pill envelope (776)
  // by 24px. All hostSmall call sites inherit the bump.
  groundY = g.H * 0.66, scale = 1.09,
  // PANEL-12 / P2-6: reaction opts — during the reaction window the side
  // host swaps to a reaction gesture, the face enlarges and the talk
  // envelope pauses (the camera push lives in director.cameraV2, driven
  // by the same reactionAt() clock).
  // BLUEPRINT Phase 2+5 (report §11): the reaction is a POSE KEY now —
  // 'shock' on the twist (face 1.8×, 2× jaw gasp), 'wry' on the paradox
  // resolve, 'warm' on the final takeaway — blended over the cycle pose
  // by the envelope, never a hard swap.
  reaction = 0,
  reactionPose = 'aha',
  faceTarget = 1.4,
  jawX = 1,
  // PANEL-12 / P2-1: parallax opt-OUT for figures that stand ON data
  // (the chartTwin / barsCompare climbers ride a bar's tip — if the figure
  // parallax-shifts while its bar holds still, his footing slides). Hosts
  // on the open stage keep the foreground plane.
  // P2-4 (audit Table 4): `parallaxD` — the depth differential. 0.40 is
  // the certified default; hero moments (kDef's naming beat, the
  // cold-open shock) pass 0.55; hosts planted INSIDE data pass false.
  parallax = true,
  parallaxD = 0.4,
  // 100-JUDGE PANEL / Phase 2 item 3 — A SIT-AND-RISE FOR THE MOOD
  // CHAPTERS (report §6 Phase 2): "One new pose pair (sitBack on the
  // stat card edge) with the ground-contact math the walk already
  // uses. Staging variety; the 12-second-hold risk dies with it."
  // sitAt: the beat-local ms when the host SITS (the card's settle
  // beat); undefined = the standing cycle (every existing call site).
  // The sit: sitRise (the push-off) for 480ms, then sitBack (the perch) held;
  // groundY0 shifts up to the seat line so the hips land
  // ON the card's edge — the same pelvis-anchored contact math, the seat
  // standing in for the ground line.
  sitAt?: number,
  seatY?: number,
  // CONTACT VERBS (P2 grammar, dossier follow-up): the scene-space point
  // the near hand must LAND ON every frame (solved by stickman-v2's armIk).
  // Scenes must place the host inside arm's reach of the point.
  contact?: { x: number; y: number; hand?: 'palm' | 'fist'; bend?: 1 | -1 },
  // faceDir: explicit gesture/eyeline direction when the host stands in a
  // spot the x<W/2 heuristic misreads (e.g. beside the pie, left of centre,
  // presenting content that sits further LEFT).
  faceDir?: 'left' | 'right'
): void {
  // v10 (panel CHAR-1/CHAR-3): the side host CYCLES through a gesture set
  // instead of holding one pose for the whole scene — "two poses: shrug,
  // arms-out" was the panel's read, and it was right: every hostSmall call
  // site passed a single static gesture. A 12s deterministic cycle with a
  // smooth crossfade gives the side host the same articulated life the
  // main host got in P0-4. scarf OFF at side scale — the knot read as "a
  // stain" at 1.09×; the scarf is a HERO-scale brand cue (1.3× and up).
  const dir: 'left' | 'right' = faceDir ?? (x < g.W / 2 ? 'right' : 'left');
  const pointIn = dir === 'right' ? 'pointR' : 'pointL';
  const cycle: string[] = [gesture, 'talkB', gesture, pointIn];
  // AUDIT-ROUND-2 (fix 11 — HEAD YAW AT CONTENT): the side host's head
  // turns toward his content on the same term the arms use — the
  // eyeline connects (C5) at every side-host scale in the film.
  const bias = (dir === 'right' ? 'right' : 'left') as 'right' | 'left';
  const ph = (g.t / 3000 + seed) % 4;
  const idx = Math.floor(ph);
  // PANEL-12 / P1-2: the side-host gesture crossfade re-blends through the
  // analytic spring — same motion grammar as the main host's talk cycle.
  const tInto = Math.min(ph - idx, 1 - (ph - idx)) * 3000;
  const k = clamp01(tInto / 620);
  // P1-6 (report §12.6): the owner/worker pair keys off the sentence
  // grammar too — same ids, same word onsets, their own gesture cycle.
  const sentOpts = {
    sentenceId: g.sentenceId,
    prevSentenceId: g.prevSentenceId,
    sentenceT: g.sentenceT,
    wordTimes: g.gWordTimes,
    pointBias: bias,
  };
  const poseA = Stickman.poseAt(g.t, { gesture: cycle[idx % 4], speaking: g.speaking, ...sentOpts });
  const poseB = Stickman.poseAt(g.t, { gesture: cycle[(idx + 1) % 4], speaking: g.speaking, ...sentOpts });
  const w = k > 0 ? clamp01(springTo(0, 1, k * 620, 150, 19)) : 0;
  let pose = w > 0 ? blendPose(poseA, poseB, w) : poseA;
  // BLUEPRINT Phase 2: the dedicated reaction pose key, BLENDED by the
  // envelope (the old >0.5 hard swap read as a glitch mid-cycle).
  if (reaction > 0.02 && POSES[reactionPose]) {
    pose = blendPose(pose, POSES[reactionPose], clamp01(reaction * 1.15));
  }
  // 100-JUDGE PANEL / Phase 1 item 3 — TAKE GRAMMAR (report §6 Phase 1):
  // the reaction window now opens with a TAKE — a 2-frame hold, then a
  // 20% brow overshoot + blink + head-torso double-bounce, layered over
  // whatever pose the window has blended in. take() is a pure function of
  // (t, t0) and returns the pose untouched outside its 380ms window, so
  // the existing reaction envelope, camera push and talk pause all keep
  // their exact clocks. t0 = the reaction clock's own start (gt scaled):
  // the REACTIONS table gives each window (start, end) in the group-local
  // clock — the take fires at the window's start beat.
  // Wired at all THREE pivots (twist/paradox/takeaway): every hostSmall
  // call site with a reaction envelope inherits it.
  {
    const r0 = reactionStart(g.s.sceneKey, g.t, g.d);
    if (r0 >= 0) pose = take(pose, g.t, r0);
  }
  // BLUEPRINT Phase 2 (judge round-2 calibration): the reaction beat holds
  // the mouth OPEN in a gasp (talk 0.88 drives the round-O shape, and the
  // jaw2x multiplier doubles it) — a paused/closed mouth on a shock face
  // read as "presenting", not reacting.
  const talk = Math.max(
    g.speaking ? talkAt(g.beatT, g.wordTimes) * (1 - reaction) : 0,
    0.88 * reaction
  );
  // v10.1: hostBody — the guard's host-vs-content pass needs the full body,
  // not just the feet band (the statCards host plated a card unseen).
  // PANEL-12 / P0-5: faceScale 1.15 — side hosts render at 1.09× body scale;
  // the face needs the help more than the body does (report §12.5).
  // PANEL-12 / P2-1: parallax — the figure rides the foreground plane.
  // BLUEPRINT Phase 5: faceTarget drives the reaction close-up (1.8 on
  // the twist); jawX drives the 2× gasp.
  // P1-6 (audit Table 3): the word-accent SMEAR — the talking arm carries
  // a three-ghost graduated motion trail on every gesture spring (the
  // audit's "arms are passive stumps" — the smear opt existed but was
  // never driven). Paused during reaction windows (the reaction pose is
  // a hold, not a spring).
  const smear = g.speaking ? accentPulse(g.beatT, g.wordTimes, g.wordTexts) * (1 - reaction) : 0;
  // 100-JUDGE PANEL / Phase 2 item 3 — the SIT-AND-RISE. When sitAt is
  // set, the standing cycle blends into sitRise (the 480ms push-off)
  // then settles into sitBack (the perch on the card edge). The ground
  // line shifts to the SEAT (the card's bottom edge) so the pelvis
  // lands ON it — the same ground-contact math, the seat in place of
  // the floor. blendPose carries the transition (the house 480ms
  // spring), so the sit is a LANDING, not a teleport.
  let groundY2 = groundY;
  if (sitAt !== undefined) {
    const sitP = clamp01((g.t - sitAt) / 480);
    if (sitP > 0) {
      const sitPose = sitP < 1 ? blendPose(POSES.sitRise, POSES.sitBack, sitP) : POSES.sitBack;
      pose = blendPose(pose, sitPose, easeOutCubic(sitP));
      groundY2 = seatY !== undefined ? lerp(groundY, seatY, easeOutCubic(sitP)) : groundY;
    }
  }
  drawStickmanV2(
    g.ctx, x, groundY2, scale, g.t,
    {
      // P2-4 (audit Table 4 — depth with intent): the side hosts now
      // ENTER WITH THE WHIP — alpha ramps from t=160 (was 500), so the
      // host is on screen for the 300ms entry truck and his 0.55/0.40
      // parallax differential rides the film's biggest camera move
      // (~90px): the plane separation is VISIBLE at every scene entry,
      // not a single-digit-pixel threshold effect.
      pose, alpha: clamp01((g.t - 20) / 160), look: dir === 'right' ? 0.5 : -0.5, talk, smear,
      scarf: false, hostBody: true,
      faceScale: 1 + 0.15 + (faceTarget - 1.15) * reaction,
      jaw2x: 1 + (jawX - 1) * reaction,
      parallax,
      // P2-4 (audit Table 4): the reaction windows ARE the hero moments —
      // the parallax differential deepens 0.40 → 0.55 through them.
      // P2-4 (audit Table 4) + P0-3 guard truth: hosts re-staged INSIDE
      // the data (the fundSplit host stands against the 493 wall) ride
      // the DATA's plane — their parallax differential eases to ZERO
      // through the reaction window (the push itself is the depth cue;
      // a foreground differential would slide them into the cards, as
      // the guard certified on the round-1 re-stage). The 0.55 hero
      // differential lives on hosts with clear space: the cold-open
      // shock and the editorial host.
      parallaxAmt: parallax ? parallaxD * (1 - clamp01(reaction)) : undefined,
      // CONTACT VERBS: the solved hand — the scene declared the touch.
      contact,
    },
    seed
  );
}

// ── chartTwin: S&P + Nasdaq mini charts ─────────────────────────────────────
export function chartTwinScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 61, 0.4, 'up'); // v10: the data room plate
  // PLAYBOOK D3 follow-up: the twin charts shift right 60px (title 180→240,
  // chart 190→250) — the entry whip (-90px) + left drift (-52px) at max
  // push ran the title's left edge 46px past the frame bound.
  const cw = W * 0.38;
  // PANEL-9 R2c (bottom-band clearance): the v8 stack put the per-chart
  // badges at y≈816 and the extraBadge card at y 886-978 — INSIDE the
  // karaoke caption zone (opaque pill, top ≈ 796 for two rows), so the
  // caption sliced through "+24% · Nasdaq-100 · 12 months", and the
  // left-anchored badges collided with the "12 mo ago" x-labels. New
  // stack: the punchline stat moves to a chip in the (previously dead)
  // top band, the per-chart badges sit in each card's title row, and the
  // plots end at y≈689 with x-labels at y≈722 — everything clears the
  // caption zone by ~30px.
  const ch = H * 0.36;
  const cy = H * 0.305;
  const charts = (s.charts as any[]) || [];
  charts.slice(0, 2).forEach((c, i) => {
    const x = W * 0.11 + i * (cw + W * 0.06); // PLAYBOOK D3: +60px — whip+drift left-edge clearance
    const ap = clamp01((t - i * 260) / 650);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate(0, (1 - easeOutCubic(ap)) * 36);
    card(ctx, x, cy - 66, cw, ch + 104, { r: 30 });
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    ctx.fillText(c.title, x + 36, cy - 16);
    // badge — title row, right-anchored (R2c: was bottom-left at y≈816,
    // colliding with the "12 mo ago" x-label; same visual band as the
    // title so the headline stat reads at the card's top edge)
    // v9 (report D-04): the badge now matches its chart's tone — S&P teal,
    // Nasdaq gold — so the outperformance is color-encoded, not just numbered.
    setFont(ctx, 40, 700);
    ctx.fillStyle = TONE(i === 0 ? 'up' : 'gold').main;
    ctx.textAlign = 'right';
    ctx.fillText(c.badge, x + cw - 36, cy - 10);
    ctx.textAlign = 'left';
    ctx.restore();
    lineChart(ctx, {
      x: x + 40, y: cy + 30, w: cw - 80, h: ch - 60,
      // v9 (report D-04): both series hard-coded tone 'up' — the twin
      // charts rendered in IDENTICAL teal and the 3.6-point Nasdaq
      // outperformance was invisible ("both charts look like the same
      // chart"). S&P stays teal; Nasdaq — the star of the beat — renders
      // in display gold so the eye reads winner vs baseline instantly.
      series: [{ name: '', tone: i === 0 ? 'up' : 'gold', points: c.points }],
      p: clamp01((t - 200 - i * 260) / 2400),
      t,
      yFormat: 'idx100', showYAxis: true, gridLines: 3,
      // PANEL-9 R2: twin charts shipped axis-less — "illustrative squiggles",
      // not data. Y axis on + a 3-stop time axis underneath.
      // R2b: yFormat 'index'→'idx100' — the axis now reads as % change vs
      // 12 mo ago (matches the +18.4% / +22% badges) instead of raw
      // 93-129 "price levels" the re-review panel read as invented numbers.
      // v9 (report P0-5): 'today' → "Jul '26" — the film records in one
      // month and uploads in another; an axis that says "today" in November
      // is a four-months-stale claim in a channel whose currency is freshness.
      xLabels: [
        { at: 0, label: '12 mo ago' },
        { at: 20, label: '6 mo ago' },
        { at: 40, label: "Jul '26" },
      ],
    });
  });
  // extra badge (Nasdaq-100) — punchline chip in the top band (R2c: was a
  // full-width card at y 886-978, inside the caption pill zone)
  const eb = s.extraBadge as any | undefined;
  if (eb) {
    const ap = clamp01((t - 2000) / 700);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const bx = W * 0.08;
      const by = 128;
      setFont(ctx, 46, 700);
      const bigW = ctx.measureText(eb.big).width;
      setFont(ctx, 34, 600);
      const labW = ctx.measureText(eb.label).width;
      const chipW = 36 + bigW + 24 + labW + 36;
      // v9 (report D-04): the punchline chip matches the Nasdaq gold tone
      // it quantifies (was teal on a teal-topped chart).
      const ebTone = TONE('gold').main;
      card(ctx, bx, by, chipW, 84, { r: 26 });
      setFont(ctx, 46, 700);
      ctx.fillStyle = ebTone;
      ctx.textAlign = 'left';
      ctx.fillText(eb.big, bx + 36, by + 56);
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(eb.label, bx + 36 + bigW + 24, by + 51);
      ctx.restore();
      // PANEL-12 / P2-4: t0 was `t - 2600` — a RELATIVE offset, so age was
      // always 2600ms > the 900ms life: the burst never drew. t0 is now the
      // burst's start time (constant) so the brand particles actually fire.
      if (ap >= 1) sparkles(ctx, bx + chipW / 2, by + 42, t, 2600, { count: 10, radius: 220 });
    }
  }
  sourceTag(ctx, W, s.source as string, H - 60);
  // PANEL-9 R2b (z-order): the host used to stand at (W*0.88, H*0.86) —
  // directly on the right chart's "today" x-label. Relocated to the empty
  // top-right quadrant above the chart cards, smaller, looking down at
  // the data; the full label strip along the card bottoms stays clear.
  hostSmall(g, W * 0.82, 'present', 3, H * 0.225, 0.66, 0, 'aha', 1.4, 1, false); // PLAYBOOK D3: 0.845 -> 0.82 (edge class)
}

// ── chartJourney: the generic annotated line chart scene ────────────────────
export function chartJourneyScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 71, 0.4, 'up'); // v10: the data room plate
  // v3 (panel P1-1): SceneCtx.t is GROUP-relative — it spans every beat
  // sharing a sceneKey — but props come from the CURRENT beat. In any
  // multi-beat group the animation clock is pre-advanced when later beats
  // begin, so staggered reveals never ran (verified: the c4-gallup group's
  // phase:'recovery' reveal was pinned at 1.0 the instant beat 2 started).
  // The chart's draw-on stays GROUP-relative (it draws once across the
  // group); per-beat content keys off beatT.
  const bt = g.beatT;
  const title = s.title as string;
  const drawP = clamp01(t / 2600);
  // PLAYBOOK D3 follow-up: title 180→330 and chartX 190→330 — the ch2/ch3
  // hero TRUCKS (±150-190px) + drift ran the title's left edge past the
  // frame bound (sceneTitle:Nasdaq-100, 46px). The journey charts ride the
  // frame's midline now; the truck sweeps AROUND them.
  sceneTitle(ctx, title, 330, 220, clamp01(t / 600));
  // PLAYBOOK D3 (probe-verified): chartW narrows so the ch2 hero TRUCK
  // (+190px at scale 1.12) cannot push the plot past the right bound —
  // right edge 1580 → screen 1898 at worst, inside the frame.
  const chartX = 330;
  const chartY = H * 0.22;
  const chartW = W - 330 - 340; // PLAYBOOK D3: 1310 → 1250 (truck clearance)
  const extraStats = (s.extraStats as any[]) || [];
  // v3 (panel P0-2 follow-up): with 2 stat rows the v2 stack reached
  // y 883-949 — under the caption pill. The chart yields a little height on
  // 2-stat beats so both rows sit fully above CAPTION_ZONE_TOP.
  const chartH = H * (extraStats.length >= 2 ? 0.355 : 0.42);

  const series = (s.series as any[] | undefined)?.map((sr) => ({
    name: sr.name as string,
    tone: sr.tone as string,
    points: sr.points as [number, number][],
  })) || [{ name: '', tone: 'up', points: s.points as [number, number][] }];

  // legend
  if (series.length > 1) {
    series.forEach((sr, i) => {
      const lx = chartX + i * 560;
      const ap = clamp01((t - 300 - i * 200) / 500);
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.fillStyle = TONE(sr.tone).main;
      roundRect(ctx, lx, chartY - 34, 46, 12, 6);
      ctx.fill();
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.textAlign = 'left';
      ctx.fillText(sr.name, lx + 60, chartY - 20);
      ctx.restore();
    });
  }

  lineChart(ctx, {
    x: chartX, y: chartY + (series.length > 1 ? 40 : 0), w: chartW, h: chartH,
    series,
    annotations: (s.annotations as any[]) || [],
    band: s.band as any,
    peakBand: s.peakBand as any,
    p: drawP,
    t,
    yFormat: ((s.yFormat as string) || 'index') as any,
    // PANEL-9 R2: the hero journey chart now carries a real time axis —
    // x=0 is ~last October, the script dates the March low (x=11) and the
    // June record (x=20), so the stops line up with the annotations.
    xLabels: [
      { at: 0, label: 'last Oct' },
      { at: 11, label: 'Mar' },
      { at: 20, label: 'Jun' },
      { at: 40, label: 'today' },
    ],
    // v3 (panel P1-1): beat-relative — the reveal RE-RUNS as the recovery
    // beat's VO explains it, instead of arriving pre-pinned at 1.0
    revealFrac: s.phase === 'recovery' ? Math.max(0.75, clamp01((bt - 800) / 4000)) : undefined,
  });

  // extra stat chips — v3: beat-relative stagger + anchored above the band
  // 100-JUDGE PANEL REPORT (defect D4 — THE OVERFLOWING CHIP): the label
  // was drawn unmeasured from x=440 inside a fixed 560px plate — a 52-char
  // label at 34px ran ~450px past the plate's right edge (measured on the
  // 16%-rated frame). The plate now grows from MEASURED text (capped at
  // 1086 so the worst-camera right edge stays ~1870), and the label wraps
  // at the plate interior into up to two lines, the chip growing to 100px
  // tall when it does; rows stack bottom-anchored with the same 18px gap.
  {
    setFont(ctx, 34, 600);
    const metas = extraStats.map((st: any) => {
      const label = st.label.length > 52 ? st.label.slice(0, 51) + '…' : st.label;
      const labelW = ctx.measureText(label).width;
      const plateW = Math.min(Math.max(440 + labelW + 28, 560), 1086);
      const innerW = plateW - 110 - 24;
      const lines = labelW > innerW ? wrapText(ctx, label, innerW, 34, 600).slice(0, 2) : [label];
      return { label, plateW, lines, chipH: lines.length > 1 ? 100 : 66 };
    });
    const bottoms: number[] = new Array(metas.length);
    let yBottom = 798;
    for (let i = metas.length - 1; i >= 0; i--) {
      bottoms[i] = yBottom;
      yBottom = yBottom - metas[i].chipH - 18;
    }
    extraStats.forEach((st: any, i: number) => {
      const ap = clamp01((bt - 1400 - i * 500) / 700);
      if (ap <= 0) return;
      const c = TONE(st.tone || 'default');
      const m = metas[i];
      ctx.save();
      ctx.globalAlpha = ap;
      const cyy = (bottoms[i] - m.chipH) / 1080 * H;
      const pw = (m.plateW / 1080) * W;
      ctx.fillStyle = c.soft;
      roundRect(ctx, 330, cyy, pw, m.chipH, 33); // PLAYBOOK D3: ride the chart column
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(c.main, 0.4);
      roundRect(ctx, 330, cyy, pw, m.chipH, 33);
      ctx.stroke();
      setFont(ctx, 36, 700);
      ctx.fillStyle = c.main;
      ctx.textAlign = 'left';
      ctx.fillText(st.big, 366, cyy + (m.lines.length > 1 ? 62 : 46));
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      if (m.lines.length > 1) {
        m.lines.forEach((ln, j) => ctx.fillText(ln, 440, cyy + 42 + j * 40));
      } else {
        ctx.fillText(m.lines[0], 440, cyy + 43);
      }
      ctx.restore();
    });
  }

  // chips row — v3 (panel P0-2 + P1-1): the stack was uncapped and with 2+
  // extraStats the chips landed at y 821-989 — under the caption pill (top ≈
  // 808), hidden. Cap the whole stat + chip stack ≥64px above the reserved
  // band, and stagger off beatT so each beat's chips animate with its VO.
  const chips = (s.chips as string[]) || [];
  // QA-SWEEP: the old static cap (CAPTION_ZONE_TOP−64 = 736) is not
  // camera-exact — the raised register (scenePush 0.22 → s≤1.15 + drift
  // dy up to +17) pushes a y=736 chip's screen bottom to ≈806, 10px INTO
  // the worst-case 2-row caption pill (top 796). Camera-exact bound:
  // screen bottom = 540+17+1.15×(y+48−540) ≤ 786 → y ≤ 690. The pill is
  // screen-space (never rides the camera), so this is the exact math the
  // guard's camera-exact pass asserts.
  const chipsY = Math.min(H * 0.76 + extraStats.length * 84, 690);
  chips.forEach((c, i) => {
    const ap = clamp01((g.beatT - 2200 - i * 450) / 600);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    chip(ctx, c, 330 + i * 600, chipsY, { // PLAYBOOK D3: ride the chart column
      size: 24, iconDot: PALETTE.gold, alpha: 0.95,
    });
    ctx.restore();
  });

  // quote card
  const quote = s.quote as string | undefined;
  if (quote) {
    const ap = clamp01((t - 2400) / 800);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      // PLAYBOOK D3 follow-up (round 2): qw 560→500 and the right margin
      // 150→260 — the ch2/ch3 hero TRUCKS (±190px) pushed the card's
      // right edge past the frame bound (16-31px on dense-mid frames).
      const qw = 500;
      const qx = W - qw - 260;
      // PLAYBOOK D3 follow-up: qy H*0.6 → H*0.5 — the 190px card's bottom
      // (838) sat 42px inside the 2-row caption pill band on wide-caption
      // frames (card@1210,648, the sweep's biggest remaining class). The
      // card now rides the chart's right column, bottom at 730, clear.
      const qy = H * 0.5;
      card(ctx, qx, qy, qw, 190, { r: 26 });
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, qx + 30, qy + 26, 6, 138, 3);
      ctx.fill();
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.ink;
      wrapText(ctx, quote, qw - 80, 27, 600).forEach((ln, i) => {
        ctx.fillText(ln, qx + 56, qy + 64 + i * 38);
      });
      ctx.restore();
    }
  }

  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── pieChart scene wrapper ──────────────────────────────────────────────────
export function pieChartScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 81, 0.6, 'gold'); // v10: the data room plate (gold — the wealth scene)
  sceneTitle(ctx, s.title as string, 180, 220, clamp01(t / 600));
  // AUDIT-ROUND-2 (fix 4): the pie yields the left third's margin so the
  // host can stand beside the legend — cx W*0.34 → W*0.30.
  const cx = W * 0.30;
  const cy = H * 0.52;
  const r = Math.min(W, H) * 0.21;
  pieChart(ctx, {
    cx, cy, r,
    slices: (s.slices as any[]) || [],
    p: clamp01(t / 1800),
    t,
    donut: !!s.donut,
    centerBig: s.centerBig as string,
  });
  // legend + host on right
  // v10.1 (panel 11 re-review, host-vs-content): the legend used to start at
  // W*0.58 with its % column at +560 — content ran to x≈1763, deep under the
  // side host's envelope (70px, guard-caught). The legend now starts at
  // W*0.48 (clear of the pie, right edge ~1372) and compacts to ≤450 wide;
  // the % value right-anchors at x+440.
  // AUDIT-ROUND-2 (fix 4 — UN-STRAND THE HOST): the host was at W*0.845 —
  // "huge empty right third; stick man stranded". The legend's right edge
  // is 1372; the host now stands at W*0.80 with his pointL cone reaching
  // INTO the legend (envelope left ≈1356, clear of the legend's last row),
  // the headYaw (fix 11) turning his face to it. Host beside content,
  // gesture in the content's direction — the fix's converse.
  // CONTACT VERB (P2 grammar, dossier follow-up — "bracket the pie wedge"):
  // the legend yields the center-right column (W*0.62) and the host stands
  // BETWEEN the pie and its legend, close enough to TOUCH — the near hand
  // solves onto the pie's rim every frame (armIk), palm on the gold wedge's
  // edge with a contact shadow. The presenter operates the graphic instead
  // of hovering beside it; the legend reads as the annotation of the thing
  // he is touching. Guard: the pie is background-grade (unregistered); the
  // narrowed contact envelope (70·scale) clears the legend rows by >200px;
  // the hand itself registers cls 'contact'.
  const legend = (s.slices as any[]) || [];
  const hxPie = 890;
  const hyPie = H * 0.66;
  // the rim point nearest the (estimated) shoulder — always on the gold
  // wedge for both beats' slice layouts (gold spans the upper-right arc)
  const dxs = hxPie + 5 - cx;
  const dys = hyPie - 200 * 1.09 - cy;
  const dl = Math.hypot(dxs, dys) || 1;
  const pieTouch = { x: cx + (dxs / dl) * r, y: cy + (dys / dl) * r };
  legend.forEach((sl, i) => {
    const ap = clamp01((t - 700 - i * 300) / 600);
    if (ap <= 0) return;
    const ly = H * 0.4 + i * 90;
    const lx = W * 0.62;
    registerRect(`pieLegend:${sl.label.slice(0, 12)}`, lx, ly, 450, 70);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.fillStyle = TONE(sl.tone).main;
    roundRect(ctx, lx, ly, 52, 52, 14);
    ctx.fill();
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, sl.label, 300, 34, 600);
    lines.forEach((ln, j) => ctx.fillText(ln, lx + 76, ly + 34 + j * 40));
    setFont(ctx, 38, 700);
    // v8.1: the bright fill gold (#C9A227) fails AA at 38px — text-sized
    // gold numerals use goldInk (4.8:1); the swatch chip stays bright.
    ctx.fillStyle = sl.tone === 'gold' ? PALETTE.goldInk : TONE(sl.tone).main;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(sl.value)}%`, lx + 440, ly + 40);
    ctx.restore();
  });
  // AUDIT-ROUND-2 (fix 4 + fix 11): the host beside the legend, pointing
  // into it — and hostSmall's own pointBias wiring turns his head with it.
  // CONTACT VERB edition: hand ON the pie rim, facing the pie (faceDir
  // 'left' — he stands left of centre but his content is further left).
  hostSmall(g, hxPie, 'pointL', 6, hyPie, 1.09, 0, 'aha', 1.4, 1, true, 0.4,
    undefined, undefined, { x: pieTouch.x, y: pieTouch.y, hand: 'palm' }, 'left');
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── dotGrid scene ────────────────────────────────────────────────────────────
export function dotGridScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 91, 0.4, 'up'); // v10: the data room plate
  sceneTitle(ctx, 'The S&P 500 · one bonus pool, 500 companies', 180, 220, clamp01(t / 600));
  // v10 (PANEL-11 D-01 — VERIFIED DEFECT RETIRED): the v9 frame drew a gold
  // bracket at y=190 — the exact baseline band of the scene title — with a
  // "10 of 500" badge and "these ten" text on top of the headline and its
  // gold underline (vision-verified on the harness render: "the underline
  // passes behind the badge's bottom-left corner"). The grid now yields the
  // title band (starts at H*0.235), the ten gold dots are grouped by a soft
  // translucent highlight BAND (grouping without text), and the count-up
  // moved INTO the caption line at the bottom — the ratio is stated in the
  // one place nothing can collide with.
  const gridY = H * 0.235;
  const gridH = H * 0.46;
  // PLAYBOOK D3 (follow-up): the grid narrows (W-660 → W-720) so the
  // W*0.82 host's full-body envelope keeps clear of the registered field
  // through every exit-window camera state (the 0.86→0.82 move re-ran
  // the two columns together; the field now ends at x=1200, the host's
  // envelope starts ~1500 — no shared band at any certified camera).
  dotGrid(ctx, {
    x: 190, y: gridY, w: W - 720, h: gridH,
    total: (s.total as number) || 500,
    highlight: (s.highlight as number) || 10,
    p: clamp01(t / 3400),
    t,
  });
  // the highlight band — a rounded gold wash cradling the ten gold dots
  // (row 0, cols 0-9). Drawn AFTER the grid so it tints the dots' backs.
  {
    const bandP = clamp01((t - 2600) / 700);
    if (bandP > 0) {
      ctx.save();
      ctx.globalAlpha = bandP;
      const cw = (W - 720) / 25; // PLAYBOOK D3: matches the narrowed field
      const rowH = gridH / Math.ceil(((s.total as number) || 500) / 25);
      const bx = 190 - 14;
      const by = gridY - 12;
      const bw = 10 * cw + 28;
      const bh = rowH + 24;
      ctx.fillStyle = rgba(PALETTE.gold, 0.10);
      roundRect(ctx, bx, by, bw, bh, 16);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.gold, 0.55);
      roundRect(ctx, bx, by, bw * bandP, bh, 16);
      ctx.stroke();
      ctx.restore();
    }
  }
  // caption block — count-up + statement, one line, nothing above to hit
  {
    const ap = clamp01((t - 2600) / 700);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const cp = clamp01((t - 2700) / 800);
      const n = Math.max(1, Math.round(10 * easeOutCubic(cp)));
      const count = `${n} of 500`;
      const caption = s.caption as string;
      setFont(ctx, 38, 700);
      const cw = ctx.measureText(count).width;
      setFont(ctx, 34, 700);
      const tw = ctx.measureText(caption).width;
      const gap = 26;
      const total = cw + gap + tw;
      const x0 = W / 2 - total / 2;
      const y = (1008 / 1080) * H;
      registerText('dotGrid:caption', x0, y - 40, total, 48);
      setFont(ctx, 38, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(count, x0, y);
      setFont(ctx, 34, 700);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(caption, x0 + cw + gap, y);
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.textAlign = 'center';
      ctx.fillText('each dot = one company', W / 2, (1040 / 1080) * H);
      ctx.restore();
    }
  }
  // PANEL-10 (D-10 class): W*0.9 → W*0.84 — dotGrid is a push scene (no
  // hero move, base 0.052); the envelope crossed x=1920 at full push.
  // v10.1 (panel 11 re-review, host-vs-content): W*0.84 → W*0.86 — the full
  // body envelope (cls 'host') must clear the dot grid's registered field;
  // the grid also narrows (W-400 → W-460) so data and presenter each own
  // their column. Edge worst case at 0.86: (1651+133-960)*1.092+960 ≈ 1860.
  hostSmall(g, W * 0.82, 'present', 8); // PLAYBOOK D3: 0.845 -> 0.82 (edge class)
}

// ── magChips scene ───────────────────────────────────────────────────────────
export function magChipsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 101, 0.55);
  sceneTitle(ctx, 'The Magnificent Seven', 180, 220, clamp01(t / 600));
  const chipsList = (s.chips as string[]) || [];
  // 7 gold tiles with ticker-style look
  // PLAYBOOK D3 follow-up: tw 210 → 204 — the seventh tile's right edge
  // crossed the frame bound under the exit camera + pop overshoot (11px).
  const tw = 204;
  const gap = 26;
  const totalW = chipsList.length * tw + (chipsList.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  chipsList.forEach((name, i) => {
    const ap = clamp01((t - 300 - i * 260) / 600);
    if (ap <= 0) return;
    const x = startX + i * (tw + gap);
    const y = H * 0.26;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate(x + tw / 2, y + 62);
    ctx.scale(0.9 + 0.1 * easeOutBack(ap), 0.9 + 0.1 * easeOutBack(ap));
    ctx.translate(-(x + tw / 2), -(y + 62));
    card(ctx, x, y, tw, 124, { r: 22 });
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, x, y, tw, 124, 22);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(PALETTE.gold, 0.65);
    roundRect(ctx, x, y, tw, 124, 22);
    ctx.stroke();
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(name, x + tw / 2, y + 74);
    setFont(ctx, 24 + 4, 600); // v9 (D-07): TYPE_FLOOR 24→28 ("MAG n" kicker)
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText('MAG ' + (i + 1), x + tw / 2, y + 40);
    ctx.restore();
  });
  // stats below
  // v9 (report D-01): the stat stack sat at H*0.56 + i*120 — card 2
  // ("46% of earnings growth") spanned y 724.8–824.8, and the opaque
  // caption pill's top edge lands at 796 (2-row) — the pill plated the
  // number and its label mid-glyph (verified defect, panel frame E-magchips).
  // H*0.50 puts card 2 at 660–760: 36px clear of even a 2-row pill, with
  // the collision guard (P0-1) now asserting it stays that way.
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    const ap = clamp01((t - 2400 - i * 700) / 800);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    const y = H * 0.50 + i * 120;
    const c = TONE(st.tone || 'default');
    card(ctx, W * 0.14, y, W * 0.72, 100, { r: 26 });
    setFont(ctx, 56, 700);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, W * 0.14 + 44, y + 68);
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(st.label, W * 0.14 + 320, y + 62);
    ctx.restore();
  });
  // PANEL-12 / P2-4: dead t0 fixed (was t - 3200 → age always 3200, never drew)
  if (t > 3200) sparkles(ctx, W / 2, H * 0.62, t, 3200, { count: 12, radius: 300, gold: true });
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── barsCompare scene ────────────────────────────────────────────────────────
export function barsCompareScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 111, 0.4, 'gold'); // v10: the data room plate (gold — the winner chart)
  sceneTitle(ctx, s.title as string, 180, 220, clamp01(t / 600));
  const bars = (s.bars as any[]) || [];
  const barW = W - 620;
  const yMax = (s.yMax as number) || Math.max(...bars.map((b) => b.value), 1) * 1.15;
  bars.forEach((b, i) => {
    const bp = clamp01((t - 400 - i * 450) / 900);
    if (bp <= 0) return;
    barRow(ctx, {
      x: 190, y: H * 0.24 + i * 130, w: barW, rowH: 120,
      label: b.label, value: b.value, maxV: yMax,
      p: bp, tone: b.tone, tag: b.tag,
    });
  });
  // flip counter (ownership rate)
  const fc = s.flipCounter as any | undefined;
  if (fc) {
    const ap = clamp01((t - 2600) / 900);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const fx = W * 0.14;
      // PANEL-9 R7k (flip counter plated by the caption pill): was H*0.7
      // (756..886) — its label/tag baselines (814/848) sat behind the
      // two-row pill (top ≈796). H*0.60 keeps the whole card (648..778)
      // above CAPTION_ZONE_TOP, 9px under the last bar row.
      const fy = H * 0.6;
      card(ctx, fx, fy, 640, 130, { r: 26 });
      setFont(ctx, 62, 700);
      ctx.fillStyle = PALETTE.down;
      ctx.textAlign = 'left';
      const from = fc.from as number;
      const to = fc.to as number;
      const v = lerp(from, to, easeInOutCubic(ap));
      ctx.fillText(`${v.toFixed(0)}%`, fx + 40, fy + 82);
      setFont(ctx, 34, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(fc.label, fx + 210, fy + 58);
      setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor (flip-counter tag)
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(fc.tag, fx + 210, fy + 92);
      ctx.restore();
    }
  }
  const rc = s.rememberChip as string | undefined;
  if (rc) {
    const ap = clamp01((t - 3600) / 800);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      setFont(ctx, 34, 600);
      const tw = ctx.measureText(rc).width;
      const cx = W / 2 - tw / 2 - 28;
      // v3 (panel P0-2): was H-190 (y≈890) — inside the caption pill band,
      // which covered it. Anchor ≥70px above CAPTION_ZONE_TOP (chip h≈56).
      const cy = ((CAPTION_ZONE_TOP - 70) / 1080) * H;
      registerRect('barsCompare:rememberChip', cx, cy, tw + 56, 56);
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, cx, cy, tw + 56, 56, 28);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, cx, cy, tw + 56, 56, 28);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(rc, cx + 28, cy + 36);
      ctx.restore();
    }
  }
  sourceTag(ctx, W, s.source as string, H - 60);
  // v10.1 (panel 11 re-review, host-vs-content): the biggest bar's tag
  // chip ("a bigger share…", ends ≈x1598+) ran 34px under the W*0.9 side
  // host's envelope (guard-caught @528-541s). Same answer as chartTwin:
  // the host takes the empty top-right corner ABOVE the bars (envelope
  // y≈48-263, x≈1590-1751 — clear of the title and every bar row), looking
  // down at the data; the right column belongs to the tag chips.
  hostSmall(g, W * 0.82, 'present', 13, H * 0.225, 0.66, 0, 'aha', 1.4, 1, false); // PLAYBOOK D3: 0.845 -> 0.82 (edge class)
}

// ── trioConverge scene ───────────────────────────────────────────────────────
export function trioConvergeScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 121);
  sceneTitle(ctx, 'Three surveys. One shape.', 180, 220, clamp01(t / 600));
  const names = ['Gallup', 'Univ. of Michigan', 'Conference Board'];
  const arcs = [
    { tone: 'down', pts: [[0, 60], [3, 55], [6, 40], [9, 22], [10, 14], [12, 26], [14, 34], [15, 32]] },
    { tone: 'down', pts: [[0, 60], [3, 54], [6, 42], [9, 26], [10, 18], [12, 30], [14, 38], [15, 36]] },
    { tone: 'down', pts: [[0, 60], [3, 56], [6, 44], [9, 28], [10, 20], [12, 32], [14, 39], [15, 37]] },
  ];
  // v9 (report P0-6): the trio asserted "same shape" without showing a
  // single value — the panel read the minis as decorative squiggles. Each
  // card now carries its survey's REAL first→latest reading (the same
  // numbers the full charts showed earlier in the chapter): Gallup −45→−33,
  // UMich 52.2→60.1, Conference Board 88.2→92.3.
  const realValues = ['−45 → −33', '52.2 → 60.1', '88.2 → 92.3'];
  arcs.forEach((a, i) => {
    const ap = clamp01((t - 300 - i * 320) / 700);
    if (ap <= 0) return;
    const x = W * 0.09 + i * (W * 0.28);
    const y = H * 0.26;
    const w = W * 0.22;
    const h = H * 0.3;
    ctx.save();
    ctx.globalAlpha = ap;
    card(ctx, x, y, w, h + 40, { r: 26 });
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(names[i], x + w / 2, y + 52);
    // the real first→latest reading, bottom of card
    const vp = clamp01((t - 1800 - i * 320) / 600);
    ctx.globalAlpha = ap * vp;
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(realValues[i], x + w / 2, y + h + 6);
    ctx.globalAlpha = ap;
    setFont(ctx, 22 + 6, 600); // v9 (D-07): floor — "index, low→latest" caption
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText('index · low → latest', x + w / 2, y + h + 34);
    registerRect(`trio:${names[i]}`, x, y, w, h + 40);
    ctx.restore();
    lineChart(ctx, {
      x: x + 36, y: y + 84, w: w - 72, h: h - 90,
      series: [{ name: '', tone: a.tone, points: a.pts as [number, number][] }],
      p: clamp01((t - 500 - i * 320) / 1600),
      t, showYAxis: false, gridLines: 2, emphasizeLast: false,
    });
  });
  // converge → checkmark
  const cp = clamp01((t - 2600) / 900);
  // motto hand-off progress (computed early — the checkmark caption fades
  // out into the motto which takes over its slot)
  const mottoIn = clamp01((t - 3600) / 700);
  if (cp > 0) {
    ctx.save();
    ctx.globalAlpha = cp;
    const cx = W / 2;
    const cy = H * 0.78;
    // three lines converge to a point
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const sx = W * 0.09 + W * 0.11 + i * (W * 0.28);
      ctx.strokeStyle = rgba(PALETTE.grid, 0.8);
      ctx.beginPath();
      ctx.moveTo(sx, H * 0.6);
      ctx.lineTo(cx + lerp(-60, 0, cp) * (i - 1), cy - 40);
      ctx.stroke();
    }
    // checkmark draws
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy);
    ctx.lineTo(cx - 12, cy + 32 * easeOutCubic(cp));
    ctx.stroke();
    if (cp > 0.4) {
      const p2 = clamp01((cp - 0.4) / 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 32);
      ctx.lineTo(cx + 52, cy - 44 * p2);
      ctx.stroke();
    }
    // v3 (panel P0-2): was cy+96 (y≈938) — inside the caption pill band.
    // Shares the below-the-pill slot with the motto via a crossfade (the
    // line hands off to the motto as the beat lands).
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.globalAlpha = cp * (1 - mottoIn);
    ctx.fillText('same shape · same time', cx, (1000 / 1080) * H);
    ctx.restore();
  }
  // crossfade target — the motto uses the same slot the caption line vacated
  const motto = s.motto as string;
  const mp = mottoIn;
  if (mp > 0 && motto) {
    ctx.save();
    ctx.globalAlpha = mp;
    ctx.textAlign = 'center';
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(motto, W / 2, (1000 / 1080) * H);
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(s.sub as string, W / 2, (1035 / 1080) * H);
    ctx.restore();
  }
}

// ── kDef scene ───────────────────────────────────────────────────────────────
export function kDefScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 131, 0.5);
  const kx = W * 0.7;
  const ky = H * 0.48;
  const S = 190;
  // two population dots travel apart from one point
  const travel = clamp01((t - 600) / 2200);
  const dotGap = lerp(0, 1, easeInOutCubic(travel));
  ctx.save();
  // BLUEPRINT Phase 3 (report §11 — ONE 3D LANGUAGE): kDef stops re-drawing
  // the K as flat 26/20px strokes — the audit's only outright continuity
  // defect ("the dimensional language established in the cold open is
  // dropped entirely. Continuity failure."). The SAME drawK3D the cold
  // open establishes — same extrusion depth, same solid wall tones, same
  // ±5°/2.6s wobble clock — so the brand object has ONE dimensionality
  // across the whole film. The vivid formation arms ride the growth and
  // hand off to the ink face exactly as divergeK stages it.
  const grow = clamp01((t - 200) / 2600);
  const kA2 = clamp01((grow - 0.55) / 0.45);
  // 100-JUDGE PANEL REPORT (defect D7 — THE HANDOFF): the overlay tubes ran
  // with alpha 1-kA2 across the WHOLE landing, coexisting with the visible
  // K face across kA2 0.3-1.0 — the "straws on the letter" read, here on
  // the kDef naming beat. The handoff completes at kA2 0.30 (the face is
  // 30% in): no coexistence with a legible face.
  if (grow > 0.3 && kA2 < 0.30) {
    ctx.save();
    ctx.globalAlpha = 1 - kA2 / 0.30;
    ctx.lineCap = 'round';
    const armK = (frac: number, vivid: string, dir: number): void => {
      if (frac <= 0) return;
      const ex = kx + S * 1.15 * frac;
      const ey = ky + dir * S * 1.05 * frac;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(kx, ky + S * 0.1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = vivid;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(kx, ky + S * 0.1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    };
    armK(clamp01(grow * 2 - 0.6), PALETTE.upVivid, -1);
    armK(clamp01(grow * 2 - 1.1), PALETTE.downVivid, 1);
    ctx.restore();
  }
  if (grow > 0.55) {
    ctx.save();
    ctx.globalAlpha = kA2;
    // 100-JUDGE PANEL / Phase 3 item 2 — THE K-TURN (report §6 Phase 3:
    // "On the cold-open tear and the kDef naming beat, sweep the
    // extrusion axis from 30 to 95 degrees over 900ms while the camera
    // pushes — the glyph becomes a mass, once per act"). The kDef beat's
    // turn: the naming payoff window (t 2800-3700, the sentence that
    // lands the name) — the extrusion rotates 30° → 95° eased, the walls
    // swinging toward the lens exactly as the face takes the frame.
    const turnP = clamp01((t - 2800) / 900);
    drawK3D(ctx, kx, ky, S, 1, t, true, turnP);
    ctx.restore();
  }
  // travelers
  ctx.fillStyle = PALETTE.up;
  ctx.beginPath();
  ctx.arc(kx + S * 1.15 * dotGap, ky - S * 1.05 * dotGap, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.down;
  ctx.beginPath();
  ctx.arc(kx + S * 1.15 * dotGap, ky + S * 1.05 * dotGap, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // definition card
  const dp = clamp01((t - 900) / 800);
  if (dp > 0) {
    ctx.save();
    ctx.globalAlpha = dp;
    const dx = W * 0.08;
    const dy = H * 0.24;
    card(ctx, dx, dy, 620, 300, { r: 30 });
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText('THE RICHMOND FED, PLAINLY', dx + 40, dy + 58);
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink;
    wrapText(ctx, `“${s.definition as string}”`, 540, 33, 600).forEach((ln, i) => {
      ctx.fillText(ln, dx + 40, dy + 116 + i * 46);
    });
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText('same starting point · same economy · two lines that diverge', dx + 40, dy + 262);
    ctx.restore();
  }
  // arm labels
  const lp = clamp01((t - 2400) / 700);
  if (lp > 0) {
    ctx.save();
    ctx.globalAlpha = lp;
    setFont(ctx, 34, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.up;
    ctx.fillText('top: better', kx + S * 1.3, ky - S * 1.0);
    ctx.fillStyle = PALETTE.down;
    ctx.fillText('bottom: worse', kx + S * 1.3, ky + S * 1.15);
    ctx.restore();
  }
  // v10.1 (panel 11 re-review, host-vs-content): the host used to stand at
  // W*0.24 — INSIDE the definition card's rect (154-774 × 259-559); his body
  // plated the wrapped definition text (169px deep, guard-caught). The card
  // owns the left column, the K owns the right (stem at x=1344); the host
  // now presents from the gap between them (envelope 911-1189), pointing at
  // the formation — 137px clear of the card, 155px clear of the K.
  hostSmall(g, 1050, 'pointR', 15, g.H * 0.66, 1.09, 0, 'aha', 1.4, 1, true, 0.55); // P2-4: hero moment — the naming beat rides the deep differential
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── credibilityChips ─────────────────────────────────────────────────────────
export function credibilityChipsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 141, 0.6);
  sceneTitle(ctx, 'This isn\u2019t an internet theory', 180, 220, clamp01(t / 600));
  const chipsList = (s.chips as string[]) || [];
  const cw = 640;
  chipsList.forEach((c, i) => {
    const ap = clamp01((t - 400 - i * 340) / 650);
    if (ap <= 0) return;
    // PLAYBOOK D3 follow-up: pitch 106 → 96, start 0.24H → 0.225H — the
    // fifth chip's bottom sat inside the 2-row pill band under the exit
    // camera (card@640,683 vs pill, 19px). The stack now ends at 740.
    const y = H * 0.225 + i * 96;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate((1 - easeOutCubic(ap)) * -50, 0);
    card(ctx, W / 2 - cw / 2, y, cw, 84, { r: 24 });
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, W / 2 - cw / 2, y, 14, 84, 7);
    ctx.fill();
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(c, W / 2, y + 54);
    ctx.restore();
  });
  const yp = clamp01((t - 2600) / 700);
  if (yp > 0) {
    ctx.save();
    ctx.globalAlpha = yp;
    ctx.textAlign = 'center';
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(s.year as string, W / 2, H * 0.225 + chipsList.length * 96 + 60);
    ctx.restore();
  }
  hostSmall(g, W * 0.82, 'present', 16, g.H * 0.63); // PLAYBOOK D3: 0.845 -> 0.82; ground 0.66 -> 0.63 (pill clear at max camera)
}

// ── gasPump scene ────────────────────────────────────────────────────────────
export function gasPumpScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 151, 0.4, 'up'); // v10: the data room plate
  sceneTitle(ctx, 'Same shock — different roads', 180, 220, clamp01(t / 600));
  // v10 (PANEL-11 D-02 + panel PROP-1): TWO retired defects in one rebuild.
  // (1) D-02: the scene caption at y≈992 intersected the source tag at
  // y≈1020 ("shock" crossing "Source:" — vision-verified). The caption now
  // lives at y≈700, in the open band under the household cards, and is
  // registered as reading text. (2) PROP-1: the pump was "a rounded
  // rectangle with the word GAS on it" — a name tag, not an illustration.
  // The rebuilt pump has a plinth, a side face, a bezelled screen with a
  // live $/GAL readout, a price plate, and a hose that SAGS under gravity
  // into a holstered nozzle — a prop you can read as a pump at 320px.
  const px = W * 0.5;
  const py = H * 0.30;
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  // ground shadow — the pump STANDS on the stage
  const gs = ctx.createRadialGradient(px, py + 352, 10, px, py + 352, 150);
  gs.addColorStop(0, rgba(PALETTE.shadow, 0.18));
  gs.addColorStop(0.6, rgba(PALETTE.shadow, 0.07));
  gs.addColorStop(1, rgba(PALETTE.shadow, 0));
  ctx.fillStyle = gs;
  ctx.beginPath();
  ctx.ellipse(px, py + 352, 150, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // plinth base
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = rgba(PALETTE.shadow, 0.35);
  ctx.lineWidth = 3;
  roundRect(ctx, px - 132, py + 300, 264, 46, 12);
  ctx.fill();
  ctx.stroke();
  // pump body
  card(ctx, px - 104, py, 208, 306, { r: 22 });
  // side face (right) — one flat tone darker: instant 3D on white
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, px - 104, py, 208, 306, 22);
  ctx.clip();
  ctx.fillStyle = rgba(PALETTE.shadow, 0.10);
  ctx.fillRect(px + 78, py, 30, 306);
  ctx.restore();
  // screen bezel + teal screen
  ctx.fillStyle = rgba(PALETTE.shadow, 0.16);
  roundRect(ctx, px - 78, py + 24, 156, 118, 14);
  ctx.fill();
  ctx.fillStyle = PALETTE.upSoft;
  roundRect(ctx, px - 72, py + 30, 144, 106, 10);
  ctx.fill();
  setFont(ctx, 40, 700);
  ctx.fillStyle = PALETTE.up;
  ctx.textAlign = 'center';
  ctx.fillText('GAS', px, py + 78);
  setFont(ctx, 34, 600);
  ctx.fillStyle = rgba(PALETTE.up, 0.75);
  ctx.fillText('PRICE / GALLON', px, py + 112);
  // price digits roll — on the screen, tabular feel
  const roll = (t / 300) % 10;
  setFont(ctx, 44, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(`$${(3.2 + Math.abs(Math.sin(roll)) * 0.9).toFixed(2)}`, px, py + 168);
  // FIX 3 (density payload — the frame measured 3.0% info): the screen
  // carries the SCENE'S OWN DATA — the Iran-spike price path the VO names,
  // drawn as a tiny sparkline on the pump's display (flat → spike → easing),
  // plus the two receipt lines a pump actually prints. The prop becomes an
  // instrument: the panel reads WHERE the shock came from without the VO.
  {
    const sx0 = px - 62;
    const sy0 = py + 190;
    const sw2 = 124;
    const sh2 = 34;
    ctx.strokeStyle = rgba(PALETTE.up, 0.85);
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const spike = [[0, 0.62], [0.18, 0.58], [0.36, 0.6], [0.52, 0.22], [0.66, 0.3], [0.84, 0.5], [1, 0.55]];
    spike.forEach(([fx2, fy2], i) => {
      const sxp = sx0 + fx2 * sw2;
      const syp = sy0 + fy2 * sh2;
      if (i === 0) ctx.moveTo(sxp, syp);
      else ctx.lineTo(sxp, syp);
    });
    ctx.stroke();
    ctx.fillStyle = PALETTE.down;
    ctx.beginPath();
    ctx.arc(sx0 + 0.52 * sw2, sy0 + 0.22 * sh2, 5, 0, Math.PI * 2);
    ctx.fill();
    // the receipt perforation — non-reading furniture (the pump's printer
    // line). Text here would break the 34px LABEL_FLOOR inside a 156px
    // screen; the spike marker carries the story instead.
    ctx.strokeStyle = rgba(PALETTE.inkFaint, 0.5);
    ctx.lineWidth = 2.4;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0 + sh2 + 12);
    ctx.lineTo(sx0 + sw2, sy0 + sh2 + 12);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // brand dot row (the pump's little identity)
  for (let d = 0; d < 3; d++) {
    ctx.fillStyle = d === 1 ? PALETTE.gold : rgba(PALETTE.up, 0.55);
    ctx.beginPath();
    ctx.arc(px - 26 + d * 26, py + 206, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // hose — leaves the RIGHT side, sags under gravity, returns to a holster
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px + 104, py + 70);
  ctx.quadraticCurveTo(px + 196, py + 150, px + 150, py + 232);
  ctx.quadraticCurveTo(px + 128, py + 266, px + 96, py + 258);
  ctx.stroke();
  // nozzle handle at the hose end
  ctx.save();
  ctx.translate(px + 96, py + 258);
  ctx.rotate(-0.5);
  ctx.fillStyle = PALETTE.ink;
  roundRect(ctx, -9, -26, 18, 34, 6);
  ctx.fill();
  roundRect(ctx, -5, 8, 10, 14, 4);
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // P2-3 (100-judge audit, Table 4 — "coins only where money moves"):
  // four coins used to float around the pump head — the panels read them
  // as "clip-art sprinkles doing zero work" perched on a machine that
  // displays a PRICE, not a payment. The pump's money story is its
  // rolling price display and the two household cards below; the coins
  // are gone. (The owner/worker scene keeps its coins — there they CROSS
  // the divider, value visibly moving between the halves.)

  // two household cards
  // AUDIT-ROUND-2 (fix 3 — KILL BODY PARAGRAPHS ON FRAMES): the phone-gate
  // verdict on this scene was "three columns of text at 320px = instant
  // failure — the pump icon is the only anchor". Each card keeps ONE
  // stat line (the numeric: 'gas spend +19%' / 'driving −7%'); the
  // qualitative second lines ('driving · barely changed' / 'gas bill still
  // went up') move to VO + caption only. The who-labels rise to the LABEL
  // floor (34). One focal line per card, one caption line per frame — the
  // 12-word cap holds; the pump owns the frame.
  const cards = (s.cards as any[]) || [];
  cards.forEach((c, i) => {
    const cap = clamp01((t - 1000 - i * 900) / 800);
    if (cap <= 0) return;
    // PLAYBOOK D3 follow-up: right card W*0.63 → W*0.60 — the ch4 hero
    // truck (±180px) pushed its right edge 45px past the frame bound at
    // the group's dense-mid frames. The card narrows with it (480 → 460).
    // 100-JUDGE PANEL REPORT (defect D2 — THE CLIPPED CARD): the who-label
    // ("LOWER-INCOME HOUSEHOLDS", 34px/700) measured ~480px — wider than
    // the plate's 380px interior — and under the ch4 truck the overflow
    // ran to the literal frame edge (measured x=1919, mid-word). The card
    // pulls left to W*0.555 (worst-camera right edge ~1733) and the label
    // now WRAPS at the measured interior width instead of overflowing.
    const x = i === 0 ? W * 0.07 : W * 0.555;
    const y = H * 0.26;
    ctx.save();
    ctx.globalAlpha = cap;
    ctx.translate(0, (1 - easeOutCubic(cap)) * 40);
    const tone = TONE(c.tone);
    card(ctx, x, y, 460, 230, { r: 30, tint: tone.main }); // v10: tone-lit card · PLAYBOOK D3: 480→460
    setFont(ctx, 34, 700);
    ctx.fillStyle = tone.main;
    ctx.textAlign = 'left';
    // the who-label wraps at the plate's measured interior (460 - 2*40):
    // two lines max, the rule and the stat line shift down when wrapped
    const whoTxt = (c.who as string).toUpperCase();
    const whoLines = wrapText(ctx, whoTxt, 380, 34, 700).slice(0, 2);
    const wrapped = whoLines.length > 1;
    whoLines.forEach((ln, j) => ctx.fillText(ln, x + 40, y + 62 + j * 40));
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(tone.main, 0.4);
    ctx.beginPath();
    ctx.moveTo(x + 40, y + (wrapped ? 124 : 84));
    ctx.lineTo(x + 200, y + (wrapped ? 124 : 84));
    ctx.stroke();
    // ONE stat line per card — the numeric only (fix 3)
    setFont(ctx, 54, 700);
    ctx.fillStyle = tone.main;
    ctx.fillText((c.stats as string[])[0], x + 40, y + (wrapped ? 196 : 168));
    ctx.restore();
  });
  // v10 (D-02): the caption — moved from y≈992 (ON the source tag) to the
  // open band under the pump+cards (clear of the plinth at 670 and the pill
  // at 796), registered as reading text.
  // AUDIT-ROUND-2 (fix 3): the caption is the frame's ONE focal line —
  // 34 → 40 (the READ floor), the phrase trimmed to the 12-word cap.
  const cap2 = clamp01((t - 3000) / 700);
  if (cap2 > 0) {
    ctx.save();
    ctx.globalAlpha = cap2;
    ctx.textAlign = 'center';
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.ink;
    const line = `${s.caption as string} — same country, same shock`;
    registerText('gasPump:caption', W / 2 - 560, 730 - 40, 1120, 52);
    ctx.fillText(line, W / 2, 730);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── recessionGauge scene ─────────────────────────────────────────────────────
export function recessionGaugeScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 161);
  sceneTitle(ctx, 'Recession odds — serious people, different answers', 180, 220, clamp01(t / 600));
  // debates on left
  const debates = (s.debates as any[]) || [];
  debates.forEach((d, i) => {
    const ap = clamp01((t - 400 - i * 600) / 700);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    const y = H * 0.26 + i * 150;
    card(ctx, W * 0.07, y, 560, 120, { r: 26 });
    setFont(ctx, 34, 700);
    ctx.fillStyle = i === 0 ? PALETTE.up : PALETTE.down;
    ctx.textAlign = 'left';
    ctx.fillText(d.who, W * 0.07 + 36, y + 44);
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    wrapText(ctx, d.line, 490, 24, 600).forEach((ln, j) => {
      ctx.fillText(ln, W * 0.07 + 36, y + 82 + j * 32);
    });
    ctx.restore();
  });
  // gauge on right
  gauge(ctx, {
    cx: W * 0.74, cy: H * 0.52, r: 240,
    value: (s.gaugeTo as number) || 48,
    p: clamp01((t - 1200) / 2200),
    t,
    label: 'Zandi\u2019s model · most alarmed point',
  });
  // v8: the mid-roll engagement chip — asks for the viewer's guess WHILE
  // the gauge is still sweeping toward 48%. Comments during the video (not
  // just at the end) are a ranking signal, and "guess before the reveal"
  // is a proven engagement device. Rides above the debates, below the
  // caption zone, and fades before the coin chip lands.
  const promptChip = s.promptChip as string | undefined;
  if (promptChip) {
    const pp = clamp01((t - 2000) / 600) * (1 - clamp01((t - 5600) / 700));
    if (pp > 0) {
      ctx.save();
      ctx.globalAlpha = pp;
      setFont(ctx, 34, 700);
      const tw = ctx.measureText(promptChip).width;
      // PLAYBOOK D3 follow-up: the chip centered at W*0.35 crossed the
      // frame's left bound under the exit camera (edge @540s, 16px).
      // Centered on the gauge's own column now (W*0.40) — the prompt
      // reads beside the bowl it annotates, clear of both edges.
      const cx0 = W * 0.40;
      const x = cx0 - tw / 2 - 28;
      const y = 626;
      registerRect('gauge:promptChip', x, y, tw + 56, 56);
      ctx.fillStyle = PALETTE.upSoft;
      roundRect(ctx, x, y, tw + 56, 56, 28);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.up, 0.7);
      roundRect(ctx, x, y, tw + 56, 56, 28);
      ctx.stroke();
      ctx.fillStyle = PALETTE.up;
      ctx.textAlign = 'left';
      ctx.fillText(promptChip, x + 28, y + 37);
      ctx.restore();
    }
  }
  // coin flip chip — v4 (vision panel re-review): was at y=H*0.8 (864) —
  // inside the caption-pill band (top ≈ 808), colliding with the subtitle.
  // Now cradled inside the gauge bowl, under the value + model label, clear
  // of both the arc and the caption zone.
  const cp = clamp01((t - 3200) / 700);
  if (cp > 0 && s.coinChip) {
    ctx.save();
    ctx.globalAlpha = cp;
    setFont(ctx, 34, 700);
    const txt = s.coinChip as string;
    const tw = ctx.measureText(txt).width;
    const gx = W * 0.74;
    const x = gx - tw / 2 - 28;
    // Guard sweep (356s): the chip's bottom grazed the caption pill band at
    // the 34px label floor — it rides 36px higher, clear under the worst
    // camera (the pill is screen-fixed; content yields).
    const y = 700;
    registerRect('gauge:coinChip', x, y, tw + 56, 56);
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.gold;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText(txt, x + 28, y + 37);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── aiDatacenter scene (3D-ish racks) ───────────────────────────────────────
export function aiDatacenterScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t, g.chapterTone);
  // P1-2 (report §12.2): the datacenter room plate — the biggest build-out
  // scene was the last raw-white room in the film.
  scenePlate(ctx, W, H, g.chapterTone ?? 'up');
  // P0-4 panel re-review: bokeh trimmed 1.15→0.95 / gold 0.5→0.4 — the
  // corner discs read as "stray decorative circles" at full strength; at
  // 0.95 they stay atmosphere without asserting themselves.
  bokehField(ctx, W, H, t, { intensity: 0.95, seed: 171, gold: 0.4 });
  // perspective floor grid
  // PANEL-12 / P3-2 (report §15.2): the floor must register as a FLOOR —
  // verticals 0.4 → 0.55 alpha, plus a horizon hairline. A floor grid you
  // can barely see is a texture; one you can see is a room.
  const horizon = H * 0.56;
  ctx.save();
  ctx.lineWidth = 1.6;
  // AUDIT-2 / §10.4 (report §5.3 — "no horizon fade, no gradient
  // falloff"): the perspective verticals now fade WITH DISTANCE — each
  // vertical strokes through a linear gradient that is transparent at the
  // horizon and full ink at the near floor, so the grid recedes INTO the
  // room instead of running at one opacity to the frame edge and fighting
  // the cards. The horizon hairline below stays (it is the room's edge).
  const vg = ctx.createLinearGradient(0, horizon, 0, H);
  vg.addColorStop(0, rgba(PALETTE.grid, 0));
  vg.addColorStop(0.45, rgba(PALETTE.grid, 0.28));
  vg.addColorStop(1, rgba(PALETTE.grid, 0.55));
  ctx.strokeStyle = vg;
  for (let i = 0; i <= 14; i++) {
    const fx = (i / 14) * W;
    ctx.beginPath();
    ctx.moveTo(fx, H);
    ctx.lineTo(lerp(fx, W / 2, 0.72), horizon);
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const fy = horizon + Math.pow(i / 8, 1.8) * (H - horizon);
    ctx.globalAlpha = 0.35 + (i / 8) * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(W, fy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the horizon line — where the floor ends and the air begins
  // AUDIT-2: the horizon itself fades out at the edges (a gradient stroke
  // — strongest mid-frame where the VP is, dissolving at the sides).
  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, rgba(PALETTE.grid, 0.12));
  hg.addColorStop(0.5, rgba(PALETTE.grid, 0.6));
  hg.addColorStop(1, rgba(PALETTE.grid, 0.12));
  ctx.strokeStyle = hg;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(W, horizon);
  ctx.stroke();
  ctx.restore();

  // P0-4 (100-judge audit, Table 2 — full datacenter rebuild): the shipped
  // scene drew twelve WHITE rounded-rect racks scrolling sideways across
  // lanes while three stat cards floated in a left column straight over
  // them — the panel read "servers as UI cards, placeholder art" plus a
  // card-over-rack layering accident (5.5/10) on the one scene whose
  // entire job is SCALE. The rebuild stages the frame as three registers:
  //   1. READING BAND (stepped y 126/186): the three stat cards as ONE
  //      row across the top wall zone — mathematically clear of every
  //      rack (nearest rack top ≈ y 548), so no card ever plates a rack.
  //   2. THE CORRIDOR: dark SILHOUETTE rack rows converging on the VP at
  //      (W/2, horizon) — a left wall of seven monoliths marching to the
  //      horizon (scale = repetition-to-horizon, now as dark slabs that
  //      READ at 320px) and a right wall stepping down from the hero.
  //   3. THE HERO RACK: ONE near full-detail rack (dark body, chassis
  //      hairlines, dual LED rails, gold load meter, top face, contact
  //      AO) — and the host at W*0.82 presents it: his gesture terminates
  //      ON the rack (audit rule: "a presenter who touches what he
  //      presents"), 34px clear of his body envelope.
  // Motion: the sideways lane scroll is gone (racks are bolted down) —
  // the room now ASSEMBLES (staggered far→near rise-in) while LED phases,
  // the breathing load meter and the ch5 camera push carry the life.
  const ap = clamp01(t / 600);
  const VPX = W / 2;
  const riseIn = (delay: number) => {
    const q = clamp01((t - delay) / 620);
    return { a: q, rise: (1 - easeOutCubic(q)) * 26 };
  };
  const silhouette = (x: number, baseY: number, rw: number, rh: number, delay: number, idx: number) => {
    const { a, rise } = riseIn(delay);
    if (a <= 0.01) return;
    const depth = clamp01((rw - 40) / 110); // 0 far .. 1 near (by size)
    ctx.save();
    ctx.globalAlpha = a * ap * (0.62 + 0.38 * depth);
    ctx.translate(0, rise);
    // contact AO — skewed toward the room's one vanishing point.
    // P0-4 panel re-review 2 ("central racks still read as hovering"):
    // AO floor 0.14, gain 0.09, ry 8+6d — and the WALL loops below now
    // draw FAR→NEAR (painter's algorithm) so no later slab paints over
    // an earlier one's grounding shadow.
    ctx.fillStyle = rgba(PALETTE.shadow, 0.14 + depth * 0.09);
    ctx.beginPath();
    ctx.ellipse(x + (VPX - x) * 0.06, baseY + 4, rw * 0.78, 8 + 6 * depth, 0, 0, Math.PI * 2);
    ctx.fill();
    // AUDIT-ROUND-2 (fix 20 — RACKS IN PERSPECTIVE, the top face): every
    // slab gains a TOP FACE whose far edge tilts TOWARD the existing
    // vanishing point — the top edges of the whole corridor now visibly
    // converge on (VPX, horizon), the "copy-paste depth repeat" read
    // dies, and each rack reads as a 3D box standing in the room.
    {
      // Panel round 2: the convergence reads at the phone gate — the tilt
      // factor 0.10 -> 0.16 and the floor 10 -> 14 so even far slabs'
      // top edges visibly aim at the vanishing point.
      const tfx = Math.max(26, (VPX - x) * 0.24);   // toward the VP — steeper near plane
      const tfy = rh * 0.085;
      ctx.fillStyle = rgba('#FFFFFF', 0.10 + 0.14 * depth);
      ctx.beginPath();
      ctx.moveTo(x - rw / 2, baseY - rh);
      ctx.lineTo(x + rw / 2, baseY - rh);
      ctx.lineTo(x + rw / 2 + tfx, baseY - rh + tfy);
      ctx.lineTo(x - rw / 2 + tfx, baseY - rh + tfy);
      ctx.closePath();
      ctx.fill();
    }
    // side face — on EVERY slab now (re-review 2: "the middle pair sits
    // dead-vertical while flanks show angled faces — the corridor's
    // perspective logic contradicts itself"). Scaled by size: far slabs
    // get a sliver, near slabs a face — one consistent vanishing point.
    {
      const fx = rw * 0.24;
      const fy = rh * 0.09;
      ctx.fillStyle = rgba(PALETTE.ink, 0.6);
      ctx.beginPath();
      ctx.moveTo(x + rw / 2, baseY - rh);
      ctx.lineTo(x + rw / 2 + fx, baseY - rh + fy);
      ctx.lineTo(x + rw / 2 + fx, baseY + fy);
      ctx.lineTo(x + rw / 2, baseY);
      ctx.closePath();
      ctx.fill();
    }
    // the monolith — one dark slab, top-lit (0.96: stacked far slabs no
    // longer smear through the near ones)
    // AUDIT-ROUND-2 (fix 20 — PER-ROW GRADIENT FALLOFF): the flat 0.96 ink
    // fill becomes a vertical gradient — denser at the base, lifting at
    // the top where the room's light catches it — and the far rows fade
    // toward the plate (atmospheric recession: farther = hazier).
    {
      const gTop = rgba(PALETTE.ink, 0.82 + 0.14 * depth);
      const gBot = rgba(PALETTE.ink, 0.96);
      const g = ctx.createLinearGradient(0, baseY - rh, 0, baseY);
      g.addColorStop(0, gTop);
      g.addColorStop(1, gBot);
      ctx.fillStyle = g;
      roundRect(ctx, x - rw / 2, baseY - rh, rw, rh, 5);
      ctx.fill();
      // the far-row haze wash — distance fades toward the room's air
      if (depth < 0.72) {
        ctx.fillStyle = rgba(PALETTE.bgSoft, 0.30 * (1 - depth));
        roundRect(ctx, x - rw / 2, baseY - rh, rw, rh, 5);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgba('#FFFFFF', 0.06 + 0.2 * depth);
    roundRect(ctx, x - rw / 2, baseY - rh, rw, 3.5, 2);
    ctx.fill();
    // LED glints — fewer with distance, independent phases, OFF = dark
    const n = Math.max(2, Math.min(7, Math.round(rw / 24)));
    for (let k = 0; k < n * 2; k++) {
      const col = k % 2;
      const row = Math.floor(k / 2);
      if (Math.sin(t / (170 + col * 90) + idx * 3 + k * 1.7) < 0.1) continue;
      ctx.fillStyle = k % 3 === 0 ? PALETTE.gold : PALETTE.upVivid;
      const lx = x - rw / 2 + 7 + col * (rw - 14);
      const ly = baseY - rh + 10 + (row * (rh - 20)) / Math.max(1, n - 1);
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6 + 2.6 * depth, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  // LEFT WALL — seven slabs at EQUAL real-world spacing, projected with
  // true perspective division (x = VPX − 620/s, rw = 150/s, rh = 300/s,
  // base = horizon + 183/s, s = 1 + 0.55k). P0-4 panel re-review 3: the
  // f^1.25 lerp staged the near three slabs 46–85px INTO each other —
  // the "stacked double-exposed rectangles" read. Division spacing
  // separates them (k0 body 265-415, k1 at 511+ — no body overlap) and
  // puts heights/bases on the SAME denominator, so tops stair
  // monotonically 488→578 down to the horizon — one consistent VP.
  // DRAWN far→near (k=6 first): painter's algorithm; reveal DELAYS also
  // march far (250ms) → near (910ms) — the room assembles from the
  // horizon toward the camera.
  for (let k = 6; k >= 0; k--) {
    const s = 1 + 0.55 * k;
    const x = VPX - 620 / s;
    const rw = 150 / s;
    // Panel round 2 (fix 20): rh 300 -> 340/s — the near/far height ratio
    // steepens so the top-edge stair (horizon − 157/s) reads at the phone
    // gate as a corridor CONVERGING on the vanishing point, not a parallel
    // lineup.
    const rh = 340 / s;
    const baseY = horizon + 183 / s;
    registerRect(`dc-lwall@${k}`, x - rw / 2, baseY - rh, rw, rh, 'content', { edge: false });
    silhouette(x, baseY, rw, rh, 250 + (6 - k) * 110, 10 + k);
  }
  // RIGHT WALL — the hero's far shoulder stepping to the VP: two deep
  // slabs on the SAME perspective family (s = 5.95, 4.85), listed
  // far-first and drawn in array order. Small by geometry (they sit
  // 500+ units down the aisle) — the hero is this wall's near anchor.
  const rwall: Array<[number, number, number, number]> = [
    [VPX + 620 / 5.95, horizon + 183 / 5.95, 150 / 5.95, 300 / 5.95],
    [VPX + 620 / 4.85, horizon + 183 / 4.85, 150 / 4.85, 300 / 4.85],
  ];
  rwall.forEach(([x, baseY, rw, rh], k) => {
    registerRect(`dc-rwall@${k}`, x - rw / 2, baseY - rh, rw, rh, 'content', { edge: false });
    silhouette(x, baseY, rw, rh, 380 + k * 110, 20 + k);
  });
  // THE HERO RACK — the room's one detailed object, the host's counterpart.
  // P0-4 panel re-review ("gesture vector misses by ~100px"): widened
  // 230→270 and nudged left (hx 1250→1240) so the host's present hand
  // (~x1420) now terminates 45px from the rack's face instead of 100+.
  // Envelope x 1105-1375 (+side sliver to 1393), y 408-768: 96px below
  // the card row, 14px clear of the host envelope (1407), base 768 stays
  // above the worst-case caption pill zone (776).
  {
    const hx = 1240;
    const hw = 270;
    const hBase = 768;
    const hh = 360;
    registerRect('dc-heroRack', hx - hw / 2, hBase - hh, hw, hh, 'content', { edge: false });
    const q = clamp01((t - 200) / 700);
    ctx.save();
    ctx.globalAlpha = q * ap;
    ctx.translate(0, (1 - easeOutCubic(q)) * 40);
    // contact AO — biggest in the room, skewed to the same VP
    ctx.fillStyle = rgba(PALETTE.shadow, 0.17);
    ctx.beginPath();
    ctx.ellipse(hx + (VPX - hx) * 0.06, hBase + 6, hw * 0.78, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // top face — the 3D hint that stays out of the host's pocket.
    // Panel round 3: widened 18 -> 34 — the nearest plane's upward face
    // reads (the corridor's convergence starts at the hero, not behind it).
    // PLAYBOOK T1 (report §8.5 — ONE ROOM, ONE VANISHING POINT): the hero
    // rack's top/side offsets now derive from the SAME perspective family
    // the walls use (s-continuous from the hero's own depth term), so
    // every top edge in the room converges on (VPX, horizon). The judge:
    // "no consistent vanishing point between the two rack groups — the 3D
    // room collapses into two disconnected props."
    {
      // the hero's s-equivalent on the wall family; the offsets shrink
      // with the same 1/s denominator the wall slabs use
      const heroS = 1.28;
      const fx = Math.max(26, (VPX - hx) * 0.24 * (1 / heroS));
      const fy = hh * 0.085 * (1 / heroS) + 6;
      ctx.fillStyle = rgba('#FFFFFF', 0.16);
      ctx.beginPath();
      ctx.moveTo(hx - hw / 2, hBase - hh);
      ctx.lineTo(hx - hw / 2 + fx, hBase - hh + fy);
      ctx.lineTo(hx + hw / 2 + fx, hBase - hh + fy);
      ctx.lineTo(hx + hw / 2, hBase - hh);
      ctx.closePath();
      ctx.fill();
      // right side face — same denominator family (the hero grows from
      // the room; the "bolt-on side face" read dies)
      ctx.fillStyle = rgba(PALETTE.ink, 0.58);
      ctx.beginPath();
      ctx.moveTo(hx + hw / 2, hBase - hh);
      ctx.lineTo(hx + hw / 2 + fx, hBase - hh + fy);
      ctx.lineTo(hx + hw / 2 + fx, hBase + fy);
      ctx.lineTo(hx + hw / 2, hBase);
      ctx.closePath();
      ctx.fill();
    }
    // front body — dark slab
    ctx.fillStyle = rgba(PALETTE.ink, 0.94);
    roundRect(ctx, hx - hw / 2, hBase - hh, hw, hh, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.45);
    roundRect(ctx, hx - hw / 2, hBase - hh, hw, hh, 10);
    ctx.stroke();
    // chassis hairlines — eight units, light-on-dark
    ctx.strokeStyle = rgba('#FFFFFF', 0.13);
    ctx.lineWidth = 1.2;
    for (let u = 1; u <= 8; u++) {
      const uy = hBase - hh + (hh * u) / 9;
      ctx.beginPath();
      ctx.moveTo(hx - hw / 2 + 8, uy);
      ctx.lineTo(hx + hw / 2 - 8, uy);
      ctx.stroke();
    }
    // LED rails — two columns, independent phases, big enough to read
    for (let k = 0; k < 14; k++) {
      const col = k % 2;
      const row = Math.floor(k / 2);
      const on = Math.sin(t / (170 + col * 90) + k * 1.7) > 0.15;
      ctx.fillStyle = on ? (k % 3 === 0 ? PALETTE.gold : PALETTE.upVivid) : rgba('#FFFFFF', 0.16);
      const lx = hx - hw / 2 + 16 + col * (hw - 34);
      const ly = hBase - hh + 16 + (row * (hh - 46)) / 6;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the load meter — gold, breathing
    const load = 0.35 + 0.3 * Math.sin(t / 640 + 1.9);
    ctx.fillStyle = rgba('#FFFFFF', 0.22);
    roundRect(ctx, hx - hw / 2 + 12, hBase - 24, hw - 24, 8, 4);
    ctx.fill();
    ctx.fillStyle = rgba(PALETTE.gold, 0.9);
    roundRect(ctx, hx - hw / 2 + 12, hBase - 24, (hw - 24) * load, 8, 4);
    ctx.fill();
    ctx.restore();
  }
  hazeBands(ctx, W, H, { rearY: horizon + 26, midY: H * 0.6 });
  // AUDIT-ROUND-2 (fix 20 — THE HAZE BAND BETWEEN ROWS 2 AND 3): a soft
  // full-width atmospheric break at the y-seam between the corridor's
  // second and third rack rows — the near pair stays crisp, the far field
  // recedes behind its own air. Three transforms on the existing loop,
  // no new assets: top faces converge, rows fade, the seam hazes.
  {
    // Panel round 2: the break reads at the phone gate — alpha 0.22 -> 0.36,
    // the band widened ±46 -> ±72, so rows 2-3 separate visibly even after
    // the 6x downsample.
    const seamY = horizon + 100;
    const g = ctx.createLinearGradient(0, seamY - 84, 0, seamY + 84);
    g.addColorStop(0, rgba(PALETTE.bgSoft, 0));
    g.addColorStop(0.5, rgba(PALETTE.bgSoft, 0.42));
    g.addColorStop(1, rgba(PALETTE.bgSoft, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, seamY - 84, W, 168);
  }
  // stat cards — P0-4 (audit Table 2): out of the left column (which
  // floated them over the rack field — the "card-over-rack layering
  // accident") and into ONE horizontal reading row across the top wall
  // band. Compact metrics (58px numeral, 28px label) in a 480x176 card;
  // the row spans 180->1740 with 60px gutters, matching the raised title
  // rail (QA-SWEEP edge rule: x=180 clean under the worst steady camera).
  // Envelope y 136-312 vs nearest rack top ~548: 236px of clear air —
  // no card ever plates a rack again.
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    statCard(ctx, {
      // P0-4 sweep fix round 2 — the STEPPED CASCADE: card 1 sits LOW
      // (y 186: the exit camera lifts it ~95px into the watermark's
      // x-band, and only card 1 overlaps that band); cards 2-3 step HIGH
      // (y 126: their bottoms at 302 clear the walk host's envelope top
      // at 308 by 6px, and they never touch the watermark horizontally).
      // One reading band, two steps — the cascade was already in the
      // timing; now it's in the geometry too.
      // D-2 (100-judge dossier): labels now wrap to TWO rows and the plate
      // grows to fit (188px) — cards 2-3 rise to y 104 so the grown bottoms
      // (292) clear the host envelope (308) by 16px under the same camera.
      x: 180 + i * 540, y: i === 0 ? 186 : 104, w: 480, h: 176,
      compact: true,
      bigIsNumber: false, // '¾' / '$700–730B' are strings; count-up mangles them
      big: st.big, label: st.label, tone: st.tone || 'gold',
      p: clamp01((t - 800 - i * 900) / 900), t,
    });
  });
  // v8: the host — the vision panel flagged this scene "no character, no
  // motion cue, lowest energy on the sheet". The presenter now walks the
  // datacenter floor (bottom-right, presenting the racks) with the talk
  // envelope. One drawStickmanV2 call; the scene keeps its full layout.
  // CONTACT VERB (P2 grammar, dossier follow-up — "palm the rack face"):
  // the host steps INTO arm's reach of the hero rack (x 1574 → 1480) and
  // the near hand solves onto the rack's right face at chest height every
  // frame — a palm on the machine he is narrating, contact shadow where
  // they meet. The narrowed contact envelope (70·1.28 = 90) clears the
  // registered rack rect (1105–1375) by ~15px; the hand registers as
  // cls 'contact'; the pointBias turns the gesture cycle toward the rack.
  {
    const pose = Stickman.poseAt(t, {
      gesture: 'present',
      speaking: g.speaking,
      sentenceId: g.sentenceId,
      prevSentenceId: g.prevSentenceId,
      sentenceT: g.sentenceT,
      wordTimes: g.gWordTimes,
      pointBias: 'left',
    });
    const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
    // v9 (report D-02): H*0.88 → H*0.68 — above the caption zone with
    // worst-case camera margin (guard-verified)
    // P1-1 (report): +30% (1.05 → 1.37); ground H*0.68 → H*0.66 — envelope
    // bottom 713+49 = 762, still clear of the worst-case 2-row pill
    // envelope (776) by 14px.
    // PANEL-10 (D-10): x W*0.9 → W*0.82. At scale 1.37 the feet+shadow
    // envelope reached x≈1895 static; the ch5 hero push (base 0.052 + hero
    // 0.04 ≈ 1.092x at group end) pushed it to ≈2004 — 84px past the right
    // edge, arm and shadow clipped (vision-verified on the aiDatacenter
    // frame). At W*0.82 the envelope's worst case lands ≈1831, 89px clear.
    // Guard sweep (396-404s): at 1.37 the head's envelope top touched the
    // stat-card row's bottom under the ch5 hero push's exact camera — 1.28
    // restores a certified ~28px static clearance (envelope top 326, card
    // bottom 302) and keeps the feet clear of the pill band (775 < 796).
    // CONTACT edition: x → 1480 (inside reach of the rack's right face at
    // 1375); worst-case right edge ≈ 1480+90 = 1570 static, ≈1715 under the
    // full hero-push camera — 205px inside the frame bound.
    drawStickmanV2(ctx, 1480, H * 0.66, 1.28, t,
      {
        pose, alpha: clamp01((t - 900) / 600), look: -0.7, scarf: true, talk, hostBody: true,
        // PANEL-12 / P3.2: the walk host's ground-shadow ellipse skews by
        // the floor's own (W/2 − x) × 0.06 term — he stands IN the room's
        // perspective, not on a decal. PANEL-12 / P2-1: foreground parallax.
        shadowSkew: (W / 2 - 1480) * 0.06,
        parallax: true,
        // CONTACT VERB: palm ON the hero rack's TOP face (x 1375, y 408).
        // The right face is 0.94-ink — an ink hand on it merges (ink-on-ink);
        // the top face is the lit 0.16-white plane, so the palm and its
        // contact shadow read against it, and the gesture is the classic
        // rack-touch.
        contact: { x: 1375, y: 408, hand: 'palm' },
      }, 27);
  }
}

// ── statCards scene ──────────────────────────────────────────────────────────
export function statCardsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 181, 0.55);
  sceneTitle(ctx, 'The numbers, plainly', 180, 220, clamp01(t / 600));
  // AUDIT-ROUND-2 (fix 2 — ONE HERO PER FRAME): the three equal cards read
  // at the phone gate as "crowded at phone width; cards read clip-arty" —
  // three competing masses, none dominant. The panel's rule: one dominant
  // object at minimum 55% of frame width; every other element demoted or
  // culled. The TRILLION stat ($18.8T — the all-time high) is now THE
  // hero: a single 1150px-wide card (60% of frame width) carrying a
  // 190px numeral; the other two stats demote to pill chips in a single
  // quiet row beneath it. The two demoted labels' full text is already
  // carried by the VO (the script speaks both numbers).
  {
    const shake = microShake(t, 1300);
    if (shake.dx !== 0 || shake.dy !== 0) ctx.translate(shake.dx, shake.dy);
  }
  const cards = (s.cards as any[]) || [];
  // pick the hero: the largest-magnitude stat (the trillion/all-time-high
  // carries it by default — the biggest number the beat owns)
  const heroIdx = cards.findIndex((c) => /\$[\d.]+T/.test(String(c.big)));
  const hero = cards[heroIdx >= 0 ? heroIdx : cards.length - 1] ?? { big: '', label: '', tag: '', tone: 'gold' };
  const chips = cards.filter((_, i) => i !== heroIdx);
  const tone = TONE(hero.tone || 'gold');
  // 100-JUDGE PANEL / Phase 3 item 5 — PER-OBJECT DEPTH FACTORS (report
  // §6 Phase 3: "Extend the parallax differential to the K, hero racks,
  // and chart columns"). The hero rack rides the MID plane (depth 0.7 —
  // it travels at 0.7× the camera, 0.25× against the background), the
  // demoted chip row rides FARTHER (0.55): a camera push now separates
  // the data planes instead of scaling them as one flat card. The K's
  // own call sites carry the same factor (the brand object rides the
  // mid plane with the hero content everywhere).
  const heroDepth = depthShift(0.7);
  const chipDepth = depthShift(0.55);
  // ── THE HERO CARD — 1150px wide (60% of frame), one 190px numeral ──
  const hx0 = 180;
  const hy0 = H * 0.22;
  const hw = 1150;
  const hh = 400;
  // P3-5: the hero rack's mid-plane translate (the guard registers the
  // SHIFTED rect — the depth offset is part of the frame's truth)
  registerRect('statCards:hero', hx0 + heroDepth.dx, hy0 + heroDepth.dy, hw, hh);
  ctx.save();
  ctx.translate(heroDepth.dx, heroDepth.dy);
  card(ctx, hx0, hy0, hw, hh, { r: 34, tint: tone.main });
  const heroP = clamp01((t - 300) / 900);
  if (heroP > 0) {
    ctx.save();
    ctx.globalAlpha = heroP;
    // the numeral — 190px, fitted to the card's body (floor: 100px — a
    // HERO numeral never approaches the READ floor)
    let bigSize = 190;
    setFont(ctx, bigSize, 700);
    while (ctx.measureText(hero.big).width > hw - 160 && bigSize > 100) {
      bigSize -= 4;
      setFont(ctx, bigSize, 700);
    }
    ctx.fillStyle = tone.main;
    ctx.textAlign = 'left';
    ctx.fillText(hero.big, hx0 + 72, hy0 + 232);
    // the label — READ text at the floor (40), one wrap, max 2 lines
    setFont(ctx, 40, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    const labelLines = wrapText(ctx, String(hero.label ?? ''), hw - 900, 40, 600).slice(0, 2);
    labelLines.forEach((ln, j) => ctx.fillText(ln, hx0 + 72, hy0 + 306 + j * 48));
    // the tag — a tone chip at the card's top right, RIGHT-ALIGNED so it
    // can never reach the side host's envelope (the guard caught the
    // left-anchored version plating the host at 452s)
    if (hero.tag) {
      const tagY = hy0 + 62;
      const tagW = chipWidth(ctx, String(hero.tag), { size: 36, padX: 22, iconDot: true });
      chip(ctx, String(hero.tag), hx0 + hw - 40 - tagW, tagY, { size: 36, weight: 700, fg: tone.main, bg: PALETTE.white, border: rgba(tone.main, 0.45), iconDot: tone.main });
    }
    ctx.restore();
  }
  // the hero's impact grammar — ring + sparkles from the numeral
  impactRing(ctx, hx0 + hw * 0.35, hy0 + 180, t, 1300, 190);
  if (t > 1300 && t < 2200) {
    sparkles(ctx, hx0 + hw * 0.35, hy0 + 180, t, t - 1300, { count: 9, radius: 150 });
  }
  // P3-5: end the hero rack's mid-plane translate
  ctx.restore();
  // ── THE TWO DEMOTED STATS — pill chips in one quiet row beneath the hero ──
  // P3-5: the chip row rides the FARTHER plane (0.55) — a push separates
  // the hero rack from its own summary row
  ctx.save();
  ctx.translate(chipDepth.dx, chipDepth.dy);
  chips.forEach((c, i) => {
    const cp2 = clamp01((t - 1500 - i * 550) / 700);
    if (cp2 <= 0) return;
    const ct = TONE(c.tone || 'up');
    const cx2 = 180 + i * (hw / 2);
    const cy2 = hy0 + hh + 34;
    ctx.save();
    ctx.globalAlpha = cp2;
    registerRect(`statCards:chip${i}`, cx2, cy2, hw / 2 - 40, 84);
    ctx.fillStyle = PALETTE.white;
    roundRect(ctx, cx2, cy2, hw / 2 - 40, 84, 42);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(ct.main, 0.5);
    roundRect(ctx, cx2, cy2, hw / 2 - 40, 84, 42);
    ctx.stroke();
    setFont(ctx, 62, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = ct.main;
    const bw = ctx.measureText(c.big).width;
    ctx.fillText(c.big, cx2 + 34, cy2 + 58);
    // the chip's label — measured, wrapped to 2 rows inside the 84px pill
    // (the v10.1 single-line draw ran long labels past the chip's right
    // edge INTO the next chip: "S&P 500 net profit m…" plated "12.4%",
    // vision-verified on the statCards sit-back frame). Same measured
    // grammar as the fundSplit chips: wrap at LABEL_FLOOR, max 2 rows,
    // baselines y+40/y+70; a label that cannot fit two rows inside the
    // column yields (the VO carries the full text).
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    const short = String(c.label ?? '').split(' · ')[0];
    const maxLW = cx2 + (hw / 2 - 40) - 24 - (cx2 + 34 + bw + 22);
    if (maxLW > 140) {
      const gl = wrapText(ctx, short, maxLW, 34, 600).slice(0, 2);
      const baseY = gl.length > 1 ? cy2 + 40 : cy2 + 54;
      gl.forEach((ln, li) => {
        ctx.fillText(ln, cx2 + 34 + bw + 22, baseY + li * 30);
      });
    }
    ctx.restore();
  });
  ctx.restore();
  sourceTag(ctx, W, s.source as string, H - 60);
  // AUDIT-ROUND-2 (fix 4 — UN-STRAND THE HOST): the host at W*0.845 was
  // "cropped awkwardly and gestures at nothing" — the content now ends at
  // x 1330 (the hero card) and the host stands BESIDE it in his gesture
  // cone: pointL reaches INTO the hero card, the bias-driven headYaw
  // (fix 11) turns his face to it, and his feet sit clear of the chip row.
  // 100-JUDGE PANEL / Phase 2 item 3 — SIT-BACK ON THE STAT CARD EDGE
  // (report §6 Phase 2): once the hero numeral has landed (2.4s), the
  // host PERCHES on the hero card's bottom edge — sitRise for the
  // 480ms push-off, then sitBack held. The 12-second-hold risk the
  // report flagged dies here: the mood chapter's host stages ON its
  // data, the seat line = the card's bottom edge (hy0 + hh), the
  // ground-contact math unchanged.
  // CONTACT-PASS RETRACTION (dossier follow-up, vision-verified): the sit
  // shipped the host at x=W*0.82 — 244px RIGHT of the card's edge — so he
  // perched on AIR at the frame's margin (the seat line moved; the X never
  // did), and every x that puts him over the card drops his dangling feet
  // onto the chip row below (chips y 652-736, guard-caught in rehearsal).
  // The honest staging: standing, feet on the ground, pointL cone into
  // the hero card — the sit grammar stays in the film where it lands ON
  // its seat (the mood chapter's perch is re-staged separately).
  hostSmall(g, W * 0.82, 'pointL', 19, g.H * 0.615, 1.09, 0, 'aha', 1.4, 1, true, 0.4); // PLAYBOOK D3+D4: 0.845 -> 0.82 (edge class)
}

// ── ownerWorker scene ────────────────────────────────────────────────────────
export function ownerWorkerScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 191);
  const L = s.left as any;
  const R = s.right as any;
  // divider
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.grid, 0.6);
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 12]);
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.18);
  ctx.lineTo(W / 2, H * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // FIX 3 (density payload — the frame measured 2.3% info, RMS 25.4: the
  // film's flattest read): each half gains its own ROOM (the film's plate
  // language at whisper register — tonal, never counted as content) and the
  // trend each line SPEAKS gets drawn along it: the owner's rise carries
  // three vivid up-marks, the worker's flat line carries the paycheck
  // dashes with the last one short (the squeeze the VO names).
  {
    const washTop = H * 0.14;
    const washBot = H * 0.86;
    const lw = ctx.createLinearGradient(W * 0.5, 0, 0, 0);
    lw.addColorStop(0, rgba(PALETTE.up, 0.0));
    lw.addColorStop(0.35, rgba(PALETTE.up, 0.08));
    ctx.fillStyle = lw;
    ctx.fillRect(0, washTop, W * 0.5, washBot - washTop);
    const rw2 = ctx.createLinearGradient(W * 0.5, 0, W, 0);
    rw2.addColorStop(0, rgba(PALETTE.down, 0.0));
    rw2.addColorStop(0.35, rgba(PALETTE.down, 0.08));
    ctx.fillStyle = rw2;
    ctx.fillRect(W * 0.5, washTop, W * 0.5, washBot - washTop);
  }
  const panels: [any, number, string][] = [[L, W * 0.08, 'left'], [R, W * 0.55, 'right']];
  panels.forEach(([pnl, x, side], i) => {
    const ap = clamp01((t - i * 700) / 800);
    if (ap <= 0) return;
    const tone = TONE(pnl.tone);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    setFont(ctx, 34, 700);
    // PHASE-0 round 4 (ownerWorker RMS 25.9): panel titles ride the vivid
    // ramp — the two titles are the frame's biggest type; vivid carries
    // the contrast the flat-frame flag asked for.
    ctx.fillStyle = tone.vivid ?? tone.main;
    ctx.fillText(pnl.title.toUpperCase(), x + 340, H * 0.24);
    // mini stickman: shareholder on a rising line / worker on flat ground
    // PANEL-9 R7d (panel text plated by the caption pill): the figure stood
    // at H*0.72 with its wrap lines at H*0.85+j*44 (918/962) — the second
    // line dead inside the caption band (two-row pill tops at y=796), so
    // the opaque pill plated over the panel text and left "gai…" / "…oesn't"
    // fragments peeking past its edges (flagged on the ownerWorker render).
    // Figure now at H*0.60, wrap lines at 726/768 — everything, including
    // descenders, clears CAPTION_ZONE_TOP with ~20px to spare.
    // AUDIT-2 / §10.2 (report §5.2 — "feet, teal line, and shadow are three
    // different planes"): ONE PLANE per figure. The owner's ground sits ON
    // the rising line where he stands (line@hx = hy−32 → ground hy−38 so
    // the shoe soles kiss it) and his ground shadow ROTATES to the line's
    // slope; the worker's flat line moves up to the shadow plane (hy+6, the
    // ellipse's contact core) so feet, line and shadow finally agree.
    const hx = x + 340;
    const hy = H * 0.6;
    const riseSlope = -116 / 340; // the owner's line: (hy+26)→(hy−90) over ±170
    if (side === 'left') {
      // PHASE-0 (report §6, Fix 3 — ownerWorker RMS 24.8, the flat-frame
      // flag): the ground lines deepen to full-opacity vivid ink (the
      // panel text steps inkSoft -> ink) — the class-diagram's ink mass
      // carries the frame's contrast.
      ctx.strokeStyle = PALETTE.upVivid;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 170, hy + 26);
      ctx.lineTo(hx + 170, hy - 90);
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(PALETTE.inkSoft, 0.9);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 170, hy + 6);
      ctx.lineTo(hx + 170, hy + 6);
      ctx.stroke();
    }
    // v10 (panel CHAR-4): the class SYMBOL is the scarf. The v9 frame drew
    // the same gold scarf on BOTH figures — "if the tie is your class symbol,
    // this panel contradicts itself" (vision panel). The OWNER (left, on the
    // rising line) keeps the scarf; the WORKER (right, on flat ground) does
    // not — and his pose is now facepalm (dismay), not the default shrug
    // every other background figure uses.
    // PANEL-12 / P0-6 (report §12.6): UNIFY THE CAST — both figures now run
    // the STANDARD rig unchanged (the bespoke {lean: 12} override is gone;
    // the climb pose carries its own lean). Same ink, same alpha-stepped far
    // limbs, same hand glyphs, same twin shoes as the host — differentiated
    // ONLY by accessory (scarf vs none) and pose. One template, variations
    // by proportion and accessory — never by line style.
    const pose = side === 'left' ? POSES.climb : POSES.facepalm;
    // FIX 3 payload: the trend marks — drawn BEFORE the figures so they
    // read as the line's own annotation.
    if (side === 'left') {
      const mp = clamp01((t - 1600) / 800);
      if (mp > 0) {
        ctx.save();
        ctx.globalAlpha = mp;
        ctx.strokeStyle = PALETTE.upVivid;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let k2 = 0; k2 < 3; k2++) {
          const ax2 = hx - 120 + k2 * 118;
          const ay2 = hy + 6 - (k2 + 0.5) * 38;
          ctx.beginPath();
          ctx.moveTo(ax2 - 14, ay2 + 10);
          ctx.lineTo(ax2, ay2 - 12);
          ctx.lineTo(ax2 + 14, ay2 + 10);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      const mp = clamp01((t - 1600) / 800);
      if (mp > 0) {
        ctx.save();
        ctx.globalAlpha = mp;
        ctx.strokeStyle = rgba(PALETTE.inkSoft, 0.85);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        // the paycheck dashes — same length, same rhythm, until the last
        for (let k2 = 0; k2 < 4; k2++) {
          const dashW = k2 === 3 ? 34 : 58;
          const ax2 = hx - 130 + k2 * 66;
          ctx.beginPath();
          ctx.moveTo(ax2, hy + 34);
          ctx.lineTo(ax2 + dashW, hy + 34);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // v3 (panel P0-3): v2 renderer — the shareholder/worker figures match the
    // presenter's body style (they read as the same world)
    // AUDIT-2 / §10.2: ground planes agree (owner ON his line with a
    // slope-rotated shadow; worker on the flat line at the shadow plane).
    // FIX 3: 0.86 -> 1.05 — the figures are the frame's subjects; at 0.86
    // they read as thumbnails in a two-thirds-empty room.
    drawStickmanV2(ctx, hx, hy - (side === 'left' ? 44 : 0), 1.05, t, {
      pose,
      alpha: clamp01((t - i * 700 - 200) / 500),
      look: 0.3,
      scarf: side === 'left', // v10: the owner wears the brand; the worker doesn't
      shadowRot: side === 'left' ? Math.atan(riseSlope) : 0,
      // FIX 3: the rise slope's ground anchor follows the bigger figure
      // (44px lift keeps the owner's soles ON his rising line at 1.05x),
      // 100-JUDGE PANEL / Phase 1 item 4 — CAST BY SILHOUETTE (report §6
      // Phase 1): the worker gets a CAP. Owner = scarf + climb, worker =
      // cap + facepalm — accessory per role, never scale: the pair reads
      // as cast, not copies.
      variant: side === 'right' ? 'worker' : undefined,
    }, 21 + i);
    // v10: the worker's line gets a terminal down-tick — the trend the VO
    // names ("not a paycheck for whoever doesn't"), drawn where the eye lands
    // AUDIT-2 / 0.4 (report §10.1, S4): the arrow REGISTERS with the
    // collision guard (it was one of the few drawn elements the sweep was
    // blind to — "a layout crime at any budget") and its length CLAMPS so
    // the tip can never bottom past CAPTION_ZONE_TOP − 14. Structural: the
    // guard now enforces what the sweep always believed.
    if (side === 'right') {
      const tp = clamp01((t - 2400) / 600);
      if (tp > 0) {
        const e = easeOutCubic(tp);
        const ax = hx + 130;
        const ay = hy + 6; // rides the worker's new ground line
        const lenY = Math.min(46, CAPTION_ZONE_TOP - 14 - ay);
        const lenX = 60 * (lenY / 46);
        registerRect(
          `owArrow:${Math.round(hx)}`,
          ax - 12, ay - 12, lenX + 24, lenY + 24
        );
        ctx.save();
        ctx.globalAlpha = tp * 0.9;
        ctx.strokeStyle = PALETTE.downVivid;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + lenX * e, ay + lenY * e);
        ctx.stroke();
        // arrowhead
        ctx.beginPath();
        ctx.moveTo(ax + lenX * e, ay + lenY * e);
        ctx.lineTo(ax - 12 + lenX * e, ay - 12 + lenY * e);
        ctx.moveTo(ax + lenX * e, ay + lenY * e);
        ctx.lineTo(ax + 18 + lenX * e, ay - 6 + lenY * e);
        ctx.stroke();
        ctx.restore();
      }
    }
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink; // PHASE-0 (Fix 3): inkSoft -> ink (flat-frame flag)
    // R7d: baselines 726 / 768 (was 918 / 962) — above CAPTION_ZONE_TOP,
    // 46px below the figure's ground line so the two never touch.
    wrapText(ctx, pnl.line, 560, 30, 600).forEach((ln, j) => {
      ctx.fillText(ln, hx, hy + 78 + j * 42);
    });
    ctx.restore();
  });
    // AUDIT-3 / §2.5 (report Phase 2.5 — "a coin crossing the owner/worker
    // divider"): the coins now straddle the dashed divider (cx = W/2,
    // spread 110) — value visibly CROSSES from the worker's half to the
    // owner's, the metaphor the scene narrates, and one more element
    // occludes another (coins pass in front of the divider line).
    floatCoins(ctx, W / 2, H * 0.5, t, 5, 110);
}

// ── fundSplit scene ──────────────────────────────────────────────────────────
export function fundSplitScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 201, 0.5);
  // (title row 150->190 as all sceneTitle sites — D-08; see charts.sceneTitle)
  sceneTitle(ctx, 'What\u2019s inside “the S&P 500”?', 180, 220, clamp01(t / 600)); // AUDIT-2 §10.3: +24px left margin — clears the raised camera stack
  // the fund box
  const bx = W * 0.09;
  const by = H * 0.24;
  const bw = 430;
  // PANEL-10 (D-11): bh 120 -> 150. The subtitle '500 companies · feels
  // diversified' at the 28px floor measures ≈540px — it ran ≈180px past the
  // 430px card's right edge into the split arrows (the vision panel read it
  // as a chevron cutting the card). It now wraps to two measured lines that
  // fit bw-72, and the card grew to hold them without violating the floor.
  const bh = 150;
  const ap = clamp01(t / 700);
  ctx.save();
  ctx.globalAlpha = ap;
  card(ctx, bx, by, bw, bh, { r: 26 });
  setFont(ctx, 34, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.fillText('S&P 500 index fund', bx + 36, by + 56);
  setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor
  ctx.fillStyle = PALETTE.inkFaint;
  // PANEL-10 (D-11): wrap inside bw-72 — never wider than the card, so it
  // can no longer reach the split arrows' zone at x>=623.
  const subLines = wrapText(ctx, '500 companies · feels diversified', bw - 72, TYPE_FLOOR, 600).slice(0, 2);
  subLines.forEach((ln, j) => ctx.fillText(ln, bx + 36, by + 92 + j * 34));
  ctx.restore();

  // split arrows — AUDIT-ROUND-2 (fix 2): shortened to point INTO the
  // now-huge gold bars (the divergence graphic owns the frame)
  const sp = clamp01((t - 800) / 700);
  if (sp > 0) {
    ctx.save();
    ctx.globalAlpha = sp;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + bw + 16, by + bh / 2);
    ctx.lineTo(bx + bw + 96, by - 14);
    ctx.moveTo(bx + bw + 16, by + bh / 2);
    ctx.lineTo(bx + bw + 96, by + bh + 22);
    ctx.stroke();
    ctx.restore();
  }

  // 7 gold bars vs 493 gray bars (dot strip)
  // AUDIT-ROUND-2 (fix 2 — ONE HERO PER FRAME, fundSplit): the 7-vs-493
  // graphic — "the best data-viz idea on the sheet" — was criminally
  // undersized (7 bars at 26×120 + a 510px dot strip riding the frame's
  // right edge; the phone-gate verdict: "Disaster at feed scale: 7-names/
  // 493-others microscopic"). It DOUBLES and TAKES THE FRAME: 7 bars at
  // 56×300 across x 560-1090, the 493 wall as a 4-row field spanning
  // x 1170-1855 — the divergence IS the frame now. The stat cards demote
  // to compact chips on the left column; the full labels ride the VO.
  const gp = clamp01((t - 1400) / 900);
  if (gp > 0) {
    const gx = W * 0.333;
    const gy = H * 0.28;
    // PHASE-0 (report §6, Fix 3): the 7 bars take the DISPLAY gold (was
    // tone gold = same value, made explicit here) and the 493 wall's
    // pillar fill rises 0.62 -> 0.72 — the audit's fundSplit twin measured
    // the best saturation in the film (0.130) but the gray wall still
    // washed at the gate; the wall needs to read as MASS.
    for (let i = 0; i < 7; i++) {
      const p2 = clamp01((t - 1400 - i * 110) / 460);
      ctx.fillStyle = PALETTE.goldDisplay;
      roundRect(ctx, gx + i * 78, gy, 56, 300 * easeOutCubic(p2) + 8, 10);
      ctx.fill();
    }
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText('7 stocks', gx, gy + 356);
    // gray mass — the 493 wall: 6 rows × 20 cols of 20px pillars, 27px
    // pitch — a real mass the eye can weigh against the seven
    // FIX 3 (empty-band payload): 4 -> 6 rows — the wall's mass now runs to
    // y≈700, filling the right half of the band the phone gate measured.
    const grayX = gx + 7 * 78 + 86;
    for (let i = 0; i < 120; i++) {
      const p2 = clamp01((t - 1900 - i * 12) / 520);
      // PHASE-0 (Fix 3): 0.62 -> 0.72 (see note above — the wall reads as mass).
      ctx.fillStyle = rgba(PALETTE.grid, 0.72);
      const col = i % 20;
      const row = Math.floor(i / 20);
      roundRect(ctx, grayX + col * 27, gy + 132 + row * 46, 20, 34 * easeOutCubic(p2) + 4, 3);
      ctx.fill();
    }
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('493 others', grayX, gy + 356);
  }

  // stats
  // AUDIT-ROUND-2 (fix 2 + fix 3): the stat cards demote to compact chips —
  // the graphic owns the frame. Labels shortened to glance lines (the VO
  // carries the full sentences: "roughly 42% of the index's 2025 return…
  // under 1.5% of its names").
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    const sp2 = clamp01((t - 2600 - i * 700) / 800);
    if (sp2 <= 0) return;
    ctx.save();
    ctx.globalAlpha = sp2;
    // PHASE-0 (report §6, Fix 2 — KILL THE EMPTY BANDS, fundSplit 24%):
    // the stat chips rode 0.40H+128px pitch under the fund box while the
    // whole 0.62-0.86H band sat empty (the phone gate's worst flag). The
    // chips now cascade from 0.56H at 150px pitch — they fill the band
    // under the 7-vs-493 graphic instead of stacking beside the box.
    // PLAYBOOK D3 follow-up (round 2): the cascade rode 0.545H+138px —
    // stat1's bottom (830) still sat deep inside the 2-row pill band.
    // The chips move UP beside the graphic's lower half (0.44H, pitch
    // 96): stat2's bottom lands at 740, clear of the pill envelope by
    // 36px at every certified camera state.
    // FIX 3 (empty-band payload — the phone gate measured a 24% empty band
    // at rows 666-888: the graphic is top-heavy and the chips ended at
    // 675). The chips cascade 0.44H+96 -> 0.50H+120: chip 1 bottoms at 764,
    // clear of the worst-case 2-row pill envelope (776) by 12px (the chips
    // are registered — the guard asserts it), and the band's left half
    // carries content down to 764.
    const y = H * 0.5 + i * 120;
    const c = TONE(st.tone || 'default');
    registerRect(`fundSplit:stat${i}`, W * 0.09, y, 420, 104);
    card(ctx, W * 0.09, y, 420, 104, { r: 24 });
    setFont(ctx, 58, 700);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, W * 0.09 + 32, y + 68);
    const bigW = ctx.measureText(st.big).width;
    // the glance label — up to TWO stacked lines, LABEL_FLOOR, measured to
    // fit the chip. D-3 (100-judge dossier): the old slice(0,1) truncated
    // the glance mid-phrase on the second chip ("<1.5%  of the" — verified
    // on frame 15-fundSplit). The wrap now draws its first two lines inside
    // the 104px chip (baselines y+50/y+80, descenders ≈88 < 104) and the
    // script glance strings are sized to wrap cleanly.
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    const glance = String(st.label ?? '').split(' · ')[0];
    const maxLW = W * 0.09 + 420 - 24 - (W * 0.09 + 32 + bigW + 22);
    if (maxLW > 140) {
      const gl = wrapText(ctx, glance, maxLW, 34, 600).slice(0, 2);
      const baseY = gl.length > 1 ? y + 50 : y + 60;
      gl.forEach((ln, li) => {
        ctx.fillText(ln, W * 0.09 + 32 + bigW + 22, baseY + li * 30);
      });
    }
    ctx.restore();
  });

  // callback chip
  const cb = s.callbackChip as string | undefined;
  if (cb) {
    const cp2 = clamp01((t - 4200) / 800);
    if (cp2 > 0) {
      ctx.save();
      ctx.globalAlpha = cp2;
      // PANEL-10 (D-07 sibling): 26 -> TYPE_FLOOR (28) — the chip was the
      // last sub-floor reading text in the film.
      setFont(ctx, TYPE_FLOOR, 600);
      const tw = ctx.measureText(cb).width;
      // PANEL-10 (D-09): was chy=966, verified only as a STATIC frame. The
      // ch6 hero move was then changed to a camera 'rise' (P1-2), which
      // lifted the chip 80px into the caption pill band — the pill plated
      // its top half on every frame past ~40% of the group. The rise is now
      // a truck (y never moves), and the chip is re-anchored at 996 in the
      // below-pill gap: pill bottom ≈956, progress bar ≈1072 — the chip sits
      // ~40px clear of the pill and ~26px above the bar, and survives the
      // 34px exit lift with ≥2px to spare (guard v2 sweeps it — it is now
      // REGISTERED, which is how D-09 escaped the v9 sweep in the first
      // place: unregistered content is invisible to the guard).
      // PHASE-0 note: stays at the 996 below-pill gap anchor (D-09) — the
      // re-anchored stat chips (0.56H, 150px pitch) end at ~0.78H, clear
      // of this chip's band by >150px; the guard sweep is the referee.
      const chy = 996;
      registerRect('fundSplit:callbackChip', W / 2 - tw / 2 - 28, chy, tw + 56, 54);
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, W / 2 - tw / 2 - 28, chy, tw + 56, 54, 27);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, W / 2 - tw / 2 - 28, chy, tw + 56, 54, 27);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(cb, W / 2 - tw / 2, chy + 36);
      ctx.restore();
    }
  }
  // PANEL-10 (D-10 class): host W*0.88 -> W*0.84 — under the truck+push
  // camera stack the shadow envelope (right edge ≈x1899 static) crossed
  // x=1920; at W*0.84 the envelope clears the edge under the full stack.
  // PANEL-12 / P2-6 (report §14.6): the TWIST reaction shot — the side host
  // takes the 'aha' beat (face 1.4×, talk paused) while the camera pushes
  // toward him (director.cameraV2, same reactionAt() clock).
  // PANEL-12 / P2-6: THE TWIST REACTION SHOT — the side host takes the
  // 'shock' beat (true close-up: face 1.8×, 2× jaw gasp, sclera eyes)
  // while the camera pushes 0.28 toward him (director.cameraV2, same
  // reactionAt() clock).
  // P0-3 (100-judge audit, Table 2 — re-stage the twist): the host used to
  // stand at W*0.835 on the default 1.09 side scale — the audit frame read
  // "host in the parking lot, pointing at nothing" while the film's most
  // important beat (7 gold bars vs the 493 wall) lived across the frame.
  // He now stands INSIDE the divergence at x=1650: his head (top ≈234)
  // breaks the 493 gray-mass band (y≈208-280) so he reads as standing
  // against the wall itself, at 1.5× — scaled against the mass he is
  // reacting to — gesturing across at the 7 gold bars. The reaction push
  // pivots ON him (REACTIONS['c8-fund'] px 1700) so the twist close-up
  // frames host-against-wall instead of pushing him off the divergence.
  // Guard-clean: envelope x 1458..1842, y 216..714 — clear of stat card 2
  // (x≤1446) by 12px, card 3 (y≥736) by 22px, the pill (y≥808) by 94px.
  // P0-3 sweep fix round 2: the worst-case exit camera adds ~163px at
  // this x-band, so the certified window is envelope-right <= 1757 AND
  // envelope-left >= 1450 (the cards end at 1446) — a 307px window, i.e.
  // scale <= 1.20. Final: x=1600 @ 1.15, ground 585 — head top ~298
  // still grazes the 493 band (208-302), envelope 1453-1747 clears the
  // cards by 7px and the worst exit camera by 10px.
  // CONTACT VERB (P2 grammar, dossier follow-up — "tap the 493-companies
  // wall"): the host steps left to x=1395 — INSIDE the divergence, his
  // body breaking the gray mass — and the near hand BRACES on the wall's
  // top-left edge (x 1350, y 438) every frame, contact shadow where palm
  // meets wall. Through the twist reaction the arm stays planted while
  // the body recoils: he holds himself against the 493 as the number
  // lands. The narrowed contact envelope (70·1.15 = 81 → 1314-1476)
  // clears the stat chips (x ≤ 593) and the callback chip (y 996); the
  // wall is background-grade (unregistered); the reaction pivot follows
  // him (REACTIONS['c8-fund'] px 1700 → 1420, scene-context.ts).
  hostSmall(g, 1395, 'pointL', 24, 585, 1.15, reactionAt(g.s.sceneKey, g.t, g.d), 'shock', 1.8, 2, false,
    undefined, undefined, undefined, { x: 1350, y: 438, hand: 'palm', bend: 1 }, 'left'); // P2-4: parallax=false — he stands INSIDE the data (the wall's plane)
}

// ── oddsSpread scene ─────────────────────────────────────────────────────────
export function oddsSpreadScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 211, 0.4, 'up'); // v10: the data room plate
  sceneTitle(ctx, 'Recession odds — the honest range', 180, 220, clamp01(t / 600));
  const trackY = H * 0.42;
  const trackX = 220;
  const trackW = W - 440;
  // axis 0..100
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.fillStyle = rgba(PALETTE.track, 0.35);
  roundRect(ctx, trackX, trackY - 12, trackW, 24, 12);
  ctx.fill();
  for (let v = 0; v <= 100; v += 25) {
    const x = trackX + (v / 100) * trackW;
    setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.textAlign = 'center';
    ctx.fillText(`${v}%`, x, trackY + 52);
  }
  ctx.restore();

  const markers = (s.markers as any[]) || [];
  markers.forEach((m, i) => {
    const mp = clamp01((t - 700 - i * 650) / 700);
    if (mp <= 0) return;
    const x = trackX + (clamp01(m.at / 100)) * trackW;
    const c = TONE(m.tone);
    ctx.save();
    ctx.globalAlpha = mp;
    // band
    if (m.band) {
      const x0 = trackX + (m.band[0] / 100) * trackW;
      const x1 = trackX + (m.band[1] / 100) * trackW;
      ctx.fillStyle = rgba(c.main, 0.22);
      roundRect(ctx, x0, trackY - 12, x1 - x0, 24, 12);
      ctx.fill();
    }
    // pin
    const drop = (1 - easeOutBack(mp)) * -40;
    ctx.strokeStyle = rgba(c.main, 0.5);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, trackY - 12);
    ctx.lineTo(x, trackY - 90 + drop);
    ctx.stroke();
    ctx.fillStyle = c.main;
    ctx.beginPath();
    ctx.arc(x, trackY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, trackY, 6, 0, Math.PI * 2);
    ctx.fill();
    // label card
    setFont(ctx, 34, 600);
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, m.label, 330, 24, 600);
    const cw2 = 350;
    const chh2 = 30 + lines.length * 32 + 18;
    const cy2 = trackY - 100 - chh2 + drop;
    const cx2 = Math.min(Math.max(x, trackX + cw2 / 2), trackX + trackW - cw2 / 2);
    ctx.fillStyle = '#fff';
    roundRect(ctx, cx2 - cw2 / 2, cy2, cw2, chh2, 18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(c.main, 0.5);
    roundRect(ctx, cx2 - cw2 / 2, cy2, cw2, chh2, 18);
    ctx.stroke();
    ctx.fillStyle = c.main;
    lines.forEach((ln, j) => ctx.fillText(ln, cx2, cy2 + 42 + j * 32));
    ctx.restore();
  });

  const kp = clamp01((t - 4200) / 700);
  if (kp > 0 && s.kicker) {
    ctx.save();
    ctx.globalAlpha = kp;
    ctx.textAlign = 'center';
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(s.kicker as string, W / 2, H * 0.68);
    ctx.restore();
  }
  const cl = clamp01((t - 5200) / 800);
  if (cl > 0 && s.closer) {
    ctx.save();
    ctx.globalAlpha = cl;
    ctx.textAlign = 'center';
    setFont(ctx, 34, 600);
    ctx.fillStyle = PALETTE.ink;
    // v3 (panel P0-2): was H*0.78 (y≈842) — inside the caption band, hidden
    // behind the pill. Sit ≥48px above CAPTION_ZONE_TOP.
    ctx.fillText(s.closer as string, W / 2, ((CAPTION_ZONE_TOP - 48) / 1080) * H);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

export { drawK3D, drawK, glowBlob };
