/**
 * Soundfont bed assets — loading + decoding for the mix (audit P2-1).
 *
 * The offline render (scripts/render-bed.ts) writes one small 24 kHz
 * stereo PCM16 WAV per mood-variant loop to public/beds/, level-matched to
 * the DSP bed it replaces. At mix time renderMix() loads them once and
 * tiles them exactly like the DSP loops — ducking, mastering and the
 * hand-drawn K-motif chimes/whooshes all stay in audio.ts, unchanged.
 *
 * Absent files fall back to the DSP bed silently, so the repo renders
 * identically with or without the bed assets (CI, fresh clones, the
 * 8 GB Dell before its one-time offline render).
 */

import { SR_BGM, LOOP_LEN } from './score';

export interface BedLoop {
  L: Float32Array;
  R: Float32Array;
}

/** Decode a RIFF/WAVE PCM16 file to stereo float buffers. */
export function decodeWavPcm16(
  bytes: Uint8Array
): { L: Float32Array; R: Float32Array; sampleRate: number } | null {
  const view = bytes;
  const tag = (o: number) => String.fromCharCode(view[o], view[o + 1], view[o + 2], view[o + 3]);
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  // walk chunks to fmt + data
  let o = 12;
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null;
  let dataStart = -1;
  let dataSize = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = view[o + 4] | (view[o + 5] << 8) | (view[o + 6] << 16) | (view[o + 7] << 24);
    const body = o + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      const channels = view[body + 2] | (view[body + 3] << 8);
      const sampleRate =
        (view[body + 4] | (view[body + 5] << 8) | (view[body + 6] << 16) | (view[body + 7] << 24)) >>> 0;
      const bits = view[body + 14] | (view[body + 15] << 8);
      fmt = { channels, sampleRate, bits };
    } else if (id === 'data') {
      dataStart = body;
      dataSize = Math.min(size, bytes.length - body);
    }
    o = body + size + (size & 1);
  }
  if (!fmt || dataStart < 0 || fmt.bits !== 16) return null;

  const channels = Math.max(1, fmt.channels);
  const frames = Math.floor(dataSize / 2 / channels);
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = (view[dataStart + i * channels * 2] | (view[dataStart + i * channels * 2 + 1] << 8)) << 16 >> 16;
    L[i] = l / 32768;
    if (channels >= 2) {
      const r = (view[dataStart + i * channels * 2 + 2] | (view[dataStart + i * channels * 2 + 3] << 8)) << 16 >> 16;
      R[i] = r / 32768;
    } else {
      R[i] = L[i];
    }
  }

  // resample to the bed rate if the file was rendered at another rate
  if (fmt.sampleRate !== SR_BGM && fmt.sampleRate > 0) {
    const ratio = fmt.sampleRate / SR_BGM;
    const outN = Math.max(1, Math.floor(frames / ratio));
    const oL = new Float32Array(outN);
    const oR = new Float32Array(outN);
    for (let i = 0; i < outN; i++) {
      const p = i * ratio;
      const p0 = Math.min(frames - 1, p | 0);
      const p1 = Math.min(frames - 1, p0 + 1);
      const f = p - p0;
      oL[i] = L[p0] + (L[p1] - L[p0]) * f;
      oR[i] = R[p0] + (R[p1] - R[p0]) * f;
    }
    return { L: oL, R: oR, sampleRate: SR_BGM };
  }
  return { L, R, sampleRate: fmt.sampleRate };
}

/** Encode stereo float buffers as a 24 kHz PCM16 WAV (offline renders). */
export function encodeWavPcm16(L: Float32Array, R: Float32Array, sampleRate: number): Uint8Array {
  const frames = Math.min(L.length, R.length);
  const bytes = new Uint8Array(44 + frames * 4);
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) bytes[o + i] = s.charCodeAt(i); };
  const u32v = (o: number, v: number) => {
    bytes[o] = v & 0xff; bytes[o + 1] = (v >>> 8) & 0xff;
    bytes[o + 2] = (v >>> 16) & 0xff; bytes[o + 3] = (v >>> 24) & 0xff;
  };
  const u16v = (o: number, v: number) => { bytes[o] = v & 0xff; bytes[o + 1] = (v >>> 8) & 0xff; };
  w(0, 'RIFF'); u32v(4, 36 + frames * 4); w(8, 'WAVE');
  w(12, 'fmt '); u32v(16, 16); u16v(20, 1); u16v(22, 2);
  u32v(24, sampleRate); u32v(28, sampleRate * 4); u16v(32, 4); u16v(34, 16);
  w(36, 'data'); u32v(40, frames * 4);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    const li = Math.round(l * 32767);
    const ri = Math.round(r * 32767);
    const o = 44 + i * 4;
    bytes[o] = li & 0xff; bytes[o + 1] = (li >> 8) & 0xff;
    bytes[o + 2] = ri & 0xff; bytes[o + 3] = (ri >> 8) & 0xff;
  }
  return bytes;
}

// ── Bed loading with an injectable source ────────────────────────────────────

type BedLoader = (name: string) => Promise<Uint8Array | null>;

let bedLoader: BedLoader | null = null;
let bedCache: Map<string, BedLoop | null> | null = null;

/**
 * Override where bed WAVs come from. The studio uses the default (fetch
 * from /beds/); node scripts and the render harness can inject an fs
 * reader. Passing null restores the default.
 */
export function setBedLoader(fn: BedLoader | null): void {
  bedLoader = fn;
  bedCache = null;
}

const defaultLoader: BedLoader = async (name) => {
  try {
    const res = await fetch(`beds/${name}.wav`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

/**
 * Load the soundfont bed loops (once per loader). Missing files map to
 * null so callers fall back to the DSP renderer per loop. Buffers are
 * exactly LOOP_LEN samples — trimmed or zero-padded to guarantee the
 * tiler's seamless rhythm.
 */
export async function loadBedLoops(names: string[]): Promise<Map<string, BedLoop | null> | null> {
  if (!bedCache) bedCache = new Map();
  const loader = bedLoader ?? defaultLoader;
  let any = false;
  for (const name of names) {
    if (bedCache.has(name)) {
      if (bedCache.get(name)) any = true;
      continue;
    }
    const bytes = await loader(name);
    if (!bytes) {
      bedCache.set(name, null);
      continue;
    }
    const decoded = decodeWavPcm16(bytes);
    if (!decoded || decoded.L.length < LOOP_LEN / 2) {
      bedCache.set(name, null);
      continue;
    }
    const L = new Float32Array(LOOP_LEN);
    const R = new Float32Array(LOOP_LEN);
    L.set(decoded.L.subarray(0, Math.min(LOOP_LEN, decoded.L.length)));
    R.set(decoded.R.subarray(0, Math.min(LOOP_LEN, decoded.R.length)));
    bedCache.set(name, { L, R });
    any = true;
  }
  return any ? bedCache : null;
}
