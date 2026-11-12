/**
 * The score & the mix — pure JavaScript DSP (no WebAudio graph).
 *
 * Why pure JS: OfflineAudioContext rendering is throttled to a crawl in
 * background tabs and varies wildly across machines. This engine is fully
 * synchronous, deterministic, and fast — table-based oscillators, seeded
 * noise, per-mood loop rendering with tiling, one-pass mixing with ducking.
 *
 * Musical design: a light 92 BPM corporate underscore. Pads + felt piano +
 * soft bass + shaker + heartbeat, chord progressions per chapter mood,
 * a signature "K motif" chime on every chapter card, auto-ducking under
 * the voiceover, and a gentle final fade.
 *
 * v6 (audit P2-1): the underscore is now SCORE-AS-DATA (score.ts — single
 * source of truth) and the bed renders through real instruments when the
 * offline soundfont render has been run: public/beds/sf2-<mood>-<v>.wav
 * (GeneralUser GS via sf2.ts, level-matched to the DSP bed it replaces).
 * Missing beds fall back to this file's DSP voices — same notes, either
 * way. The hand-drawn K-motif chimes, risers, whooshes and dings stay DSP
 * on top of the bed, per the audit: "keep your own K-motif chimes and
 * whooshes."
 */

import { Timeline } from './timeline';
import { hash01, seededRandom } from './easing';
import {
  Mood, CHAPTER_MOODS, scaledScore, ScoreNote,
  themeScore, themeCoda, THEME_DUR,
  SR_BGM, BPM, LOOP_DUR, LOOP_LEN,
} from './score';
import { loadBedLoops, BedLoop } from './beds';

export { SR_BGM, BPM, LOOP_DUR, hash01 };

/** The mix volume the offline bed render was level-matched at. */
export const BED_REF_VOL = 0.55;

const SR_OUT = 48000;

// ── Sine table (fast, deterministic) ─────────────────────────────────────────
const SINE_N = 8192;
const SINE = new Float32Array(SINE_N);
for (let i = 0; i < SINE_N; i++) SINE[i] = Math.sin((i / SINE_N) * Math.PI * 2);

function sine(ph: number): number {
  const x = ph * SINE_N;
  const i = x | 0;
  const f = x - i;
  const a = SINE[i & (SINE_N - 1)];
  const b = SINE[(i + 1) & (SINE_N - 1)];
  return a + (b - a) * f;
}

// ── Note vocabulary (v6: midi-number driven — see score.ts) ──────────────

function freqFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Voice renderers (write into 24k stereo loop buffers) ─────────────────────
interface Loop {
  L: Float32Array;
  R: Float32Array;
}

function renderPad(loop: Loop, midi: number, startSec: number, durSec: number, vel: number): void {
  const f = freqFromMidi(midi);
  const n0 = Math.round(startSec * SR_BGM);
  const n1 = Math.min(LOOP_LEN, n0 + Math.round(durSec * SR_BGM));
  const attack = Math.min(0.5, durSec * 0.3);
  const release = Math.min(0.6, durSec * 0.3);
  const incr = f / SR_BGM;
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_BGM;
    let env = 1;
    if (t < attack) env = t / attack;
    else if (t > durSec - release) env = Math.max(0, (durSec - t) / release);
    let p2 = ph * 2;
    if (p2 >= 1) p2 -= 1;
    const s = (sine(ph) + 0.16 * sine(p2)) * env * vel;
    loop.L[i] += s;
    loop.R[i] += s;
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function renderPiano(loop: Loop, midi: number, startSec: number, vel: number, pan: number): void {
  const f = freqFromMidi(midi);
  const durSec = 2.1;
  const n0 = Math.round(startSec * SR_BGM);
  const n1 = Math.min(LOOP_LEN, n0 + Math.round(durSec * SR_BGM));
  const incr = f / SR_BGM;
  const gl = vel * (1 - Math.max(0, pan));
  const gr = vel * (1 - Math.max(0, -pan));
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_BGM;
    const env = Math.exp(-t * 2.1);
    let p2 = ph * 2;
    if (p2 >= 1) p2 -= 1;
    const s = (sine(ph) + 0.22 * sine(p2) * Math.exp(-t * 4.2)) * env;
    loop.L[i] += s * gl;
    loop.R[i] += s * gr;
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function renderBass(loop: Loop, midi: number, startSec: number, durSec: number, vel: number): void {
  const f = freqFromMidi(midi);
  const n0 = Math.round(startSec * SR_BGM);
  const n1 = Math.min(LOOP_LEN, n0 + Math.round(durSec * SR_BGM));
  const incr = f / SR_BGM;
  const attack = 0.04;
  const release = 0.2;
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_BGM;
    let env = 1;
    if (t < attack) env = t / attack;
    else if (t > durSec - release) env = Math.max(0, (durSec - t) / release);
    const s = sine(ph) * env * vel;
    loop.L[i] += s;
    loop.R[i] += s;
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function renderShaker(loop: Loop, startSec: number, vel: number, rng: () => number): void {
  const n0 = Math.round(startSec * SR_BGM);
  const durSamples = Math.round(0.12 * SR_BGM);
  const n1 = Math.min(LOOP_LEN, n0 + durSamples);
  let last = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_BGM;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 42);
    const x = rng() * 2 - 1;
    const hp = x - 0.9 * last;
    last = x;
    const s = hp * env * vel * 0.6;
    loop.L[i] += s;
    loop.R[i] += s * 0.9;
  }
}

function renderKick(loop: Loop, startSec: number, vel: number): void {
  const n0 = Math.round(startSec * SR_BGM);
  const durSamples = Math.round(0.3 * SR_BGM);
  const n1 = Math.min(LOOP_LEN, n0 + durSamples);
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_BGM;
    const f = 82 * Math.exp(-t * 9) + 44;
    ph += f / SR_BGM;
    if (ph >= 1) ph -= 1;
    const env = Math.exp(-t * 10);
    const s = sine(ph) * env * vel;
    loop.L[i] += s;
    loop.R[i] += s;
  }
}

/**
 * v6 (audit P2-1) — the DSP fallback bed: renders the score's notes with
 * the same table-based voices the v5 bed used. Identical music (the score
 * module preserves the v5 rng call order for note choice); the shaker's
 * noise realization is now per-hit seeded, which is inaudible — the bed
 * that SHIPS is the soundfont render in public/beds/ anyway.
 *
 * Exported for scripts/render-bed.mjs, which level-matches the soundfont
 * render against this loop's RMS — timbre upgrade, zero mix regression.
 */
export function renderMoodLoopDsp(mood: Mood, variant: number, vol: number): Loop {
  const loop: Loop = { L: new Float32Array(LOOP_LEN), R: new Float32Array(LOOP_LEN) };
  const notes = scaledScore(mood, variant, vol);
  let hit = 0;
  for (const n of notes) {
    switch (n.voice) {
      case 'pad':
        renderPad(loop, n.midi, n.startSec, n.durSec, n.vel);
        break;
      case 'bass':
        renderBass(loop, n.midi, n.startSec, n.durSec, n.vel);
        break;
      case 'piano':
        renderPiano(loop, n.midi, n.startSec, n.vel, n.pan);
        break;
      case 'shaker':
        renderShaker(loop, n.startSec, n.vel, seededRandom(Math.round(n.startSec * 1000) + variant * 7919 + (hit++) * 131));
        break;
      case 'kick':
        renderKick(loop, n.startSec, n.vel);
        break;
    }
  }
  return loop;
}

// ── Transient events (rendered at 48k directly into the mix) ────────────────
function addKMotif(L: Float32Array, R: Float32Array, startSec: number, gain: number): void {
  // [midi, offsetSec, vel, pan] — v6: midi numbers (E4=64 · C5=72 · A3=57 · E5=76)
  const notes: [number, number, number, number][] = [
    [64, 0, 0.32, -0.3],
    [72, 0.16, 0.28, 0.3],
    [57, 0.16, 0.2, 0.05],
    [76, 0.36, 0.22, 0.15],
  ];
  for (const [midi, off, vel, pan] of notes) {
    const f = freqFromMidi(midi);
    const n0 = Math.round((startSec + off) * SR_OUT);
    const dur = Math.round(1.8 * SR_OUT);
    const incr = f / SR_OUT;
    const gl = vel * gain * (1 - Math.max(0, pan));
    const gr = vel * gain * (1 - Math.max(0, -pan));
    let ph = 0;
    for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
      const t = (i - n0) / SR_OUT;
      const env = Math.exp(-t * 2.4);
      let p2 = ph * 2;
      if (p2 >= 1) p2 -= 1;
      const s = (sine(ph) + 0.2 * sine(p2)) * env;
      L[i] += s * gl;
      R[i] += s * gr;
      ph += incr;
      if (ph >= 1) ph -= 1;
    }
  }
  // soft pad bed under the motif (E3=52 · B3=59)
  for (const midi of [52, 59]) {
    const f = freqFromMidi(midi);
    const n0 = Math.round(startSec * SR_OUT);
    const dur = Math.round(1.6 * SR_OUT);
    const incr = f / SR_OUT;
    let ph = 0;
    for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
      const t = (i - n0) / SR_OUT;
      const env = Math.min(1, t / 0.4) * Math.max(0, Math.min(1, (1.6 - t) / 0.5)) * 0.06 * gain;
      const s = sine(ph) * env;
      L[i] += s;
      R[i] += s;
      ph += incr;
      if (ph >= 1) ph -= 1;
    }
  }
}

function addRiser(L: Float32Array, R: Float32Array, startSec: number, durSec: number, gain: number): void {
  const rng = seededRandom(Math.round(startSec * 1000) + 7);
  const n0 = Math.round(startSec * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(durSec * SR_OUT));
  let lp = 0;
  let hp = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    const p = t / durSec;
    const env = Math.min(1, p * 3) * Math.pow(Math.max(0, 1 - Math.pow(p, 6)), 1.4) * gain * 0.05;
    const x = rng() * 2 - 1;
    // sweeping bandpass feel: LP cutoff rises with p
    const cutoff = 0.02 + 0.5 * p * p;
    lp += cutoff * (x - lp);
    hp = x - lp;
    const s = (hp * 0.5 + lp * 0.5) * env;
    L[i] += s;
    R[i] += s * 0.96;
  }
}

// ── v2 transition & data-moment SFX (PATCH 7) ───────────────────────────────

/**
 * Airy whoosh on hard cuts / scene changes — band-passed noise with a
 * rise-fast / fall-slow envelope. Reads as "movement into the next scene";
 * the v1 mix was silent across every cut, which is why it felt like hold
 * music. Deterministic xorshift noise, zero allocations.
 * P1-3 (report): VELOCITY-CURVED — every cut used to get the same whoosh,
 * so 41 cuts meant 41 identical gestures. `vel` (0..1) now scales the gain,
 * the length (0.4s minor → 0.65s chapter) and how far the filter opens, so
 * a chapter change lands as a page-turn and a same-type scene change
 * whispers past. The mix stops drawing attention to its own machinery.
 */
export function addWhoosh(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number,
  vel = 1
): void {
  const dur = 0.4 + 0.25 * vel;
  const n0 = Math.round(startSec * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(dur * SR_OUT));
  let seed = 12345;
  const rng = () => {
    // xorshift, deterministic
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0, lp2 = 0;
  const velGain = gain * (0.42 + 0.58 * vel);
  const openAmt = 0.35 + 0.35 * vel;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    const p = t / dur;
    // rise fast, fall slow — reads as "movement into the next scene"
    const env = Math.min(1, p * 4) * Math.pow(Math.max(0, 1 - Math.pow(p, 2.2)), 1.6) * velGain * 0.09;
    const x = rng();
    const cutoff = 0.04 + openAmt * p * p; // opens further on big cuts
    lp += cutoff * (x - lp);
    lp2 += cutoff * 0.6 * (lp - lp2);
    const s = (lp - lp2) * env; // band-pass feel
    L[i] += s;
    R[i] += s * 0.92;
  }
}

// ── P1-3 (report): the SHOW THEME — rendered into the master mix ──────────
// The theme is a foreground melodic layer over the bed (like the K-motif
// chimes: hand-drawn DSP, not part of the GM bed map). These are the bed's
// exact voices re-parameterised for the 48 kHz master bus and absolute
// start times.
function themePiano(L: Float32Array, R: Float32Array, n: ScoreNote, baseSec: number, gain: number): void {
  const f = freqFromMidi(n.midi);
  const durSec = Math.max(0.4, Math.min(4, n.durSec * 1.15));
  const n0 = Math.round((baseSec + n.startSec) * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(durSec * SR_OUT));
  const incr = f / SR_OUT;
  const gl = n.vel * gain * (1 - Math.max(0, n.pan));
  const gr = n.vel * gain * (1 - Math.max(0, -n.pan));
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    const env = Math.exp(-t * 1.7);
    let p2 = ph * 2;
    if (p2 >= 1) p2 -= 1;
    // P1-3 mix round: 2nd partial 0.22 → 0.15 (≈ −3 dB at the octave) —
    // the panel's dialogue-priority insurance: the theme's harmonic stack
    // was hot at 1-2kHz, the voice band's core. Melody stays forward;
    // narration stays on top.
    const s = (sine(ph) + 0.15 * sine(p2) * Math.exp(-t * 4.2)) * env;
    if (i >= 0) { L[i] += s * gl; R[i] += s * gr; }
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function themePad(L: Float32Array, R: Float32Array, n: ScoreNote, baseSec: number, gain: number): void {
  const f = freqFromMidi(n.midi);
  const n0 = Math.round((baseSec + n.startSec) * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(n.durSec * SR_OUT));
  const attack = Math.min(0.5, n.durSec * 0.3);
  const release = Math.min(0.6, n.durSec * 0.3);
  const incr = f / SR_OUT;
  const g = n.vel * gain;
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    let env = 1;
    if (t < attack) env = t / attack;
    else if (t > n.durSec - release) env = Math.max(0, (n.durSec - t) / release);
    let p2 = ph * 2;
    if (p2 >= 1) p2 -= 1;
    const s = (sine(ph) + 0.16 * sine(p2)) * env * g;
    if (i >= 0) { L[i] += s; R[i] += s; }
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function themeBass(L: Float32Array, R: Float32Array, n: ScoreNote, baseSec: number, gain: number): void {
  const f = freqFromMidi(n.midi);
  const n0 = Math.round((baseSec + n.startSec) * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(n.durSec * SR_OUT));
  const incr = f / SR_OUT;
  const g = n.vel * gain;
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    let env = 1;
    if (t < 0.04) env = t / 0.04;
    else if (t > n.durSec - 0.2) env = Math.max(0, (n.durSec - t) / 0.2);
    const s = sine(ph) * env * g;
    if (i >= 0) { L[i] += s; R[i] += s; }
    ph += incr;
    if (ph >= 1) ph -= 1;
  }
}

function themeShaker(L: Float32Array, R: Float32Array, n: ScoreNote, baseSec: number, gain: number): void {
  const rng = seededRandom(Math.round((baseSec + n.startSec) * 1000) + 31);
  const n0 = Math.round((baseSec + n.startSec) * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(0.12 * SR_OUT));
  let last = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 42);
    const x = rng() * 2 - 1;
    const hp = x - 0.9 * last;
    last = x;
    const s = hp * env * n.vel * gain * 0.6;
    if (i >= 0) { L[i] += s; R[i] += s * 0.9; }
  }
}

/** Render one theme statement into the master mix at an absolute time. */
function renderTheme(
  L: Float32Array, R: Float32Array,
  notes: ScoreNote[], baseSec: number, gain: number
): void {
  if (baseSec < 0) return;
  for (const n of notes) {
    switch (n.voice) {
      case 'piano': themePiano(L, R, n, baseSec, gain); break;
      case 'pad': themePad(L, R, n, baseSec, gain); break;
      case 'bass': themeBass(L, R, n, baseSec, gain); break;
      case 'shaker': themeShaker(L, R, n, baseSec, gain); break;
    }
  }
}

/**
 * Soft confirmation ding on count-up completions (statCards settle, gauge
 * lands, bars reach their peak). Marimba-ish: sine + wooden 4th partial,
 * fast decay. E6 sits above the voice band without piercing.
 */
export function addDing(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number,
  freq = 1318.5 // E6
): void {
  const n0 = Math.round(startSec * SR_OUT);
  const dur = Math.round(0.7 * SR_OUT);
  for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
    const t = (i - n0) / SR_OUT;
    const env = Math.exp(-t * 6.5) * 0.5 * gain * 0.28;
    const s =
      Math.sin(2 * Math.PI * freq * t) * env +
      Math.sin(2 * Math.PI * freq * 2.76 * t) * env * 0.18; // wooden partial
    L[i] += s * 0.9;
    R[i] += s;
  }
}

/**
 * AUDIT-ROUND-2 (fix 30 — THE SFX LAYER): the Kurzgesagt rule — every
 * animation has a distinct sound. The mix already had whooshes (cuts),
 * dings (count-ups), K-motif chimes (payoffs) and risers (chapters); the
 * missing event classes ship now, all hand-drawn DSP (free, no samples,
 * deterministic — the same grammar as everything else in this file):
 *   • addKStrike   — the K's formation/tear: a struck-metal thud +
 *                    inharmonic chime partials
 *   • addCoin       — a coin landing: two quick bright metallic pings
 *   • addCardPop   — a stat card arriving: a paper pop (band-passed
 *                    noise burst) + a soft wood tick
 *   • addWalkPlant — a footfall: a low, soft thump (very quiet — the
 *                    walk needs rhythm, not percussion)
 *   • addSlam      — bigText/stampCard slams: the whoosh's heavier
 *                    sibling, landing in a thud
 * One sound per event class; −2 dB under the voice; every animation that
 * moves now SOUNDS like it moved.
 */

/** The K strike — struck metal: a low thud body + three inharmonic chime
 *  partials with fast decays (the brand object landing as MASS). */
export function addKStrike(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number
): void {
  const n0 = Math.round(startSec * SR_OUT);
  const dur = Math.round(1.1 * SR_OUT);
  const parts = [523.3, 1244.5, 2093.0];   // inharmonic stack — metal, not melody
  const w = [1, 0.42, 0.22];
  for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
    const t = (i - n0) / SR_OUT;
    let s = 0;
    for (let p = 0; p < parts.length; p++) {
      s += Math.sin(2 * Math.PI * parts[p] * t) * Math.exp(-t * (5 + p * 4)) * w[p];
    }
    // the thud body — 80Hz fundamental, gone in ~120ms
    s += Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 18) * 1.4;
    const env = 0.34 * gain;
    L[i] += s * env * 0.95;
    R[i] += s * env;
  }
}

/** The coin land — two quick metallic pings, slightly detuned (a coin
 *  settling on a table reads as TWO hits, not one). */
export function addCoin(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number
): void {
  const ping = (t0: number, f: number, amp: number): void => {
    const n0 = Math.round((startSec + t0) * SR_OUT);
    const dur = Math.round(0.45 * SR_OUT);
    for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
      const t = (i - n0) / SR_OUT;
      const env = Math.exp(-t * 9) * amp * gain * 0.16;
      const s =
        Math.sin(2 * Math.PI * f * t) * env +
        Math.sin(2 * Math.PI * f * 1.34 * t) * env * 0.35;
      L[i] += s * 0.85;
      R[i] += s;
    }
  };
  ping(0, 2093, 1);
  ping(0.075, 2210, 0.7);
}

/** The card pop — a paper-thin noise burst with a rising filter + a soft
 *  wooden tick on the settle (the stat cards ARRIVING, not just appearing). */
export function addCardPop(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number
): void {
  const n0 = Math.round(startSec * SR_OUT);
  const dur = Math.round(0.34 * SR_OUT);
  let seed = 9137;
  const rng = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0;
  for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
    const t = (i - n0) / SR_OUT;
    const p = t / 0.34;
    const env = Math.pow(1 - p, 2) * gain * 0.14;
    lp += (0.10 + 0.5 * p) * (rng() - lp);
    const s = lp * env;
    L[i] += s * 0.9;
    R[i] += s;
  }
  // the settle tick
  const t0 = Math.round((startSec + 0.26) * SR_OUT);
  const td = Math.round(0.12 * SR_OUT);
  for (let i = t0; i < Math.min(L.length, t0 + td); i++) {
    const t = (i - t0) / SR_OUT;
    const env = Math.exp(-t * 22) * gain * 0.10;
    const s = Math.sin(2 * Math.PI * 740 * t) * env;
    L[i] += s * 0.9;
    R[i] += s;
  }
}

/** The walk plant — a footfall: a low soft thump with a 60ms body. Quiet
 *  by design (the walk needs rhythm, never percussion). */
export function addWalkPlant(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number
): void {
  const n0 = Math.round(startSec * SR_OUT);
  const dur = Math.round(0.09 * SR_OUT);
  for (let i = n0; i < Math.min(L.length, n0 + dur); i++) {
    const t = (i - n0) / SR_OUT;
    const env = Math.sin(Math.min(1, t / 0.09) * Math.PI) * gain * 0.07;
    // a 95Hz thump sweeping down — flesh on floor, not a drum
    const f = 95 - 38 * (t / 0.09);
    const s = Math.sin(2 * Math.PI * f * t) * env;
    L[i] += s * 0.9;
    R[i] += s;
  }
}

/** The slam — bigText / stampCard landings: a descending band-passed
 *  whoosh that LANDS in a thud (the statement frames get the film's one
 *  heavyweight gesture). */
export function addSlam(
  L: Float32Array, R: Float32Array,
  startSec: number, gain: number
): void {
  const dur = 0.5;
  const n0 = Math.round(startSec * SR_OUT);
  const n1 = Math.min(L.length, n0 + Math.round(dur * SR_OUT));
  let seed = 4242;
  const rng = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0, lp2 = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR_OUT;
    const p = t / dur;
    // the sweep DESCENDS (closing, not opening) and the tail thuds
    const env = Math.pow(1 - p, 1.5) * gain * 0.16;
    const cutoff = 0.5 - 0.34 * p;
    lp += cutoff * (rng() - lp);
    lp2 += cutoff * 0.5 * (lp - lp2);
    const s = (lp - lp2) * env;
    L[i] += s * 0.92;
    R[i] += s;
  }
  // the landing thud at the sweep's end
  const t0 = Math.round((startSec + dur * 0.8) * SR_OUT);
  const td = Math.round(0.14 * SR_OUT);
  for (let i = t0; i < Math.min(L.length, t0 + td); i++) {
    const t = (i - t0) / SR_OUT;
    const env = Math.exp(-t * 14) * gain * 0.13;
    const s = Math.sin(2 * Math.PI * 70 * t) * env;
    L[i] += s * 0.95;
    R[i] += s;
  }
}

/**
 * v2 bus glue (PATCH 7): gentle 2.5:1 compression over −12 dBFS with 5ms
 * attack / 120ms release, then tanh soft-limit at the same true-peak
 * ceiling. Replaces the v1 peak-only soft-limit: ~3 dB louder perceived
 * loudness, and pads stop hiding under the VO. Control rate 2ms.
 */
export function masterGlue(L: Float32Array, R: Float32Array): void {
  const grid = 96; // 2ms control rate
  let env = 0;
  for (let i = 0; i < L.length; i += grid) {
    let peak = 0;
    const end = Math.min(L.length, i + grid);
    for (let j = i; j < end; j++) {
      peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
    }
    // gentle 2.5:1 over -12 dBFS, 5ms attack / 120ms release
    const over = Math.max(0, peak - 0.25);
    const target = over > 0 ? 0.25 + over / 2.5 : peak;
    const ratio = peak > 0 ? target / peak : 1;
    if (ratio < env) env = ratio + (env - ratio) * 0.55;      // release
    else env = ratio + (env - ratio) * 0.85;                   // attack
    const g = env * 1.35; // makeup gain
    for (let j = i; j < end; j++) {
      L[j] = Math.tanh(L[j] * g) * 0.92;
      R[j] = Math.tanh(R[j] * g) * 0.92;
    }
  }
}

// ── Yield helper (unthrottled in background tabs, unlike setTimeout) ─────────
const yieldChannel: MessageChannel | null =
  typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => {
    if (yieldChannel) {
      yieldChannel.port1.onmessage = () => resolve();
      yieldChannel.port2.postMessage(0);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// ── v3 (panel P0-5): circular Schroeder reverb for the BGM loops ──────────
// The v2 score was 100% dry — it read as a demo synth. Loops tile seamlessly,
// so the reverb must wrap: two passes per buffer feed the tail back into the
// head (circular ⇒ still seamless when tiled). ~4ms per loop, mix-time only.
export function reverbLoopCircular(loop: Loop, mix = 0.2): void {
  const N = loop.L.length;
  const combs = [713, 891, 1027, 1137]; // ~30–47 ms at 24 kHz (coprime-ish)
  const aps = [120, 41];                // ~5 ms / ~1.7 ms allpasses
  const COMB_FB = 0.82;
  const AP_G = 0.7;

  for (const CH of [loop.L, loop.R]) {
    const combBuf = combs.map((d) => new Float32Array(d));
    const combIdx = new Array(combs.length).fill(0);
    const apBuf = aps.map((d) => new Float32Array(d));
    const apIdx = new Array(aps.length).fill(0);

    // two passes ⇒ the reverb tail wraps into the loop head, seamless
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const dry = CH[i];
        let wet = 0;

        // parallel combs
        for (let c = 0; c < combs.length; c++) {
          const d = combs[c];
          const buf = combBuf[c];
          const v = buf[combIdx[c]];
          buf[combIdx[c]] = dry + v * COMB_FB;
          combIdx[c] = (combIdx[c] + 1) % d;
          wet += v;
        }
        wet /= combs.length;

        // series allpasses (standard form: y = -g*in + delayed; buf = in + g*y)
        for (let a = 0; a < aps.length; a++) {
          const d = aps[a];
          const buf = apBuf[a];
          const x = wet;
          const delayed = buf[apIdx[a]];
          const inNew = x + AP_G * delayed;
          buf[apIdx[a]] = inNew;
          wet = -AP_G * inNew + delayed;
          apIdx[a] = (apIdx[a] + 1) % d;
        }

        CH[i] = dry * (1 - mix) + wet * mix * 1.7;
      }
    }
  }
}

/**
 * v3 (panel P0-5) — gentle presence lift for the VO (one-pole shelf).
 * A subtle +2–3 dB lift above ~2 kHz takes the boxiness off Edge TTS
 * without touching the music bed. One multiply per sample.
 * v10 (panel AUDIO-1): two-stage chain — first a ~65 Hz rumble cut (one-pole
 * low-pass subtracted; kills the Edge MP3's room-tone floor and any DC
 * drift without touching the voice band), THEN the presence lift, raised
 * +3.0→+3.2 dB. Narration sits forward; the bed stays put.
 */
export function makeVoShelf(): (x: number) => number {
  const amt = 0.32; // +3.2 dB presence — the 96 kbps Edge MP3 is dull above 2 kHz
  let hp = 0;
  let lp = 0; // rumble state (~65 Hz one-pole at 48 kHz)
  return (x: number) => {
    lp += 0.0085 * (x - lp);
    const xv = x - lp; // remove rumble / DC
    hp += 0.24 * (xv - hp); // one-pole high-pass state
    return xv + amt * (xv - hp); // add back a slice of the treble difference
  };
}

/**
 * v3 (panel P0-5) — master loudness normalisation to ≈ -14 LUFS.
 * Simplified BS.1770: a mild high-pass weighting + sparse deterministic RMS,
 * then one clean gain. v4 (audit P0-5): applied AFTER masterGlue() so the
 * measured level is the shipped level. Exact K-weighting is not needed for a
 * narration+bed mix; this lands within ~1 LU and preserves dynamics far
 * better than letting YouTube's normaliser decide.
 */
export function normalizeLufs(
  L: Float32Array,
  R: Float32Array,
  sampleRate: number,
  targetLufs = -14
): number {
  const stride = 977; // deterministic sparse sampling (~1.5% of samples)
  let sum = 0;
  let n = 0;
  let hp = 0;
  for (let i = 0; i < L.length; i += stride) {
    const x = (L[i] + R[i]) * 0.5;
    hp += 0.04 * (x - hp); // ~60 Hz one-pole high-pass (K-weight-ish floor)
    const y = x - hp;
    sum += y * y + x * x * 0.3; // keep music-bed energy in view
    n++;
  }
  void sampleRate;
  const meanSq = sum / Math.max(1, n);
  const lufs = -0.691 + 10 * Math.log10(meanSq + 1e-12);
  const gainDb = Math.max(-12, Math.min(12, targetLufs - lufs)); // sane clamp
  const gain = Math.pow(10, gainDb / 20);
  for (let i = 0; i < L.length; i++) {
    L[i] *= gain;
    R[i] *= gain;
  }
  return gainDb;
}

// ── The mixer ────────────────────────────────────────────────────────────────
export interface MixInput {
  timeline: Timeline;
  voBuffers: Map<string, AudioBuffer>;
  bgmVolume: number;
  voVolume: number;
  onProgress?: (frac: number, label: string) => void;
  /** P1-3: skip the mastering stage (glue + LUFS normalise + peak guard)
   *  and return the raw score mix — used by the A/B evidence harness and the
   *  voice-A/B prep tool, where the VO is absent and delivery-loudness
   *  normalisation would clamp every foreground layer. Default: mastered. */
  master?: boolean;
}

export async function renderMix(input: MixInput): Promise<AudioBuffer> {
  const { timeline: tl, voBuffers, bgmVolume, voVolume, onProgress } = input;
  const totalFrames = Math.ceil((tl.durationMs / 1000) * SR_OUT) + SR_OUT; // +1s tail
  const totalSec = totalFrames / SR_OUT;

  onProgress?.(0.02, 'allocating the master mix');
  const ac = getSharedAudioContext();
  const mix = ac.createBuffer(2, totalFrames, SR_OUT);
  const L = mix.getChannelData(0);
  const R = mix.getChannelData(1);

  // ── 1. BGM loops per mood, tiled ──
  // v3 (panel P0-5): each loop gets a circular Schroeder reverb pass — the
  // score breathes instead of stopping dead (adds ~15-25s to the mix only).
  // v6 (audit P2-1): prefer the offline soundfont render (GeneralUser GS,
  // level-matched); fall back to the DSP voices when the asset is missing.
  onProgress?.(0.05, 'composing the score');
  // PANEL-9 R4 (musical repetition): 2 variants × 10.43 s per mood meant a
  // 20-minute film played the SAME loop ~115 times — each variant ~10
  // plays per chapter. 4 variants per mood = 24 unique loops, ~5 plays per
  // variant per chapter, and the tiler's A/B alternation becomes an A/B/C/D
  // rotation. score.ts is already variant-parameterised and deterministic,
  // so variants 2–3 render automatically (DSP fallback now; run
  // `node scripts/render-bed.mjs` once to regenerate the SF2 beds).
  const moods = [...new Set(CHAPTER_MOODS)];
  const VARIANTS_PER_MOOD = 4;
  const bedNames: string[] = [];
  for (const mood of moods) {
    for (let v = 0; v < VARIANTS_PER_MOOD; v++) bedNames.push(`sf2-${mood}-${v}`);
  }
  const beds = await loadBedLoops(bedNames);
  const bedScale = bgmVolume / BED_REF_VOL; // beds were matched at BED_REF_VOL
  const loops = new Map<string, Loop>();
  for (const mood of moods) {
    for (let v = 0; v < VARIANTS_PER_MOOD; v++) {
      const bed: BedLoop | null = beds?.get(`sf2-${mood}-${v}`) ?? null;
      let lp: Loop;
      if (bed) {
        if (Math.abs(bedScale - 1) < 1e-4) {
          lp = { L: bed.L, R: bed.R };
        } else {
          const L = new Float32Array(bed.L.length);
          const R = new Float32Array(bed.R.length);
          for (let i = 0; i < L.length; i++) { L[i] = bed.L[i] * bedScale; R[i] = bed.R[i] * bedScale; }
          lp = { L, R };
        }
      } else {
        lp = renderMoodLoopDsp(mood, v, bgmVolume);
      }
      reverbLoopCircular(lp, 0.2);
      loops.set(`${mood}:${v}`, lp);
    }
  }
  onProgress?.(0.12, 'placing the voiceover');
  const voEvents: { buf: AudioBuffer; startSec: number }[] = [];
  for (const beat of tl.beats) {
    for (const s of beat.sentences) {
      const buf = voBuffers.get(s.lineId);
      if (buf) voEvents.push({ buf, startSec: s.startMs / 1000 });
    }
  }
  // add VO into the mix — v3 (panel P0-5): each sample passes a gentle
  // presence shelf (+2-3 dB above ~2 kHz) so the narration sits forward
  const voShelf = makeVoShelf();
  for (const ev of voEvents) {
    const src = ev.buf.getChannelData(0);
    const srcRate = ev.buf.sampleRate;
    const srcLen = src.length;
    const n0 = Math.round(ev.startSec * SR_OUT);
    const ratio = srcRate / SR_OUT;
    for (let i = 0; n0 + i < totalFrames && i / SR_OUT < srcLen / srcRate; i++) {
      const srcPos = (i * ratio) | 0;
      const frac = i * ratio - srcPos;
      const a = src[srcPos] ?? 0;
      const b = src[srcPos + 1] ?? a;
      const v = voShelf(a + (b - a) * frac) * voVolume;
      const idx = n0 + i;
      if (idx >= 0) {
        L[idx] += v;
        R[idx] += v;
      }
    }
  }

  // ducking envelope (control grid 5ms, smoothed attack/release)
  onProgress?.(0.3, 'shaping the dynamics');
  const grid = 240; // 48k / 5ms
  const ctl = new Float32Array(Math.ceil(totalFrames / grid) + 2);
  const base = Math.max(0.02, bgmVolume * 0.5);
  const ducked = base * 0.22; // v5: Edge TTS owns the mids — 0.3 let the bed speak over the voice
  // v4 (audit P0-5): the bed LIFTS between sentences (gap level ≈ 1.6× base,
  // capped) so the score audibly returns in pauses instead of idling at the
  // duck floor — “the bed lives between sentences”, per the audit’s mix note.
  const gap = Math.min(1, base * 1.6);
  // mark target duck windows
  const merged: { s: number; e: number }[] = [];
  for (const iv of tl.voIntervals) {
    const s = Math.max(0, iv.start / 1000 - 0.18);
    const e = Math.min(totalSec - 0.05, iv.end / 1000 + 0.32);
    const last = merged[merged.length - 1];
    if (last && s <= last.e + 0.04) last.e = Math.max(last.e, e);
    else merged.push({ s, e });
  }
  // build control curve with ramps (attack 90ms, release 200ms)
  // v8 (panel P0-5): dramatic-silence windows — flagged beats duck the bed
  // to ~4% right before their payoff line. Two windows in the whole film;
  // scarcity is the mechanism. Attack 140ms (fast enough to feel sudden),
  // release 260ms (the slam-back is part of the effect).
  {
    let cur = base;
    let mi = 0;
    const attackStep = grid / (0.09 * SR_OUT);
    const releaseStep = grid / (0.2 * SR_OUT);
    const silAttackStep = grid / (0.14 * SR_OUT);
    const silReleaseStep = grid / (0.26 * SR_OUT);
    const silLevel = Math.max(0.015, base * 0.07);
    for (let c = 0; c < ctl.length; c++) {
      const t = (c * grid) / SR_OUT;
      let target = gap;
      while (mi < merged.length && t >= merged[mi].e) mi++;
      if (mi < merged.length && t >= merged[mi].s - 0.09) target = ducked;
      // silence windows override everything inside them
      for (const sw of tl.silenceWindows ?? []) {
        const s = sw.start / 1000;
        const e = sw.end / 1000;
        if (t >= s - 0.05 && t <= e + 0.12) {
          target = silLevel;
          break;
        }
      }
      const isSil = target === silLevel;
      const down = isSil ? silAttackStep : attackStep;
      const up = isSil ? silReleaseStep : releaseStep;
      if (target < cur) cur = Math.max(target, cur - down);
      else cur = Math.min(target, cur + up);
      ctl[c] = cur;
    }
  }

  // ── 3. tile BGM into the mix with ducking + upsampling 24k→48k ──
  onProgress?.(0.35, 'laying the score under the voice');
  const sections: { start: number; end: number; mood: Mood }[] = [];
  tl.chapters.forEach((c, i) => {
    const nextStart = i + 1 < tl.chapters.length ? tl.chapters[i + 1].startMs / 1000 : totalSec;
    sections.push({ start: c.startMs / 1000, end: nextStart, mood: CHAPTER_MOODS[Math.min(i, CHAPTER_MOODS.length - 1)] });
  });

  const loopLen48 = LOOP_DUR * SR_OUT;
  const CHUNK = 2_000_000;
  for (const sect of sections) {
    const s0 = Math.max(0, Math.round(sect.start * SR_OUT));
    const s1 = Math.min(totalFrames, Math.round(sect.end * SR_OUT));
    if (s1 <= s0) continue;
    let pos48 = 0;
    let variant = 0;
    let loop = loops.get(`${sect.mood}:${variant}`)!;
    for (let i = s0; i < s1; i += CHUNK) {
      const end = Math.min(s1, i + CHUNK);
      for (let j = i; j < end; j++) {
        // 24k source position (linear interp), x2 upsample
        const sPos = pos48 * 0.5;
        const sIdx = sPos | 0;
        const frac = sPos - sIdx;
        const idx2 = sIdx + 1 < LOOP_LEN ? sIdx + 1 : sIdx;
        // ducking envelope
        const cIdx = (j / grid) | 0;
        const cFrac = j / grid - cIdx;
        const duck = ctl[cIdx] + (ctl[cIdx + 1] - ctl[cIdx]) * cFrac;
        // intro fade-in + final fade-out
        const t = j / SR_OUT;
        let tail = 1;
        const fadeStart = totalSec - 4;
        if (t > fadeStart) tail = Math.max(0, 1 - (t - fadeStart) / 4);
        if (t < 2) tail *= 0.35 + 0.65 * (t / 2);
        const g = duck * tail;
        L[j] += (loop.L[sIdx] + (loop.L[idx2] - loop.L[sIdx]) * frac) * g;
        R[j] += (loop.R[sIdx] + (loop.R[idx2] - loop.R[sIdx]) * frac) * g;
        pos48 += 1;
        if (pos48 >= loopLen48) {
          pos48 -= loopLen48;
          // PANEL-9 R4: rotate through however many variants exist (2–4);
          // never index past the last rendered variant (fresh clones before
          // the bed re-render still ship 2).
          const nVariants = [...loops.keys()].filter((k) => k.startsWith(`${sect.mood}:`)).length;
          variant = (variant + 1) % Math.max(2, nVariants);
          loop = loops.get(`${sect.mood}:${variant}`)!;
        }
      }
      onProgress?.(0.35 + 0.45 * (end / totalFrames), 'laying the score under the voice');
      await yieldToUI();
    }
  }

  // ── 4. transient events: chapter risers + K motifs ──
  onProgress?.(0.85, 'the chapter chimes');
  for (const cc of tl.chapterCards) {
    const start = cc.startMs / 1000;
    addRiser(L, R, start, 0.9, bgmVolume * 0.5 + 0.5);
    addKMotif(L, R, start + 0.55, Math.max(0.4, bgmVolume));
  }

  // ── 4b. v2 SFX: whoosh on every hard cut, ding on data landings (PATCH 7) ──
  // P1-3 (report): velocity-curved whooshes — chapter cuts 1.0, scene-TYPE
  // changes 0.72, same-type sceneKey changes 0.48. The curve comes from the
  // timeline itself (chapter cards + the scene types either side of each
  // cut), so it stays correct through any recut.
  const typeAtCut = (tMs: number): string => {
    for (const b of tl.beats) {
      if (tMs >= b.startMs && tMs < b.endMs) return b.beat.scene.type;
    }
    return '';
  };
  for (const cut of tl.cutTimes) {
    let vel = 0.48;
    // a CHAPTER cut is the scene-group start that lands at the END of a
    // chapter card (the card occupies [startMs, startMs+900) and the beat
    // begins at its end) — matching the card's startMs never fires, which
    // silently demoted every chapter whoosh to the 0.72/0.48 tiers (caught
    // while building the tier evidence, round 2)
    const isChapter = tl.chapterCards.some(
      (c) => cut >= c.startMs && cut <= c.endMs + 60
    );
    if (isChapter) vel = 1;
    else {
      // the beat BEFORE the cut (the outgoing scene's type)
      let prevType = '';
      for (const b of tl.beats) {
        if (b.endMs <= cut) prevType = b.beat.scene.type;
        else break;
      }
      if (prevType && typeAtCut(cut) !== prevType) vel = 0.72;
    }
    addWhoosh(L, R, cut / 1000, bgmVolume, vel);
  }
  for (const d of tl.dataDingTimes) {
    addDing(L, R, d / 1000, bgmVolume);
  }

  // ── 4b2. AUDIT-ROUND-2 (fix 30 — THE SFX EVENT LAYER): one sound per
  // event class, all synthesized (free), all deterministic: K strikes on
  // the formation/tear moments, coin lands where money moves, card pops
  // when stat cards arrive, walk plants through the host entrances, slams
  // under the bigText/stampCard hard cuts. The whooshes above carry the
  // cuts themselves; these carry the ANIMATIONS inside them.
  {
    // K strikes — the cold-open tear (5.95s into the c1-k-open group) and
    // the formation landing (grow completes ~2.3s in on c1-k)
    for (const b of tl.beats) {
      if (b.beat.scene.type === 'divergeK') {
        if (b.beat.scene.sceneKey === 'c1-k-open') addKStrike(L, R, (b.startMs + 5950) / 1000, Math.max(0.4, bgmVolume));
        else addKStrike(L, R, (b.startMs + 2300) / 1000, Math.max(0.4, bgmVolume) * 0.8);
      }
    }
    // coin lands — ownerWorker's coins cross the divider; fundSplit's
    // twist wall lands ~2.4s in
    for (const b of tl.beats) {
      if (b.beat.scene.type === 'ownerWorker') {
        addCoin(L, R, (b.startMs + 1500) / 1000, bgmVolume);
        addCoin(L, R, (b.startMs + 2100) / 1000, bgmVolume * 0.7);
      }
      if (b.beat.scene.type === 'fundSplit') {
        addCoin(L, R, (b.startMs + 2400) / 1000, bgmVolume);
      }
    }
    // card pops — every statCards card arrival (300ms + i·550 stagger)
    for (const b of tl.beats) {
      if (b.beat.scene.type === 'statCards') {
        const cards = ((b.beat.scene as any).cards as any[]) ?? [];
        const n = Math.max(1, cards.length);
        for (let i = 0; i < Math.min(3, n); i++) {
          addCardPop(L, R, (b.startMs + 300 + i * 550) / 1000, bgmVolume);
        }
      }
    }
    // walk plants — the host walk-in entrances (4 soft thumps across the
    // 1.6s entrance, the stride's own cadence)
    for (const b of tl.beats) {
      if ((b.beat.scene as any).entrance === 'walk') {
        for (const step of [340, 800, 1250, 1550]) {
          addWalkPlant(L, R, (b.startMs + step) / 1000, bgmVolume);
        }
      }
    }
    // slams — the bigText / stampCard hard cuts (the whoosh whispers past
    // a cut; the SLAM lands the statement)
    for (const cut of tl.cutTimes) {
      const t = typeAtCut(cut);
      if (t === 'bigText' || t === 'stampCard') {
        addSlam(L, R, cut / 1000, bgmVolume);
      }
    }
  }

  // ── 4c. v8 (panel P0-5): the silence SLAM — each dramatic-silence window
  // ends with the signature K-motif chime landing exactly on the payoff
  // word. The motif was previously heard only on chapter cards; the twist
  // beat now gets the brand's own sound at the single most important
  // moment of the film, and the end screen closes on it too.
  for (const sw of tl.silenceWindows ?? []) {
    addKMotif(L, R, sw.end / 1000, Math.max(0.45, bgmVolume * 0.9));
  }
  {
    const endBeat = tl.beats[tl.beats.length - 1];
    if (endBeat?.beat.scene.type === 'endScreen') {
      addKMotif(L, R, endBeat.startMs / 1000 + 0.4, Math.max(0.45, bgmVolume));
    }
  }

  // ── 4d. P1-3 (report): the SHOW THEME — one 8-bar identity, stated three
  // times. Cold open states the A-phrase once the film has faded in; the
  // twist quotes the signature phrase one second after the silence slam (the
  // brand sound under the single most important line of the film); the end
  // screen re-states the A-phrase and resolves it with the coda — the film
  // opens and closes on the same music. Level: a foreground gesture over the
  // ducked bed, never a second bed.
  onProgress?.(0.87, 'the show theme');
  {
    // level calibration: the melody peaks ≈0.11-0.13 — a featured gesture
    // clearly over the ducked bed (≈0.05-0.09 peak) and under the VO, in the
    // same register as the K-motif chime (≈0.14 peak). The first pass ran
    // ×2.7 hotter and peaked 0.98 — drowning, not stating.
    const themeGain = Math.max(0.3, bgmVolume * 0.55);
    // 1) cold open — bars 1-4 at ~2.2s (after the fade-in, under the hook)
    renderTheme(L, R, themeScore(4), 2.2, themeGain * 0.92);
    // 2) the twist — bars 1-2 (the K-motif quote), 1.0s after the ch7
    // silence window's payoff lands. The ch6 paradox window keeps its bare
    // chime: scarcity is the mechanism (the report's own P0-5 note).
    for (const sw of tl.silenceWindows ?? []) {
      let chapter = -1;
      for (const b of tl.beats) {
        if (sw.end >= b.startMs && sw.end < b.endMs) chapter = b.chapter;
      }
      if (chapter === 6) {
        renderTheme(L, R, themeScore(2), sw.end / 1000 + 1.0, themeGain);
      }
    }
    // 3) end screen — bars 1-4, then the resolution coda (held C5/Cmaj9)
    const endBeat = tl.beats[tl.beats.length - 1];
    if (endBeat?.beat.scene.type === 'endScreen') {
      const es = endBeat.startMs / 1000 + 0.6;
      renderTheme(L, R, themeScore(4), es, themeGain * 0.85);
      renderTheme(L, R, themeCoda(), es + 4 * (60 / BPM) * 4, themeGain * 0.85);
    }
    void THEME_DUR;
  }

  // ── 5. v4 master (audit P0-5): bus glue FIRST, then normalise to the
  // delivery target. The v3 order (normalise → glue) let the glue's makeup
  // gain re-change the level after normalisation, so the mix shipped ≈2 LU
  // off target — the platform, not the mix, decided the loudness. Glue first,
  // then measure exactly what ships. A true-peak guard after the gain keeps
  // normalisation from ever pushing samples past digital full scale.
  // P1-3: `master:false` (evidence harness / voice-A/B prep) skips this —
  // the raw score mix is what those tools need to compare.
  if (input.master === false) {
    onProgress?.(1, 'raw score mix (mastering skipped)');
    return mix;
  }
  onProgress?.(0.92, 'mastering');
  masterGlue(L, R);
  const applied = normalizeLufs(L, R, SR_OUT, -14.0);
  onProgress?.(
    0.915,
    `loudness: ${applied >= 0 ? '+' : ''}${applied.toFixed(1)} dB to -14 LUFS`
  );
  {
    let peak = 0;
    for (let i = 0; i < totalFrames; i++) {
      const a = Math.abs(L[i]);
      if (a > peak) peak = a;
      const b = Math.abs(R[i]);
      if (b > peak) peak = b;
    }
    if (peak > 0.985) {
      const g = 0.985 / peak;
      for (let i = 0; i < totalFrames; i++) {
        L[i] *= g;
        R[i] *= g;
      }
    }
  }

  onProgress?.(1, 'mix complete');
  return mix;
}

// ── shared audio context (48k preferred for decoding) ────────────────────────
/** v3 (panel P2-1): exported — the Shorts pipeline reuses this context to
 *  slice the mix buffer into 9:16 windows. */
export function getSharedAudioContext(): AudioContext {
  const w = globalThis as any;
  if (!w.__mixAudioCtx) {
    try {
      w.__mixAudioCtx = new (w.AudioContext || w.webkitAudioContext)({ sampleRate: 48000 });
    } catch {
      w.__mixAudioCtx = new (w.AudioContext || w.webkitAudioContext)();
    }
  }
  return w.__mixAudioCtx;
}

// (LOOP_DUR & friends re-exported at the top — see score.ts)
