/**
 * Collision guard (report P0-1) — a dev-mode bounding-box registry that
 * retires the entire D-01/D-02/R7 defect class: "opaque caption pill plates
 * scene content".
 *
 * How it works:
 *  1. Every painting helper that draws reading content (theme.card / theme.chip /
 *     theme.fitText, charts.sceneTitle / statCard / barRow / annotations, and
 *     the stickman renderer's feet+shadow envelope) calls registerRect().
 *  2. drawCaptions() calls registerPill() with the pill's exact rect.
 *  3. drawWatermark() calls registerFixed() — the watermark is painted after the
 *     camera restore, so unlike the pill it never moves; the guard keeps its
 *     own list of such fixed furniture.
 *  4. After a frame is drawn, collectViolations() reports:
 *     - every content rect that intersects the pill or any fixed furniture
 *       (with a camera envelope: the director's camera can translate content
 *       up to ~±20px and scale up to 1.052, so the pill is expanded by a 20px
 *       envelope before comparing; overlaps shallower than 10px are ignored as
 *       camera-worst-case noise, not shipped defects), and
 *     - every content rect that crosses the frame edge under the exact camera
 *       (PANEL-10: the aiDatacenter host's shadow was pushed 39px past x=1920
 *       by the ch5 hero push — invisible to a pill-only guard).
 *
 * Zero production cost: everything is a no-op unless `collisionGuard.enabled`
 * is set to true (the render harness and tools/frame-dump.mjs do this).
 * The studio render path never enables it.
 */

export interface GuardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollisionViolation {
  frame: string;
  id: string;
  rect: GuardRect; // the content rect (design-grid px)
  pill: GuardRect; // the obstacle rect, camera-envelope expanded
  depth: number; // overlap depth in px (max of x/y penetration)
  /** PANEL-10 (guard v2): which class of check produced this — 'pill',
   *  'fixed:<id>' (unmoving furniture, e.g. the watermark), or 'edge'.
   *  v10 (PANEL-11): 'text:<id>' — a reading-text vs reading-text overlap.
   *  v10.1 (panel 11 re-review): 'host' — a side-host body envelope plating
   *  scene content (statCards host over the 12.4% card, aiDatacenter host
   *  in the scrolling rack field). */
  kind: 'pill' | 'fixed' | 'edge' | 'text' | 'host';
}

interface State {
  enabled: boolean;
  frame: string;
  /** v10.1: 'host' entries are full-body side-host envelopes (hostSmall /
   *  the aiDatacenter walk host, opted in via drawStickmanV2 hostBody);
   *  everything else is scene content. The host-vs-content pass below
   *  compares the two classes — a side host must never plate a card, chart
   *  or dot field. QA-SWEEP (guard v2.2): noEdge marks intentionally
   *  off-frame scenery (scrolling racks) — exempt from the edge rule only. */
  content: Array<GuardRect & { id: string; cls?: 'content' | 'host' | 'contact'; noEdge?: boolean }>;
  /** v10 (PANEL-11 D-01/D-02): READING-text rects — the subset of content
   *  that carries words the viewer must read (scene titles, source tags,
   *  big captions, count badges). Checked against EACH OTHER, because the
   *  two shipped defects this class produced (dotGrid's "10 of 500" badge
   *  plating the scene title; gasPump's caption intersecting the source
   *  tag) were content-vs-content — invisible to a pill-only guard.
   *  `screen` marks identity-transform text that never rides the camera. */
  texts: Array<GuardRect & { id: string; screen: boolean }>;
  pill: GuardRect | null;
  /** PANEL-10 (guard v2): fixed furniture (watermark band) in screen space. */
  fixed: Array<GuardRect & { id: string }>;
  /** chapter cards / overlays intentionally cover the frame — suppress */
  overlay: boolean;
  violations: CollisionViolation[];
  /** CONTACT VERBS (P2 grammar, dossier follow-up): the content-rect ids the
   *  host is ALLOWED to touch this frame. A scene that stages a contact verb
   *  (hand on the pie's rim, palm on the rack face, tap on the 493 wall)
   *  declares the touched object here every frame; the host-vs-content pass
   *  exempts exactly those rects — nothing else. Every other check (pill,
   *  fixed furniture, frame edge, text-vs-text) still applies to the host,
   *  the hand rect and the object. Cleared by resetGuard each frame. */
  contactIds: Set<string>;
  /** P1-2 (report): the director's camera for THIS frame, design-grid space.
   *  When present (16:9 path), content rects are transformed by the exact
   *  camera before comparison — hero camera moves (truck/push/pull) no
   *  longer rely on a static ±20px envelope. Null = envelope mode (Shorts,
   *  probes). */
  camera: { dx: number; dy: number; scale: number } | null;
}

/** Global guard state. The harness flips `enabled` before rendering. */
export const collisionGuard: State = {
  enabled: false,
  frame: '',
  content: [],
  texts: [],
  pill: null,
  fixed: [],
  overlay: false,
  violations: [],
  camera: null,
  contactIds: new Set<string>(),
};

/** Reset per-frame state. Call at the top of drawFrame when enabled. */
export function resetGuard(frame: string): void {
  if (!collisionGuard.enabled) return;
  collisionGuard.frame = frame;
  collisionGuard.content = [];
  collisionGuard.texts = [];
  collisionGuard.pill = null;
  collisionGuard.fixed = [];
  collisionGuard.overlay = false;
  collisionGuard.violations = [];
  collisionGuard.camera = null;
  collisionGuard.contactIds = new Set<string>();
}

/**
 * CONTACT VERBS: declare the content rects this frame's host may touch.
 * Call INSIDE the scene drawer, every frame, BEFORE collectViolations.
 * Only these ids are exempt from the host-vs-content pass; the hand itself
 * still registers as a 'contact' rect so it can never plate the caption
 * pill or the watermark, and the sweep + frame review remain the referees
 * of whether the touch actually lands on the object.
 */
export function declareHostContact(...ids: string[]): void {
  if (!collisionGuard.enabled) return;
  for (const id of ids) collisionGuard.contactIds.add(id);
}

/** P1-2: publish this frame's camera (design-grid space) so violations are
 *  computed against the exact transform the pixels actually received. */
export function setGuardCamera(dx: number, dy: number, scale: number): void {
  if (!collisionGuard.enabled) return;
  collisionGuard.camera = { dx, dy, scale };
}

/** Mark the frame as intentionally covered (chapter card moments). */
export function setGuardOverlay(on: boolean): void {
  if (!collisionGuard.enabled) return;
  collisionGuard.overlay = on;
}

/** Register a painted content rect (design-grid px). No-op when disabled.
 *  v10.1: `cls: 'host'` marks a full-body side-host envelope — those are
 *  checked against every content rect (see collectViolations).
 *  QA-SWEEP (guard v2.2): `opts.edge === false` marks intentionally
 *  off-frame SCENERY (the aiDatacenter racks scroll past the frame edges
 *  to the horizon by design — repetition-to-horizon staging, not a crop
 *  defect). Such rects keep every overlap check (pill, fixed furniture,
 *  host-vs-content aisle) but skip the frame-edge rule, which exists to
 *  catch UNINTENDED crops of reading content, not corridor staging. */
export function registerRect(
  id: string, x: number, y: number, w: number, h: number,
  cls: 'content' | 'host' | 'contact' = 'content',
  opts: { edge?: boolean } = {}
): void {
  const g = collisionGuard;
  if (!g.enabled || w <= 0 || h <= 0) return;
  // Ignore degenerate far-offscreen rects (camera bleed fills etc.)
  if (x > 1920 || y > 1080 || x + w < 0 || y + h < 0) return;
  g.content.push({ id, x, y, w, h, cls, noEdge: opts.edge === false });
}

/** v10 (PANEL-11): register a READING-text rect. Same registry rules as
 *  registerRect, plus the text-vs-text check in collectViolations. Use for
 *  any painted words the viewer must read that are NOT inside a card/chip
 *  (those already plate safely): scene titles, source tags, scene captions,
 *  count badges, kicker chips.
 *  `screen: true` for text painted in SCREEN space (identity transform,
 *  never rides the camera — e.g. the source tag): it joins the text-text
 *  check untransformed and is NOT treated as camera-riding content. */
export function registerText(id: string, x: number, y: number, w: number, h: number, screen = false): void {
  const g = collisionGuard;
  if (!g.enabled || w <= 0 || h <= 0) return;
  if (x > 1920 || y > 1080 || x + w < 0 || y + h < 0) return;
  const entry = { id, x, y, w, h, screen };
  if (!screen) g.content.push({ id, x, y, w, h });
  g.texts.push(entry);
}

/** Register the caption pill's rect (called by drawCaptions itself). */
export function registerPill(x: number, y: number, w: number, h: number): void {
  const g = collisionGuard;
  if (!g.enabled) return;
  g.pill = { x, y, w, h };
}

/** PANEL-10 (guard v2): register a piece of UNMOVING furniture (screen space,
 * painted outside the camera transform — e.g. the channel watermark). The
 * exact camera never applies to it; content rects are checked against it
 * after their own camera transform, exactly like the pill. */
export function registerFixed(id: string, x: number, y: number, w: number, h: number): void {
  const g = collisionGuard;
  if (!g.enabled || w <= 0 || h <= 0) return;
  g.fixed.push({ id, x, y, w, h });
}

const CAMERA_ENVELOPE = 20; // director camera: ±22px drift × ≤1.052 scale ≈ 20px
const MIN_DEPTH = 10; // shallower overlaps = camera-worst-case, not shipped
/** PANEL-10: content must stay this far inside the 1920×1080 frame after
 *  its camera transform. Hero pushes reach 1.092×: a shadow at x=1895
 *  lands at 960+935×1.092+22 ≈ 2004 — 84px past the edge. */
const EDGE_PAD = 10;

/** Compute (and stash) all violations for the current frame:
 *  pill + fixed-furniture overlaps, and frame-edge crossings. */
export function collectViolations(): CollisionViolation[] {
  const g = collisionGuard;
  if (!g.enabled) return [];
  type Ob = GuardRect & { id: string; kind: 'pill' | 'fixed' };
  const obstacles: Ob[] = [];
  if (g.pill && !g.overlay) obstacles.push(g.pill as Ob);
  for (const f of g.fixed) obstacles.push({ ...f, kind: 'fixed' } as Ob);

  const cam = g.camera;
  const out: CollisionViolation[] = [];

  if (obstacles.length || cam) {
  for (const r0 of g.content) {
    let r = r0;
    if (cam) {
      const x2 = (r0.x - 960) * cam.scale + 960 + cam.dx;
      const y2 = (r0.y - 540) * cam.scale + 540 + cam.dy;
      r = { id: r0.id, x: x2, y: y2, w: r0.w * cam.scale, h: r0.h * cam.scale } as typeof r0;
    }
    // obstacle overlaps — pill in exact mode gets a 4px AA epsilon (envelope
    // mode: the ±20px worst-case camera); fixed furniture never moves, so
    // exact mode adds nothing and envelope mode uses the camera term.
    // v10: an obstacle never collides with ITSELF — the source tag is
    // registered as both fixed furniture and reading text, and its own two
    // rects are coincident by design.
    for (const ob of obstacles) {
      if (ob.id === r0.id) continue;
      const eps = cam ? (ob.kind === 'pill' ? 4 : 0) : CAMERA_ENVELOPE;
      const p = {
        x: ob.x - eps,
        y: ob.y - eps,
        w: ob.w + eps * 2,
        h: ob.h + eps * 2,
      };
      const ox = Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x);
      const oy = Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y);
      if (ox > 0 && oy > 0 && Math.min(ox, oy) >= MIN_DEPTH) {
        // only flag content whose overlap area is meaningful
        if (ox * oy >= 400) {
          out.push({
            frame: g.frame,
            id: r.id,
            rect: { x: r.x, y: r.y, w: r.w, h: r.h },
            pill: p,
            depth: Math.round(Math.min(ox, oy)),
            kind: ob.kind,
          });
        }
      }
    }
    // PANEL-10: frame-edge crossing under the exact camera (design grid is
    // 1920×1080; x only — y-overflow at the bottom is already covered by the
    // pill band, and the top band's only furniture is the watermark, which
    // is registered as fixed furniture above). QA-SWEEP: noEdge rects
    // (scrolling scenery) are exempt — they cross the edge by design.
    // PLAYBOOK D3: a stickman feet-band whose anchor sits OFF the design
    // grid entirely (x < 0 or x > 1920) is a figure MID-ENTRANCE — walking
    // in from off-frame is staging, not a crop (the sweep's @88s class:
    // stickman@-29,682, 242px "violation" on a figure arriving from the
    // left). Exempt while the anchor is off-grid; the moment he plants a
    // foot inside the frame the rule resumes.
    if (cam && !r0.noEdge && !(r0.id.startsWith('stickman@') && (r0.x < 0 || r0.x + r0.w > 1920))) {
      const overL = EDGE_PAD - r.x;
      const overR = r.x + r.w - (1920 - EDGE_PAD);
      // 100-JUDGE AUDIT ROUND-2 (PANEL ACCEPTANCE — THE HEAD CROP): the
      // x-only rule is why the editorial host shipped decapitated for nine
      // audit rounds — the hostBody envelope crossed the TOP edge (head
      // clipped at scarf level, probe: topmost ink at y=0 on 5/5 host
      // beats) and every sweep stayed green. TOP is now part of the same
      // rule for HOST bands (cls 'host') — the character must never crop.
      // (Scene cards under a max hero punch graze the top by ≤14px across
      // 8 of 965 frames — a certified camera language, not a framing
      // defect; they stay governed by the x rules.)
      const overT = r0.cls === 'host' ? EDGE_PAD - r.y : 0;
      const depth = Math.max(overL, overR, overT);
      if (depth >= MIN_DEPTH) {
        out.push({
          frame: g.frame,
          id: r.id,
          rect: { x: r.x, y: r.y, w: r.w, h: r.h },
          pill: { x: overL >= Math.max(overR, overT) ? 0 : 1920, y: overT > Math.max(overL, overR) ? 0 : r.y, w: 0, h: 0 },
          depth: Math.round(depth),
          kind: 'edge',
        });
      }
    }
  }
  }
  g.violations = out;

  // ── v10.1 (panel 11 re-review): SIDE-HOST vs CONTENT. The statCards host
  // plated the third stat card's number + badge and the aiDatacenter host
  // stood inside the scrolling rack field (rack side-faces read as "a
  // detached arm", the scarf knot as "floating") — host-vs-content, a class
  // invisible to every check above. hostSmall / the walk host register a
  // FULL-BODY envelope (cls 'host'); every other registered rect is content.
  // Both classes ride the scene camera, so scene-space comparison is exact
  // at any camera position. Thresholds: ≥12px depth, ≥900px² — generous
  // enough to ignore a fingertip graze, strict enough to catch any body
  // plating a card, chart or dot field.
  const hosts = g.content.filter((r) => r.cls === 'host');
  for (const hst of hosts) {
    for (const c of g.content) {
      if (c.cls === 'host') continue;
      // CONTACT VERBS: the hand rect ('contact') and any object the scene
      // declared via declareHostContact() are the DESIGNED touch — skipped
      // here only. (The hand rect still asserts against pill/fixed/edge
      // through the obstacle loop above; the object keeps every other
      // content check.)
      if (c.cls === 'contact' || g.contactIds.has(c.id)) continue;
      // v10.1: the SAME figure's feet+shadow band (registered by
      // drawStickmanV2) sits inside its full-body envelope by construction —
      // same stickman, not a defect. Skip fully-contained stickman bands.
      // PANEL-12: +1px epsilon — with the parallax shift the envelope
      // coordinates pick up sub-pixel float noise, and the exact-equality
      // containment check started flagging a figure against its own feet
      // band (ULP-level false positive, verified on the c3-twin climber).
      // PLAYBOOK D3 (report §8.3): a hostBody figure's feet band now
      // registers with cls 'host' itself, so ANY band sharing the anchor
      // cell with a host envelope is exempt by construction (the 163
      // self-flag sweep violations died here). Same-cell = same figure:
      // the @x,y suffix is the shared ground anchor.
      if (
        c.id.startsWith('stickman@') &&
        (c.id === `stickman@${hst.id.split('@')[1]}` ||
          (hst.x - 1 <= c.x && c.x + c.w <= hst.x + hst.w + 1 &&
           hst.y - 1 <= c.y && c.y + c.h <= hst.y + hst.h + 1))
      ) continue;
      const ox = Math.min(hst.x + hst.w, c.x + c.w) - Math.max(hst.x, c.x);
      const oy = Math.min(hst.y + hst.h, c.y + c.h) - Math.max(hst.y, c.y);
      if (ox >= 12 && oy >= 12 && ox * oy >= 900) {
        out.push({
          frame: g.frame,
          id: `${hst.id}⇄${c.id}`,
          rect: { x: hst.x, y: hst.y, w: hst.w, h: hst.h },
          pill: { x: c.x, y: c.y, w: c.w, h: c.h },
          depth: Math.round(Math.min(ox, oy)),
          kind: 'host',
        });
      }
    }
  }

  // ── v10 (PANEL-11): reading-text vs reading-text. The dotGrid badge sat
  // ON the scene title and the gasPump caption crossed the source tag —
  // both content-vs-content, both invisible to the obstacle checks above.
  // Same thresholds (≥10px depth, ≥400px² area). Camera-exact for rects
  // that ride the camera; screen-space text (source tags) compares
  // untransformed — that is where it actually paints. n² over a per-frame
  // text set of ~6–14 — trivial at harness time.
  const texts = g.texts;
  const toScreen = (r0: GuardRect & { screen?: boolean }): GuardRect =>
    cam && !r0.screen
      ? {
          x: (r0.x - 960) * cam.scale + 960 + cam.dx,
          y: (r0.y - 540) * cam.scale + 540 + cam.dy,
          w: r0.w * cam.scale,
          h: r0.h * cam.scale,
        }
      : { x: r0.x, y: r0.y, w: r0.w, h: r0.h };
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      // same call-site family never self-collides (wrapped rows etc.)
      if (a.id.split(':')[0] === b.id.split(':')[0]) continue;
      const ra = toScreen(a);
      const rb = toScreen(b);
      const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
      const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
      if (ox > 0 && oy > 0 && Math.min(ox, oy) >= MIN_DEPTH && ox * oy >= 400) {
        out.push({
          frame: g.frame,
          id: a.id,
          rect: { x: ra.x, y: ra.y, w: ra.w, h: ra.h },
          pill: { x: rb.x, y: rb.y, w: rb.w, h: rb.h },
          depth: Math.round(Math.min(ox, oy)),
          kind: 'text',
        });
      }
    }
  }

  return out;
}
