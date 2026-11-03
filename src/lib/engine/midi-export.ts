/**
 * MIDI export — the score, as Standard MIDI Files (audit P2-1).
 *
 * "Export the loop notes to MIDI" so the bed can be rendered through real
 * instruments: this writer emits one .mid per mood-variant loop with GM
 * program mapping (strings/piano/bass + drum kit), ready for FluidSynth,
 * any DAW, or any General MIDI player. The engine's own sf2.ts renders the
 * same note stream without leaving the codebase; the MIDI files are the
 * interoperable, human-editable route to the same sound.
 *
 * Pure TypeScript, deterministic bytes — same score → identical file.
 */

import {
  Mood, ScoreNote, MOODS, moodScore, scaledScore,
  GM_MAP, DRUM_KEYS, midiVelocityFor, BPM,
} from './score';

const PPQ = 480;
const TICKS_PER_SEC = (BPM / 60) * PPQ;

// ── SMF writing helpers ──────────────────────────────────────────────────────

class ByteWriter {
  private buf: number[] = [];

  u8(v: number): void { this.buf.push(v & 0xff); }
  u16(v: number): void { this.buf.push((v >> 8) & 0xff, v & 0xff); }
  u24(v: number): void { this.buf.push((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff); }
  u32(v: number): void { this.buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  bytes(arr: number[] | Uint8Array): void { for (const b of arr) this.buf.push(b & 0xff); }
  ascii(s: string): void { for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i) & 0xff); }

  /** MIDI variable-length quantity (1..4 bytes, 7 bits each). */
  vlq(value: number): void {
    let v = Math.max(0, Math.round(value));
    const buf: number[] = [v & 0x7f];
    v >>= 7;
    while (v > 0) {
      buf.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    this.bytes(buf);
  }

  toUint8Array(): Uint8Array { return new Uint8Array(this.buf); }
}

interface MidiEvent { tick: number; data: number[]; order: number }

function buildTrack(events: MidiEvent[]): Uint8Array {
  const w = new ByteWriter();
  // sort by tick; offs before ons at the same tick (order field)
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  for (const e of events) {
    w.vlq(e.tick - last);
    w.bytes(e.data);
    last = e.tick;
  }
  // end of track
  w.vlq(0);
  w.bytes([0xff, 0x2f, 0x00]);
  return w.toUint8Array();
}

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.ascii(id);
  w.u32(payload.length);
  w.bytes(payload);
  return w.toUint8Array();
}

// ── The exporter ─────────────────────────────────────────────────────────────

export interface SmfOptions {
  /** mix volume the DSP bed would play at (velocity mapping) */
  vol?: number;
  /** track name written into the meta track */
  name?: string;
}

/**
 * One mood-variant loop as a Standard MIDI File (Type 1, 92 BPM, PPQ 480).
 * Melodic voices get their GM programs on channels 0-2; drums land on
 * channel 9 (the GM percussion channel) with the kit's note keys.
 *
 * `notes` must be ABSOLUTE-scale (from scaledScore(vol)) so velocity
 * mapping sees the levels the bed actually plays at.
 */
export function scoreToSmf(notes: ScoreNote[], opts: SmfOptions = {}): Uint8Array {
  // meta track: tempo + time signature + name
  const metaEvents: MidiEvent[] = [];
  const usPerQuarter = Math.round(60_000_000 / BPM);
  metaEvents.push({ tick: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff], order: 0 });
  metaEvents.push({ tick: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8], order: 1 }); // 4/4
  if (opts.name) {
    const nameBytes: number[] = [];
    for (let i = 0; i < opts.name.length && i < 60; i++) nameBytes.push(opts.name.charCodeAt(i) & 0x7f);
    metaEvents.push({ tick: 0, data: [0xff, 0x03, nameBytes.length, ...nameBytes], order: 2 });
  }
  const metaTrack = buildTrack(metaEvents);

  // melodic track: program changes + notes, channels per voice
  const CHANNELS: Record<string, number> = { pad: 0, piano: 1, bass: 2 };
  const melodic: MidiEvent[] = [];
  for (const [voice, ch] of Object.entries(CHANNELS)) {
    const prog = GM_MAP[voice as keyof typeof GM_MAP].program;
    melodic.push({ tick: 0, data: [0xc0 | ch, prog], order: 3 });
  }
  for (const n of notes) {
    if (n.voice === 'shaker' || n.voice === 'kick') continue;
    const ch = CHANNELS[n.voice];
    const vel = midiVelocityFor(n);
    const onTick = Math.round(n.startSec * TICKS_PER_SEC);
    const offTick = Math.round((n.startSec + n.durSec) * TICKS_PER_SEC);
    melodic.push({ tick: onTick, data: [0x90 | ch, n.midi, vel], order: 5 });
    melodic.push({ tick: offTick, data: [0x80 | ch, n.midi, 0x40], order: 4 });
  }
  const melodicTrack = buildTrack(melodic);

  // drum track: channel 9, kit keys
  const drums: MidiEvent[] = [];
  for (const n of notes) {
    if (n.voice !== 'shaker' && n.voice !== 'kick') continue;
    const key = DRUM_KEYS[n.voice];
    const vel = midiVelocityFor(n);
    const onTick = Math.round(n.startSec * TICKS_PER_SEC);
    const offTick = Math.round((n.startSec + Math.min(n.durSec, 0.12)) * TICKS_PER_SEC);
    drums.push({ tick: onTick, data: [0x90 | 9, key, vel], order: 5 });
    drums.push({ tick: offTick, data: [0x80 | 9, key, 0x40], order: 4 });
  }
  const drumTrack = drums.length ? buildTrack(drums) : null;

  // SMF container
  const w = new ByteWriter();
  w.ascii('MThd');
  w.u32(6);
  w.u16(1); // Type 1
  w.u16(drumTrack ? 3 : 2);
  w.u16(PPQ);
  const head = w.toUint8Array();

  const parts: Uint8Array[] = [head, chunk('MTrk', metaTrack), chunk('MTrk', melodicTrack)];
  if (drumTrack) parts.push(chunk('MTrk', drumTrack));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * All mood-variant bed loops as .mid files — the audit's "export the loop
 * notes to MIDI" deliverable. Render with any GM synth, e.g.:
 *   fluidsynth -ni -F bed.wav GeneralUser_GS.sf2 bed-sparse-v0.mid
 */
export function exportBedMidi(vol = 0.55): { name: string; bytes: Uint8Array }[] {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const mood of MOODS) {
    for (let v = 0; v < 2; v++) {
      const notes = scaledScore(mood as Mood, v, vol);
      out.push({ name: `bed-${mood}-v${v}`, bytes: scoreToSmf(notes, { vol, name: `K-shaped bed · ${mood} · v${v}` }) });
    }
  }
  return out;
}
