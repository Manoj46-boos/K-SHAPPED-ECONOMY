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
 *  3. After a frame is drawn, collectViolations() reports every content rect
 *     that intersects the pill (with a camera envelope: the director's camera
 *     can translate content up to ~±20px and scale up to 1.052, so the pill
 *     is expanded by a 20px envelope before comparing; overlaps shallower
 *     than 10px are ignored as camera-worst-case noise, not shipped defects).
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
  pill: GuardRect; // the pill rect, camera-envelope expanded
  depth: number; // overlap depth in px (max of x/y penetration)
}

interface State {
  enabled: boolean;
  frame: string;
  content: Array<GuardRect & { id: string }>;
  pill: GuardRect | null;
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

const CAMERA_ENVELOPE = 20; // director camera: ±22px drift × ≤1.052 scale ≈ 20px
const MIN_DEPTH = 10; // shallower overlaps = camera-worst-case, not shipped

/** Compute (and stash) all content∩pill violations for the current frame. */
export function collectViolations(): CollisionViolation[] {
  const g = collisionGuard;
  if (!g.enabled) return [];
  if (!g.pill || g.overlay) return [];
  // P1-2: exact camera mode — transform each content rect by the frame's
  // actual camera (scale about the 1920×1080 centre + translate) and compare
  // against the pill as-drawn (screen space) with a tiny 4px epsilon for
  // AA edges. Envelope mode (no camera published — Shorts, probes) keeps
  // the v9 ±20px worst-case expansion.
  const cam = g.camera;
  const p = cam
    ? { x: g.pill.x - 4, y: g.pill.y - 4, w: g.pill.w + 8, h: g.pill.h + 8 }
    : {
        x: g.pill.x - CAMERA_ENVELOPE,
        y: g.pill.y - CAMERA_ENVELOPE,
        w: g.pill.w + CAMERA_ENVELOPE * 2,
        h: g.pill.h + CAMERA_ENVELOPE * 2,
      };
  const out: CollisionViolation[] = [];
  for (const r0 of g.content) {
    let r = r0;
    if (cam) {
      const x2 = (r0.x - 960) * cam.scale + 960 + cam.dx;
      const y2 = (r0.y - 540) * cam.scale + 540 + cam.dy;
      r = { id: r0.id, x: x2, y: y2, w: r0.w * cam.scale, h: r0.h * cam.scale };
    }
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
        });
      }
    }
  }
  g.violations = out;
  return out;
}
