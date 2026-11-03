/**
 * The score, as DATA — single source of truth for the three bed renderers
 * (audit P2-1): the deterministic DSP fallback in audio.ts, the MIDI
 * exporter (midi-export.ts), and the offline soundfont bed render
 * (sf2.ts + scripts/render-bed.ts).
 *
 * v6 (audit P2-1): the exact musical content of the v5 DSP score — same
 * chords, same arpeggio rolls, same rng call order — but expressed as
 * ScoreNote[] so the same notes can be played by real GeneralUser GS
 * instruments instead of sine tables. "Same notes, real instruments."
 *
 * Pure data + pure functions. No browser APIs, no audio buffers — runs
 * identically in the studio page, the render harness, and node scripts.
 */

import { seededRandom } from './easing';

export const SR_BGM = 24000;
export const BPM = 92;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const LOOP_BARS = 4;
export const LOOP_DUR = BAR * LOOP_BARS; // ≈ 10.435 s
export const LOOP_LEN = Math.round(LOOP_DUR * SR_BGM);

// ── Note vocabulary ──────────────────────────────────────────────────────────

const NOTE_VALUES: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

/** 'C3' → MIDI 48 (C4 = 60). Unknown names fall back to 60. */
export function midiOf(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d)$/);
  if (!m) return 60;
  return NOTE_VALUES[m[1]] + (Number(m[2]) + 1) * 12;
}

export const CHORDS: Record<string, { root: string; notes: string[] }> = {
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

export type Mood = 'sparse' | 'bright' | 'reflective' | 'curious' | 'lift' | 'resolve';

export const PROGRESSIONS: Record<Mood, string[]> = {
  sparse: ['Cmaj9', 'G6', 'Am7', 'Fmaj9'],
  bright: ['C', 'GonB', 'Am7', 'F'],
  reflective: ['Am7', 'Fmaj9', 'Cmaj9', 'G6'],
  curious: ['Dm7', 'G7', 'Cmaj9', 'Cmaj9'],
  lift: ['F', 'G6', 'Am7', 'C'],
  resolve: ['F', 'G6', 'Cmaj9', 'Cmaj9'],
};

/** All distinct moods used by the chapter map (bed render covers these). */
export const MOODS: Mood[] = ['sparse', 'bright', 'reflective', 'curious', 'lift', 'resolve'];

// v2 (PATCH 8): remapped for the 9-chapter edit. Order: ch1 sparse, ch3
// bright, ch4 reflective, ch5 curious, ch6 lift, ch7 reflective, ch8
// curious, ch9 lift, ch10 resolve.
export const CHAPTER_MOODS: Mood[] = [
  'sparse', 'bright', 'reflective', 'curious', 'lift', 'reflective', 'curious', 'lift', 'resolve',
];

export function levelFor(mood: Mood, vol: number): number {
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

// ── The score ────────────────────────────────────────────────────────────────

export type VoiceName = 'pad' | 'piano' | 'bass' | 'shaker' | 'kick';

/**
 * One played note. `vel`/`pan` carry the v5 DSP score's exact values (the
 * DSP fallback renders them 1:1); `midiVelocityFor()` maps them to musical
 * MIDI velocities for the soundfont/MIDI renderers.
 */
export interface ScoreNote {
  voice: VoiceName;
  midi: number;
  startSec: number;
  durSec: number;
  vel: number;
  pan: number;
}

/**
 * General MIDI mapping for the soundfont render (audit P2-1: "same notes,
 * real instruments"): felt-piano arpeggio → Acoustic Grand, warm pad →
 * String Ensemble, synth bass → Fingered Electric Bass, DSP shaker/kick →
 * the GM drum kit (bank 128). The engine's own K-motif chimes and whooshes
 * are NOT part of this map — they stay hand-drawn DSP on top of the bed.
 */
export const GM_MAP: Record<VoiceName, { bank: number; program: number; drum: boolean }> = {
  pad:   { bank: 0,   program: 48, drum: false }, // String Ensemble 1
  piano: { bank: 0,   program: 0,  drum: false }, // Acoustic Grand
  bass:  { bank: 0,   program: 33, drum: false }, // Electric Bass (finger)
  shaker:{ bank: 128, program: 0,  drum: true  }, // GM kit · closed hi-hat (key 42)
  kick:  { bank: 128, program: 0,  drum: true  }, // GM kit · bass drum 1 (key 36)
};

/** Percussion keys for the drum voices (ignored for melodic voices). */
export const DRUM_KEYS: Record<'shaker' | 'kick', number> = {
  shaker: 42, // Closed Hi-Hat
  kick: 36,   // Bass Drum 1
};

/** DSP score velocity → musical MIDI velocity (1..127), per voice. */
export function midiVelocityFor(n: ScoreNote): number {
  let v: number;
  switch (n.voice) {
    case 'pad':    v = 30 + n.vel * 90;  break; // soft string bed
    case 'piano':  v = 40 + n.vel * 260; break; // expressive arpeggio
    case 'bass':   v = 45 + n.vel * 180; break;
    case 'shaker': v = 25 + n.vel * 350; break;
    case 'kick':   v = 50 + n.vel * 200; break;
  }
  return Math.max(1, Math.min(127, Math.round(v)));
}

/**
 * One 4-bar loop of a mood as note events — the exact musical content the
 * v5 DSP bed plays (identical rng consumption order for note choice, so
 * the arpeggios roll identically). Deterministic per (mood, variant).
 */
export function moodScore(mood: Mood, variant: number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  const rng = seededRandom(variant * 977 + mood.length * 131 + 17);
  const prog = PROGRESSIONS[mood];
  const eighth = BEAT * 0.5;

  // the DSP renderer draws its shaker noise from the same seeded stream
  // (2880 draws per 0.12 s hit); consume those draws here in the same
  // order so the arpeggio rolls below see the identical stream state.
  const NOISE_DRAWS_PER_HIT = Math.round(0.12 * SR_BGM);
  const burnShakerNoise = (hits: number) => {
    for (let h = 0; h < hits; h++) for (let i = 0; i < NOISE_DRAWS_PER_HIT; i++) rng();
  };

  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const barT = bar * BAR;
    const chordName = prog[bar % 4];
    const chord = CHORDS[chordName];

    // pad — full bar, every chord tone (relative gains exactly as the v5
    // DSP bed applied them: lv · 0.34)
    chord.notes.forEach((n) => {
      notes.push({ voice: 'pad', midi: midiOf(n), startSec: barT, durSec: BAR * 1.02, vel: 0.34, pan: 0 });
    });
    // bass — the root (lv · 0.42)
    notes.push({ voice: 'bass', midi: midiOf(chord.root), startSec: barT, durSec: BAR * 0.92, vel: 0.42, pan: 0 });

    // drum bed per mood (same hit placement + gains as the DSP score)
    if (mood === 'bright' || mood === 'lift') {
      notes.push({ voice: 'kick', midi: DRUM_KEYS.kick, startSec: barT, durSec: 0.3, vel: 0.4, pan: 0 });
      notes.push({ voice: 'kick', midi: DRUM_KEYS.kick, startSec: barT + BEAT * 2, durSec: 0.3, vel: 0.32, pan: 0 });
      for (let e = 0; e < 8; e++) {
        const accent = e % 2 === 0 ? 0.9 : 0.5;
        notes.push({ voice: 'shaker', midi: DRUM_KEYS.shaker, startSec: barT + e * eighth, durSec: 0.12, vel: 0.34 * accent, pan: 0 });
      }
      burnShakerNoise(8);
    } else if (mood === 'curious') {
      notes.push({ voice: 'shaker', midi: DRUM_KEYS.shaker, startSec: barT + BEAT * 2, durSec: 0.12, vel: 0.26, pan: 0 });
      burnShakerNoise(1);
    }

    // felt-piano arpeggio — the melody of the bed
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
        const vel = 0.42 + rng() * 0.26;
        const pan = (rng() - 0.5) * 1.2;
        // clamp: swing can push a bar-0/step-0 note BEFORE the loop start —
        // a negative start meant the note entered mid-envelope at sample 0
        // with no attack (a click at every loop seam; it survived unnoticed
        // in the v5 DSP bed and the louder piano sample exposed it)
        const startSec = Math.max(0, barT + step * eighth + swing);
        notes.push({ voice: 'piano', midi: midiOf(note), startSec, durSec: 2.1, vel, pan });
      }
    }
  }

  // All velocities were recorded explicitly at push time (the exact v5
  // relative gains) — scaledScore applies the mood/volume level.
  return notes;
}

/** Absolute DSP velocities for a mood loop at a given mix volume. */
export function scaledScore(mood: Mood, variant: number, vol: number): ScoreNote[] {
  const lv = levelFor(mood, vol);
  return moodScore(mood, variant).map((n) => ({ ...n, vel: n.vel * lv }));
}
