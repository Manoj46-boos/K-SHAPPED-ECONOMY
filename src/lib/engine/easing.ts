/** Animation math: easing, interpolation, springs, seeded randomness, noise. */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  b === a ? 0 : clamp((v - a) / (b - a), 0, 1);

export const clamp01 = (v: number): number => clamp(v, 0, 1);

/**
 * Deterministic LCG stream (v6, audit P2-1): moved here from audio.ts so the
 * score module and the DSP bed share one canonical seeded generator.
 */
export function seededRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 42;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normalized progress of `t` inside [start, end]. */
export const rng01 = (t: number, start: number, end: number): number =>
  end <= start ? 1 : clamp01((t - start) / (end - start));

// ── Easing ───────────────────────────────────────────────────────────────────
export const easeLinear = (t: number): number => t;
export const easeInQuad = (t: number): number => t * t;
export const easeOutQuad = (t: number): number => t * (2 - t);
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => {
  const f = 1 - t;
  return 1 - f * f * f;
};
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuart = (t: number): number => {
  const f = 1 - t;
  return 1 - f * f * f * f;
};
export const easeInOutQuart = (t: number): number =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const f = 1 - t;
  return 1 + c3 * f * f * f + c1 * f * f;
};
export const easeOutElastic = (t: number): number => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const easeOutExpo = (t: number): number =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/** Smooth window that rises 0→1 over [a,b], holds, falls over [c,d]. */
export function window4(t: number, a: number, b: number, c: number, d: number): number {
  if (t < a || t > d) return 0;
  if (t >= b && t <= c) return 1;
  if (t < b) return easeInOutSine(clamp01((t - a) / Math.max(1, b - a)));
  return 1 - easeInOutSine(clamp01((t - c) / Math.max(1, d - c)));
}

/**
 * PANEL-12 / P1-2 (report §13.2) — the closed-form analytic spring.
 *
 * Under-damped spring step from `from` to `to` over tMs, with zero state:
 * a pure function of its arguments, so scrub-determinism is preserved
 * EXACTLY (the constraint that rules the whole engine). One term buys the
 * three things pose transitions were missing — anticipation (the slow
 * wind-up start), overshoot past the target, and the settle — without an
 * iterative integrator that would break frame-accurate scrubbing.
 *
 * stiffness ~170 / damping ~21 is a "confident presenter" tune: a fast
 * settle (~600ms) with a small (~4%) overshoot. Raising damping kills the
 * overshoot; lowering stiffness reads as underwater.
 */
export function springTo(
  from: number,
  to: number,
  tMs: number,
  stiffness = 170,
  damping = 21
): number {
  const w0 = Math.sqrt(stiffness); // rad/s
  const zeta = damping / (2 * w0);
  const t = tMs / 1000;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    return (
      to +
      (from - to) *
        decay *
        (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    );
  }
  const decay = Math.exp(-w0 * t);
  return to + (from - to) * (1 + w0 * t) * decay;
}

/** Staggered index reveal helper: returns 0..1 for item i entering at time t. */
export function stagger(
  t: number,
  i: number,
  per = 90,
  dur = 520,
  start = 0,
  fn: (x: number) => number = easeOutCubic
): number {
  return fn(clamp01((t - (start + i * per)) / dur));
}

// ── Deterministic pseudo-random (same frame → same visuals when scrubbing) ────
export function hash01(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  x -= Math.floor(x);
  return x;
}

export function hashRange(n: number, min: number, max: number): number {
  return min + hash01(n) * (max - min);
}

export function hashPick<T>(n: number, arr: T[]): T {
  return arr[Math.floor(hash01(n) * arr.length) % arr.length];
}

/** Smooth value noise in 1D — organic drift without a noise library. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash01(i), hash01(i + 1), u) * 2 - 1;
}

/** Layered drift: sum of sines at incommensurate frequencies. */
export function drift(t: number, seed = 0): number {
  return (
    Math.sin(t * 0.9 + seed * 12.9) * 0.5 +
    Math.sin(t * 0.31 + seed * 7.1 + 1.7) * 0.3 +
    Math.sin(t * 1.7 + seed * 3.3 + 4.2) * 0.2
  );
}

// ── Number formatting ────────────────────────────────────────────────────────
export function fmtCountUp(
  target: number | string,
  p: number,
  opts: { decimals?: number; prefix?: string; suffix?: string } = {}
): string {
  if (typeof target === 'string') return target;
  const { decimals = 0, prefix = '', suffix = '' } = opts;
  const eased = easeOutCubic(clamp01(p));
  const v = target * eased;
  const formatted = v.toFixed(decimals);
  return `${prefix}${formatted}${suffix}`;
}

/** Formats seconds as m:ss or h:mm:ss (for chapter timestamps). */
export function fmtTimestamp(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Split a beat's VO into sentence-level chunks for TTS. */
const ABBREV = [
  'U.S.', 'Mr.', 'Ms.', 'Dr.', 'St.', 'vs.', 'e.g.', 'i.e.', 'a.m.', 'p.m.',
  'No.', 'Co.', 'Inc.', 'Ltd.', 'J.P.',
];

export function splitSentences(text: string): string[] {
  let guarded = text;
  for (let i = 0; i < ABBREV.length; i++) {
    guarded = guarded.split(ABBREV[i]).join(`⟦A${i}⟧`);
  }
  const parts = guarded
    .split(/(?<=[.!?])\s+(?=[“"A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const restored = parts.map((p) => {
    let r = p;
    for (let i = 0; i < ABBREV.length; i++) {
      r = r.split(`⟦A${i}⟧`).join(ABBREV[i]);
    }
    return r;
  });
  // merge tiny fragments (like “Right.”) with neighbors < 4 words
  const out: string[] = [];
  for (const s of restored) {
    if (out.length > 0 && s.split(/\s+/).length < 3 && out[out.length - 1].length < 90) {
      out[out.length - 1] += ' ' + s;
    } else {
      out.push(s);
    }
  }
  return out.length ? out : [text];
}
