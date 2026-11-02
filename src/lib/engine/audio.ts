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
 */

import { Timeline } from './timeline';
import { hash01 } from './easing';

const SR_OUT = 48000;
const SR_BGM = 24000;
const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOP_BARS = 4;
const LOOP_DUR = BAR * LOOP_BARS; // ≈ 10.435 s
const LOOP_LEN = Math.round(LOOP_DUR * SR_BGM);

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

function seededRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 42;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Note vocabulary ──────────────────────────────────────────────────────────
const NOTE_FREQS: Record<string, number> = {
  C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63, F: 349.23,
  'F#': 369.99, G: 392.0, 'G#': 415.3, A: 440.0, 'A#': 466.16, B: 493.88,
};

function freqOf(note: string): number {
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return 440;
  return (NOTE_FREQS[m[1]] / 261.63) * 261.63 * Math.pow(2, Number(m[2]) - 4);
}

const CHORDS: Record<string, { root: string; notes: string[] }> = {
  C: { root: 'C3', notes: ['C3', 'G3', 'E4', 'B4'] },
  Cmaj9: { root: 'C2', notes: ['C3', 'G3', 'E4', 'D5'] },
  GonB: { root: 'B2', notes: ['B2', 'D3', 'G3', 'B4'] },
  Am7: { root: 'A2', notes: ['A2', 'E3', 'G3', 'C4'] },
  F: { root: 'F2', notes: ['F2', 'C3', 'A3', 'E4'] },
  Fmaj9: { root: 'F2', notes: ['F2', 'C3', 'A3', 'G4'] },
  G6: { root: 'G2', notes: ['G2', 'D3', 'B3', 'E4'] },
  Dm7: { root: 'D2', notes: ['D3', 'A3', 'C4', 'F4'] },
  G7: { root: 'G2', notes: ['G2', 'F3', 'B3', 'D4'] },
};

type Mood = 'sparse' | 'bright' | 'reflective' | 'curious' | 'lift' | 'resolve';

const PROGRESSIONS: Record<Mood, string[]> = {
  sparse: ['Cmaj9', 'G6', 'Am7', 'Fmaj9'],
  bright: ['C', 'GonB', 'Am7', 'F'],
  reflective: ['Am7', 'Fmaj9', 'Cmaj9', 'G6'],
  curious: ['Dm7', 'G7', 'Cmaj9', 'Cmaj9'],
  lift: ['F', 'G6', 'Am7', 'C'],
  resolve: ['F', 'G6', 'Cmaj9', 'Cmaj9'],
};

const CHAPTER_MOODS: Mood[] = [
  'sparse', 'bright', 'bright', 'reflective', 'curious', 'lift', 'reflective', 'curious', 'lift', 'resolve',
];

function levelFor(mood: Mood, vol: number): number {
  const base = 0.5 * vol;
  switch (mood) {
    case 'sparse': return base * 0.6;
    case 'reflective': return base * 0.85;
    case 'curious': return base * 0.9;
    case 'bright': return base;
    case 'lift': return base * 1.1;
    case 'resolve': return base * 0.95;
  }
}

// ── Voice renderers (write into 24k stereo loop buffers) ─────────────────────
interface Loop {
  L: Float32Array;
  R: Float32Array;
}

function renderPad(loop: Loop, note: string, startSec: number, durSec: number, vel: number): void {
  const f = freqOf(note);
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

function renderPiano(loop: Loop, note: string, startSec: number, vel: number, pan: number): void {
  const f = freqOf(note);
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

function renderBass(loop: Loop, note: string, startSec: number, durSec: number, vel: number): void {
  const f = freqOf(note);
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

/** Renders one 4-bar loop of a mood (deterministic per variant). */
function renderMoodLoop(mood: Mood, variant: number, vol: number): Loop {
  const loop: Loop = { L: new Float32Array(LOOP_LEN), R: new Float32Array(LOOP_LEN) };
  const rng = seededRandom(variant * 977 + mood.length * 131 + 17);
  const lv = levelFor(mood, vol);
  const prog = PROGRESSIONS[mood];
  const eighth = BEAT * 0.5;

  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const barT = bar * BAR;
    const chordName = prog[bar % 4];
    const chord = CHORDS[chordName];
    // pad — full bar
    chord.notes.forEach((n) => renderPad(loop, n, barT, BAR * 1.02, lv * 0.34));
    // bass
    renderBass(loop, chord.root, barT, BAR * 0.92, lv * 0.42);
    // heartbeat + shaker for brighter moods
    if (mood === 'bright' || mood === 'lift') {
      renderKick(loop, barT, lv * 0.4);
      renderKick(loop, barT + BEAT * 2, lv * 0.32);
      for (let e = 0; e < 8; e++) {
        const accent = e % 2 === 0 ? 0.9 : 0.5;
        renderShaker(loop, barT + e * eighth, lv * 0.34 * accent, rng);
      }
    } else if (mood === 'curious') {
      renderShaker(loop, barT + BEAT * 2, lv * 0.26, rng);
    }
    // felt-piano arpeggio
    const arpNotes = [...chord.notes.slice(1), chord.notes[1]];
    const density = mood === 'sparse' ? 0.4 : mood === 'reflective' ? 0.62 : 0.85;
    for (let step = 0; step < 8; step++) {
      if (rng() < density) {
        const ni = (step + bar + variant) % arpNotes.length;
        let note = arpNotes[ni];
        if (rng() < 0.15) {
          note = note.replace(/(\d)$/, (d) => String(Number(d) + 1));
        }
        const swing = (rng() - 0.5) * 0.03;
        renderPiano(
          loop,
          note,
          barT + step * eighth + swing,
          lv * (0.42 + rng() * 0.26),
          (rng() - 0.5) * 1.2
        );
      }
    }
  }
  return loop;
}

// ── Transient events (rendered at 48k directly into the mix) ────────────────
function addKMotif(L: Float32Array, R: Float32Array, startSec: number, gain: number): void {
  const notes: [string, number, number, number][] = [
    // [note, offsetSec, vel, pan]
    ['E4', 0, 0.32, -0.3],
    ['C5', 0.16, 0.28, 0.3],
    ['A3', 0.16, 0.2, 0.05],
    ['E5', 0.36, 0.22, 0.15],
  ];
  for (const [note, off, vel, pan] of notes) {
    const f = freqOf(note);
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
  // soft pad bed under the motif
  for (const n of ['E3', 'B3']) {
    const f = freqOf(n);
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

// ── The mixer ────────────────────────────────────────────────────────────────
export interface MixInput {
  timeline: Timeline;
  voBuffers: Map<string, AudioBuffer>;
  bgmVolume: number;
  voVolume: number;
  onProgress?: (frac: number, label: string) => void;
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

  // ── 1. BGM loops per mood (2 variants each, tiled) ──
  onProgress?.(0.05, 'composing the score');
  const moods = [...new Set(CHAPTER_MOODS)];
  const loops = new Map<string, Loop>();
  for (const mood of moods) {
    for (let v = 0; v < 2; v++) {
      loops.set(`${mood}:${v}`, renderMoodLoop(mood, v, bgmVolume));
    }
  }

  // ── 2. VO placement (with resampling) + ducking envelope ──
  onProgress?.(0.12, 'placing the voiceover');
  const voEvents: { buf: AudioBuffer; startSec: number }[] = [];
  for (const beat of tl.beats) {
    for (const s of beat.sentences) {
      const buf = voBuffers.get(s.lineId);
      if (buf) voEvents.push({ buf, startSec: s.startMs / 1000 });
    }
  }
  // add VO into the mix
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
      const v = (a + (b - a) * frac) * voVolume;
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
  const ducked = base * 0.3;
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
  {
    let cur = base;
    let mi = 0;
    const attackStep = grid / (0.09 * SR_OUT);
    const releaseStep = grid / (0.2 * SR_OUT);
    for (let c = 0; c < ctl.length; c++) {
      const t = (c * grid) / SR_OUT;
      let target = base;
      while (mi < merged.length && t >= merged[mi].e) mi++;
      if (mi < merged.length && t >= merged[mi].s - 0.09) target = ducked;
      if (target < cur) cur = Math.max(target, cur - attackStep);
      else cur = Math.min(target, cur + releaseStep);
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
          variant = 1 - variant;
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

  // ── 5. gentle soft-limit for a clean master ──
  onProgress?.(0.92, 'mastering');
  for (let i = 0; i < totalFrames; i++) {
    let v = L[i];
    if (v > 0.82 || v < -0.82) {
      const sign = v < 0 ? -1 : 1;
      const m = Math.abs(v);
      L[i] = sign * (0.82 + 0.18 * Math.tanh((m - 0.82) / 0.18));
    }
    v = R[i];
    if (v > 0.82 || v < -0.82) {
      const sign = v < 0 ? -1 : 1;
      const m = Math.abs(v);
      R[i] = sign * (0.82 + 0.18 * Math.tanh((m - 0.82) / 0.18));
    }
  }

  onProgress?.(1, 'mix complete');
  return mix;
}

// ── shared audio context (48k preferred for decoding) ────────────────────────
function getSharedAudioContext(): AudioContext {
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

export { LOOP_DUR, hash01 };
