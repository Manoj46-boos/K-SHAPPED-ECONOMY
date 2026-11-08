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
   *  'fixed:<id>' (unmoving furniture, e.g. the watermark), or 'edge'. */
  kind: 'pill' | 'fixed' | 'edge';
}

interface State {
  enabled: boolean;
  frame: string;
  content: Array<GuardRect & { id: string }>;
  pill: GuardRect | null;
  /** PANEL-10 (guard v2): fixed furniture (watermark band) in screen space. */
  fixed: Array<GuardRect & { id: string }>;
  /** chapter cards / overlays intentionally cover the frame — suppress */
  overlay: boolean;
  violations: CollisionViolation[];
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
  pill: null,
  fixed: [],
  overlay: false,
  violations: [],
  camera: null,
};

/** Reset per-frame state. Call at the top of drawFrame when enabled. */
export function resetGuard(frame: string): void {
  if (!collisionGuard.enabled) return;
  collisionGuard.frame = frame;
  collisionGuard.content = [];
  collisionGuard.pill = null;
  collisionGuard.fixed = [];
  collisionGuard.overlay = false;
  collisionGuard.violations = [];
  collisionGuard.camera = null;
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

/** Register a painted content rect (design-grid px). No-op when disabled. */
export function registerRect(id: string, x: number, y: number, w: number, h: number): void {
  const g = collisionGuard;
  if (!g.enabled || w <= 0 || h <= 0) return;
  // Ignore degenerate far-offscreen rects (camera bleed fills etc.)
  if (x > 1920 || y > 1080 || x + w < 0 || y + h < 0) return;
  g.content.push({ id, x, y, w, h });
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
  if (!obstacles.length && !g.camera) return [];

  const cam = g.camera;
  const out: CollisionViolation[] = [];

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
    for (const ob of obstacles) {
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
    // is registered as fixed furniture above).
    if (cam) {
      const overL = EDGE_PAD - r.x;
      const overR = r.x + r.w - (1920 - EDGE_PAD);
      const depth = Math.max(overL, overR);
      if (depth >= MIN_DEPTH) {
        out.push({
          frame: g.frame,
          id: r.id,
          rect: { x: r.x, y: r.y, w: r.w, h: r.h },
          pill: { x: overL > overR ? 0 : 1920, y: 0, w: 0, h: 0 },
          depth: Math.round(depth),
          kind: 'edge',
        });
      }
    }
  }
  g.violations = out;
  return out;
}
