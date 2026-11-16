/**
 * scale-law.ts — PHASE 1 (100-Judge audit report §5.1 / Table 6, "Scale law
 * + tier gate"): the three-tier staging law for every human figure in the
 * film, enforced by the offline harness (tools/render-check.mjs).
 *
 * THE LAW (report §5.1): a premium frame never parks the presenter as a
 * sticker beside the data. Every figure draws in exactly one tier and the
 * scene must declare a CONTACT VERB for the tiers where the human is a
 * participant in the scene's story:
 *
 *   subject     (Tier A) — the scene is ABOUT the figure: dedicated
 *               editorial/reaction stagings. Height ≥ 8% of frame height,
 *               contact verb REQUIRED (the figure acts on an object).
 *   participant (Tier B) — the figure shares the frame with a hero object:
 *               he touches, points at, or operates it. Height ≥ 5%,
 *               contact verb REQUIRED.
 *   marker      (Tier C) — background population: visually distinct from
 *               the host (variant/flip), height ≥ 2.5%, no contact verb
 *               required (they are set dressing, not presenters).
 *
 * Scenes register every figure they draw through registerFigure(); the
 * harness asserts the registry after rendering the evidence frames and
 * FAILS the build on any below-floor height or a participant/subject
 * staging with no declared contact verb. Scrub-safe: registration is a
 * side effect of drawing, reset per frame by the director's guard reset.
 */

export type ScaleTier = 'subject' | 'participant' | 'marker';

export interface TierRule {
  /** minimum figure height as % of frame height */
  minPct: number;
  /** soft ceiling above which a staging must be its own dedicated shot */
  maxPct: number;
  /** whether the staging must declare a contact verb */
  contactVerb: boolean;
}

export const HOST_SCALE_TIERS: Record<ScaleTier, TierRule> = {
  subject: { minPct: 8, maxPct: 60, contactVerb: true },
  participant: { minPct: 5, maxPct: 100, contactVerb: true },
  marker: { minPct: 2.5, maxPct: 100, contactVerb: false },
};

/**
 * The rig's natural height in LOCAL units: legs (U_LEG 54 + L_LEG 50) +
 * torso 78 + neck-to-crown (head centre 40 above the torso top + head
 * ry 42 + chin 4). Kept in one place so scenes convert rig → px honestly.
 */
export const STICK_BASE_HEIGHT = 258;

/** figure height in px at rig r (face-scale only enlarges features, not the body). */
export function figureHeightPx(rig: number): number {
  return STICK_BASE_HEIGHT * rig;
}

/**
 * HOST_SCALE RULE (report Table 6, row 1 — the scenes-host constant): the
 * rig range a tier implies at a given frame height. Scenes derive their
 * staging scales from this instead of hand-tuned literals, so a figure can
 * never silently drop under its tier floor when the ground line or frame
 * size moves.
 */
export function hostScaleRig(tier: ScaleTier, frameH: number): { min: number; max: number } {
  const rule = HOST_SCALE_TIERS[tier];
  return {
    min: (rule.minPct / 100) * frameH / STICK_BASE_HEIGHT,
    max: (rule.maxPct / 100) * frameH / STICK_BASE_HEIGHT,
  };
}

export interface FigureReg {
  sceneKey: string;
  label: string;
  tier: ScaleTier;
  heightPx: number;
  pctOfH: number;
  contact: boolean;
}

const REGISTRY: FigureReg[] = [];

/** Called by scene drawers for EVERY human figure they draw this frame. */
export function registerFigure(
  sceneKey: string, label: string, tier: ScaleTier,
  rig: number, frameH: number, contact: boolean
): void {
  REGISTRY.push({
    sceneKey,
    label,
    tier,
    heightPx: Math.round(figureHeightPx(rig)),
    pctOfH: Math.round((figureHeightPx(rig) / frameH) * 1000) / 10,
    contact,
  });
}

/** The director/guard reset — clear per frame so stale entries never assert. */
export function resetFigureRegistry(): void {
  REGISTRY.length = 0;
}

export function figureRegistry(): FigureReg[] {
  return REGISTRY.slice();
}

export interface ScaleViolation {
  sceneKey: string;
  label: string;
  reason: string;
}

/** Assert the frame's registry against the tier law. */
export function scaleLawViolations(): ScaleViolation[] {
  const out: ScaleViolation[] = [];
  for (const f of REGISTRY) {
    const rule = HOST_SCALE_TIERS[f.tier];
    if (f.pctOfH < rule.minPct) {
      out.push({
        sceneKey: f.sceneKey, label: f.label,
        reason: `${f.tier} figure at ${f.pctOfH}% of frame height (floor ${rule.minPct}%) — raise the staging rig`,
      });
    }
    if (rule.contactVerb && !f.contact) {
      out.push({
        sceneKey: f.sceneKey, label: f.label,
        reason: `${f.tier} figure declares NO contact verb — a premium ${f.tier} points at, holds, or operates its object`,
      });
    }
  }
  return out;
}
