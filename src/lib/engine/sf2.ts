/**
 * SoundFont 2 renderer — pure TypeScript, zero dependencies (audit P2-1).
 *
 * Why hand-rolled: the audit's route to "same notes, real instruments" is
 * FluidSynth + GeneralUser GS — but FluidSynth is a native binary, and this
 * engine's contract is free, offline, deterministic, 8-GB-laptop-friendly.
 * A minimal-but-correct SF2 player (RIFF parse → preset/instrument zones →
 * generators → 16-bit sample playback with envelopes, loops, keytracking,
 * pan, attenuation, static lowpass) gets the real-instrument timbre while
 * keeping the whole pipeline in the engine: the same code renders the bed
 * in the studio page, the render harness, and node scripts.
 *
 * Generator IDs and envelope semantics follow the SF2 2.01 spec (cross-
 * checked against TinySoundFont's implementation). Modulators, LFOs and
 * filter dynamics are intentionally out of scope — a ducked background bed
 * does not need them, and skipping them keeps renders deterministic.
 *
 * FluidSynth users: feed the .mid files from midi-export.ts to
 * `fluidsynth -ni -F bed.wav GeneralUser_GS.sf2 bed.mid` — the score is
 * identical; this module is the no-binary route to the same sound.
 */

// ── SF2 generator IDs (spec §8.1.1) ─────────────────────────────────────────

const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4,
  initialFilterFc: 8,
  endAddrsCoarseOffset: 12,
  pan: 17,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  keynumToVolEnvHold: 39,
  keynumToVolEnvDecay: 40,
  instrument: 41,
  keyRange: 43,
  velRange: 44,
  startloopAddrsCoarseOffset: 45,
  initialAttenuation: 48,
  endloopAddrsCoarseOffset: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  scaleTuning: 56,
  overridingRootKey: 58,
} as const;

// ── Parsed structures ────────────────────────────────────────────────────────

export interface Sf2Env {
  /** seconds (timecents already converted; 0 when pinned short) */
  delay: number;
  attack: number;
  hold: number;
  decay: number;
  release: number;
  /** linear sustain gain (cB attenuation already applied) */
  sustainGain: number;
  /** raw timecents, applied per key */
  keynumToHold: number;
  keynumToDecay: number;
}

export interface Sf2Zone {
  loKey: number;
  hiKey: number;
  loVel: number;
  hiVel: number;
  /** absolute positions into the sample data */
  sampleStart: number;
  sampleEnd: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  /** -1 = follow the sample header's original pitch */
  rootKey: number;
  pitchCorrection: number; // cents
  coarseTune: number; // semitones
  fineTune: number; // cents
  scaleTuning: number; // cents per key
  loopMode: 0 | 1 | 3;
  pan: number; // -0.5..0.5
  attenuationDb: number;
  filterFc: number;
  env: Sf2Env;
  sampleType: number; // 1 mono · 2 right · 4 left · 8 linked
  sampleLink: number;
}

export interface Sf2Preset {
  bank: number;
  program: number;
  name: string;
  zones: Sf2Zone[];
}

export interface Sf2File {
  presets: Sf2Preset[];
  sampleData: Int16Array;
  /** `${bank}:${program}` → preset */
  presetIndex: Map<string, Sf2Preset>;
}

// ── RIFF / chunk helpers ─────────────────────────────────────────────────────

const fourCC = (b: Uint8Array, o: number): string =>
  String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

const u32 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);

const s16 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8)) << 16 >> 16;

function ascii(b: Uint8Array, o: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[o + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

const timecentsToSecs = (tc: number): number => (tc < -11950 ? 0 : Math.pow(2, tc / 1200));

const clampN = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ── Parser ───────────────────────────────────────────────────────────────────

interface RawGen { oper: number; lo: number; hi: number; word: number; short: number }

function readGenList(b: Uint8Array, start: number, size: number): RawGen[] {
  const out: RawGen[] = [];
  for (let o = start; o + 4 <= start + size; o += 4) {
    const oper = u16(b, o);
    out.push({ oper, lo: b[o + 2], hi: b[o + 3], word: u16(b, o + 2), short: s16(b, o + 2) });
  }
  return out;
}

function zoneFromDefaults(): Sf2Zone {
  return {
    loKey: 0, hiKey: 127, loVel: 0, hiVel: 127,
    sampleStart: 0, sampleEnd: 0, loopStart: 0, loopEnd: 0,
    sampleRate: 44100, rootKey: -1, pitchCorrection: 0,
    coarseTune: 0, fineTune: 0, scaleTuning: 100,
    loopMode: 0, pan: 0, attenuationDb: 0, filterFc: 13500,
    env: {
      delay: 0, attack: 0, hold: 0, decay: 0, release: 0,
      sustainGain: 1, keynumToHold: 0, keynumToDecay: 0,
    },
    sampleType: 1, sampleLink: 0,
  };
}

/** Apply one raw generator to a zone (spec ranges honoured). */
function applyGen(z: Sf2Zone, g: RawGen): void {
  switch (g.oper) {
    case GEN.keyRange: z.loKey = g.lo; z.hiKey = g.hi; break;
    case GEN.velRange: z.loVel = g.lo; z.hiVel = g.hi; break;
    case GEN.pan: z.pan = clampN(g.short * 0.001, -0.5, 0.5); break;
    case GEN.initialAttenuation: z.attenuationDb = clampN(g.short * 0.1, 0, 144); break;
    case GEN.coarseTune: z.coarseTune = clampN(g.short, -120, 120); break;
    case GEN.fineTune: z.fineTune = clampN(g.short, -99, 99); break;
    case GEN.scaleTuning: z.scaleTuning = clampN(g.short, 0, 1200); break;
    case GEN.initialFilterFc: z.filterFc = clampN(g.short, 1500, 13500); break;
    case GEN.sampleModes: z.loopMode = ((g.word & 3) === 1 ? 1 : (g.word & 3) === 3 ? 3 : 0); break;
    case GEN.overridingRootKey: if (g.short >= 0 && g.short <= 127) z.rootKey = g.short; break;
    case GEN.delayVolEnv: z.env.delay = timecentsToSecs(g.short); break;
    case GEN.attackVolEnv: z.env.attack = timecentsToSecs(g.short); break;
    case GEN.holdVolEnv: z.env.hold = timecentsToSecs(g.short); break;
    case GEN.decayVolEnv: z.env.decay = timecentsToSecs(g.short); break;
    case GEN.releaseVolEnv: z.env.release = timecentsToSecs(g.short); break;
    case GEN.sustainVolEnv: z.env.sustainGain = g.short <= 0 ? 1 : Math.pow(10, -clampN(g.short, 0, 1440) / 200); break;
    case GEN.keynumToVolEnvHold: z.env.keynumToHold = g.short; break;
    case GEN.keynumToVolEnvDecay: z.env.keynumToDecay = g.short; break;
    default: break; // offsets / modulators / LFOs — out of scope for a bed
  }
}

/** Add preset-level generators onto a resolved instrument zone (spec: ADD). */
function mergePresetGens(z: Sf2Zone, pgens: RawGen[]): void {
  for (const g of pgens) {
    switch (g.oper) {
      case GEN.pan: z.pan = clampN(z.pan + g.short * 0.001, -0.5, 0.5); break;
      case GEN.initialAttenuation: z.attenuationDb = clampN(z.attenuationDb + g.short * 0.1, 0, 144); break;
      case GEN.coarseTune: z.coarseTune = clampN(z.coarseTune + g.short, -120, 120); break;
      case GEN.fineTune: z.fineTune = clampN(z.fineTune + g.short, -99, 99); break;
      default: break;
    }
  }
}

/**
 * Parse a .sf2 file. Throws on structural problems; tolerant of unknown
 * chunks (INFO, PMOD/IMOD modulators are skipped).
 */
export function parseSf2(bytes: Uint8Array): Sf2File {
  if (fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'sfbk') {
    throw new Error('sf2: not a RIFF/sfbk file');
  }

  let sampleData: Int16Array | null = null;
  // pdta chunk bodies, keyed by fourCC
  const chunks: Record<string, { start: number; size: number }> = {};

  // walk one RIFF level: LIST sdta / LIST pdta
  let o = 12;
  const riffEnd = 8 + u32(bytes, 4);
  while (o + 8 <= riffEnd) {
    const id = fourCC(bytes, o);
    const size = u32(bytes, o + 4);
    const body = o + 8;
    if (id === 'LIST') {
      const listType = fourCC(bytes, body);
      let p = body + 4;
      const listEnd = body + size;
      while (p + 8 <= listEnd) {
        const cid = fourCC(bytes, p);
        const csize = u32(bytes, p + 4);
        const cbody = p + 8;
        if (listType === 'sdta' && cid === 'smpl') {
          // word-aligned by spec — safe Int16Array view
          sampleData = new Int16Array(bytes.buffer, bytes.byteOffset + cbody, csize >> 1);
        } else if (listType === 'pdta') {
          chunks[cid] = { start: cbody, size: csize };
        }
        p += 8 + csize + (csize & 1); // chunks are word-padded
      }
    }
    o += 8 + size + (size & 1);
  }
  if (!sampleData) throw new Error('sf2: no sdta/smpl sample data');
  for (const c of ['phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr']) {
    if (!chunks[c]) throw new Error(`sf2: missing pdta/${c} chunk`);
  }

  function readGenIndex(c: { start: number; size: number }): { genNdx: number }[] {
    const out: { genNdx: number }[] = [];
    const n = Math.floor(c.size / 4);
    for (let i = 0; i < n; i++) out.push({ genNdx: u16(bytes, c.start + i * 4) });
    return out;
  }

  // ── PHDR: presets (last record is the EOP terminal) ──
  const phdrs: { name: string; preset: number; bank: number; bagNdx: number }[] = [];
  {
    const { start, size } = chunks['phdr'];
    const n = Math.floor(size / 38);
    for (let i = 0; i < n - 1; i++) {
      const b = start + i * 38;
      phdrs.push({
        name: ascii(bytes, b, 20),
        preset: u16(bytes, b + 20),
        bank: u16(bytes, b + 22),
        bagNdx: u16(bytes, b + 24),
      });
    }
  }

  const pbags = readGenIndex(chunks['pbag']);
  const pgens = readGenList(bytes, chunks['pgen'].start, chunks['pgen'].size);

  // ── INST/IBAG/IGEN: instruments (last record is the terminal) ──
  const insts: { name: string; bagNdx: number }[] = [];
  {
    const { start, size } = chunks['inst'];
    const n = Math.floor(size / 22);
    for (let i = 0; i < n - 1; i++) {
      const b = start + i * 22;
      insts.push({ name: ascii(bytes, b, 20), bagNdx: u16(bytes, b + 20) });
    }
  }
  const ibags = readGenIndex(chunks['ibag']);
  const igens = readGenList(bytes, chunks['igen'].start, chunks['igen'].size);

  // ── SHDR: sample headers (last record is the EOS terminal) ──
  const shdrs: {
    start: number; end: number; startLoop: number; endLoop: number;
    sampleRate: number; originalPitch: number; pitchCorrection: number;
    sampleLink: number; sampleType: number;
  }[] = [];
  {
    const { start, size } = chunks['shdr'];
    const n = Math.floor(size / 46);
    for (let i = 0; i < n - 1; i++) {
      const b = start + i * 46;
      shdrs.push({
        start: u32(bytes, b + 20),
        end: u32(bytes, b + 24),
        startLoop: u32(bytes, b + 28),
        endLoop: u32(bytes, b + 32),
        sampleRate: u32(bytes, b + 36),
        originalPitch: bytes[b + 40],
        pitchCorrection: s16(bytes, b + 41),
        sampleLink: u16(bytes, b + 42),
        sampleType: u16(bytes, b + 44),
      });
    }
  }

  // ── build presets: preset zone → instrument → instrument zones ──
  const presets: Sf2Preset[] = [];
  const sampleCount = sampleData.length;

  for (let pi = 0; pi < phdrs.length; pi++) {
    const ph = phdrs[pi];
    const bagEnd = pi + 1 < phdrs.length ? phdrs[pi + 1].bagNdx : pbags.length;
    const zones: Sf2Zone[] = [];

    for (let bi = ph.bagNdx; bi < bagEnd && bi < pbags.length; bi++) {
      const genEnd = bi + 1 < pbags.length ? pbags[bi + 1].genNdx : pgens.length;
      const zonePgens = pgens.slice(pbags[bi].genNdx, genEnd);

      // preset-level key/vel range + instrument reference
      let pLoKey = 0, pHiKey = 127, pLoVel = 0, pHiVel = 127;
      let instIdx = -1;
      for (const g of zonePgens) {
        if (g.oper === GEN.keyRange) { pLoKey = g.lo; pHiKey = g.hi; }
        else if (g.oper === GEN.velRange) { pLoVel = g.lo; pHiVel = g.hi; }
        else if (g.oper === GEN.instrument) instIdx = g.word;
      }
      if (instIdx < 0 || instIdx >= insts.length) continue;

      const inst = insts[instIdx];
      const iBagEnd = instIdx + 1 < insts.length ? insts[instIdx + 1].bagNdx : ibags.length;
      for (let zi = inst.bagNdx; zi < iBagEnd && zi < ibags.length; zi++) {
        const iGenEnd = zi + 1 < ibags.length ? ibags[zi + 1].genNdx : igens.length;
        const zone = zoneFromDefaults();
        let sampleId = -1;
        for (const g of igens.slice(ibags[zi].genNdx, iGenEnd)) {
          if (g.oper === GEN.sampleID) { sampleId = g.word; continue; }
          applyGen(zone, g);
        }
        if (sampleId < 0 || sampleId >= shdrs.length) continue; // global zone
        // preset range filters the instrument zone (spec §8.2.3)
        if (zone.hiKey < pLoKey || zone.loKey > pHiKey) continue;
        if (zone.hiVel < pLoVel || zone.loVel > pHiVel) continue;
        zone.loKey = Math.max(zone.loKey, pLoKey);
        zone.hiKey = Math.min(zone.hiKey, pHiKey);
        zone.loVel = Math.max(zone.loVel, pLoVel);
        zone.hiVel = Math.min(zone.hiVel, pHiVel);
        mergePresetGens(zone, zonePgens);

        const sh = shdrs[sampleId];
        zone.sampleStart = sh.start;
        zone.sampleEnd = Math.min(sh.end, sampleCount);
        zone.loopStart = Math.min(sh.startLoop, sampleCount);
        zone.loopEnd = Math.min(sh.endLoop > 0 ? sh.endLoop - 1 : 0, sampleCount);
        zone.sampleRate = sh.sampleRate || 44100;
        if (zone.rootKey < 0) {
          zone.rootKey = sh.originalPitch > 0 && sh.originalPitch < 255 ? sh.originalPitch : 60;
        }
        zone.pitchCorrection = sh.pitchCorrection;
        zone.sampleType = sh.sampleType & 0x0f; // strip ROM/compression flags
        zone.sampleLink = sh.sampleLink;
        zones.push(zone);
      }
    }

    presets.push({ bank: ph.bank, program: ph.preset, name: ph.name, zones });
  }

  const presetIndex = new Map<string, Sf2Preset>();
  for (const p of presets) presetIndex.set(`${p.bank}:${p.program}`, p);

  return { presets, sampleData, presetIndex };
}

// ── The renderer ─────────────────────────────────────────────────────────────

export interface RenderNote {
  key: number;
  /** MIDI velocity 1..127 */
  vel: number;
  startSec: number;
  /** held duration; release starts here */
  durSec: number;
  /** extra stereo pan for this note (-0.5..0.5), added to the zone pan */
  pan: number;
  bank: number;
  program: number;
  /** linear gain trim */
  gain: number;
}

export interface Sf2RenderOpts {
  /** output sample rate */
  sampleRate: number;
  /** output buffer length in samples */
  length: number;
  /** wrap note tails past `length` back to buffer head (seamless bed loops) */
  wrap: boolean;
}

/**
 * Render notes through the soundfont into a stereo buffer. Deterministic:
 * same sf2 + same notes + same opts → byte-identical output.
 *
 * Stereo pairs: GeneralUser GS records left/right members of a stereo
 * sample as sibling instrument zones; the left member (sampleType 4)
 * feeds the left channel and the right member (type 2) the right — true
 * stereo from the sample itself. Mono zones use the zone/note pan law.
 */
export function renderSf2Notes(
  sf2: Sf2File,
  notes: RenderNote[],
  opts: Sf2RenderOpts
): { L: Float32Array; R: Float32Array } {
  const N = opts.length;
  const L = new Float32Array(N);
  const R = new Float32Array(N);

  for (const n of notes) {
    const preset = sf2.presetIndex.get(`${n.bank}:${n.program}`);
    if (!preset) continue;
    const zones = preset.zones.filter(
      (z) => n.key >= z.loKey && n.key <= z.hiKey && n.vel >= z.loVel && n.vel <= z.hiVel
    );
    for (const z of zones) {
      renderZoneNote(L, R, N, sf2.sampleData, z, n, opts.sampleRate, opts.wrap);
    }
  }
  return { L, R };
}

/** Render one zone × one note into the output buffer. */
function renderZoneNote(
  L: Float32Array,
  R: Float32Array,
  N: number,
  data: Int16Array,
  z: Sf2Zone,
  n: RenderNote,
  outSr: number,
  wrap: boolean
): void {
  // ── pitch: playback increment ──
  const semis =
    ((n.key - z.rootKey) * z.scaleTuning) / 100 +
    z.coarseTune +
    (z.fineTune + z.pitchCorrection) / 100;
  const increment = (z.sampleRate / outSr) * Math.pow(2, semis / 12);
  if (!(increment > 0)) return;

  // ── gains ──
  const v = clampN(n.vel / 127, 0, 1);
  const noteTrim = (n.gain ?? 1) * (v * v) * Math.pow(10, -z.attenuationDb / 20);

  // stereo placement
  const totalPan = clampN(z.pan + n.pan, -0.5, 0.5);
  let gl: number, gr: number;
  if (z.sampleType === 4) { gl = 1; gr = 0; }        // left member of a pair
  else if (z.sampleType === 2) { gl = 0; gr = 1; }   // right member of a pair
  else {
    gl = Math.cos((Math.PI / 2) * (totalPan + 0.5));
    gr = Math.sin((Math.PI / 2) * (totalPan + 0.5));
  }

  // ── envelope (sample counts, tsf-compatible exponential decay/release) ──
  // keynumToHold/Decay are timecents added per key above/below key 60
  const keyShift = (tc: number): number => Math.pow(2, tc / 1200);
  const holdSec = z.env.hold > 0 ? z.env.hold * keyShift(z.env.keynumToHold * (60 - n.key)) : 0;
  const decaySec = z.env.decay > 0 ? z.env.decay * keyShift(z.env.keynumToDecay * (60 - n.key)) : 0;

  const delayN = Math.round(z.env.delay * outSr);
  const attackN = Math.round(z.env.attack * outSr);
  const holdN = Math.round(holdSec * outSr);
  const decayN = Math.max(1, Math.round(decaySec * outSr));
  const releaseN = Math.max(1, Math.round(z.env.release * outSr));
  const sustain = z.env.sustainGain;

  const decaySlope = Math.exp(-9.226 / decayN);
  const releaseSlope = Math.exp(-9.226 / releaseN);
  const attackInc = 1 / Math.max(1, attackN);

  const startN = Math.round(n.startSec * outSr);
  if (startN < 0) return; // notes before the buffer can't wrap anywhere sane
  const offN = startN + Math.max(0, Math.round(n.durSec * outSr));
  // render through the release tail (+ a little margin for deep tails)
  const endN = offN + releaseN + Math.round(0.25 * outSr);

  // loop bookkeeping: mode 1 loops always; mode 3 loops until release
  const canLoop = z.loopMode === 1 || z.loopMode === 3;
  const hasLoop = canLoop && z.loopEnd > z.loopStart + 1;
  const loopSpan = z.loopEnd - z.loopStart;

  // static lowpass (only when the zone actually filters)
  const useFilter = z.filterFc < 12000 && z.filterFc < outSr * 0.45;
  const filterAlpha = useFilter ? 1 - Math.exp((-2 * Math.PI * z.filterFc) / outSr) : 0;
  let lp = 0;

  let pos = z.sampleStart;
  let env = 0;
  // 0 delay · 1 attack · 2 hold · 3 decay · 4 sustain · 5 release
  let seg: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  let segEnd = delayN;

  for (let i = startN; i < endN; i++) {
    const rel = i - startN;

    // note-off switches to release from the current level
    if (i === offN && seg !== 5) seg = 5;

    // advance through the pre-off segments — zero-length segments are
    // SKIPPED, and each skip must land the envelope at the level that
    // segment would have ended at (delay→0, attack→1, hold→1). Without
    // this, an instant-attack zone enters decay at env=0 and the
    // sustain clamp pins it there — whole drum kits render silent.
    // (sustain is left only by note-off, so the loop stops at seg 4.)
    while (seg < 4 && rel >= segEnd) {
      switch (seg) {
        case 0: seg = 1; segEnd = delayN + attackN; break;
        case 1: seg = 2; segEnd = delayN + attackN + holdN; env = 1; break;
        case 2: seg = 3; segEnd = delayN + attackN + holdN + decayN; env = 1; break;
        case 3: seg = 4; break;
        default: break;
      }
    }
    switch (seg) {
      case 0: env = 0; break;
      case 1: env += attackInc; if (env > 1) env = 1; break;
      case 2: env = 1; break;
      case 3: env *= decaySlope; if (env < sustain) { env = sustain; seg = 4; } break;
      case 4: env = sustain; break;
      default: env *= releaseSlope; break;
    }
    if (env < 1e-5 && seg === 5) break;

    // sample playback (linear interpolation)
    if (pos >= z.sampleEnd) break;
    const p0 = pos | 0;
    const frac = pos - p0;
    const a = data[p0] * (1 / 32768);
    const b = (p0 + 1 < z.sampleEnd ? data[p0 + 1] : data[p0]) * (1 / 32768);
    let s = a + (b - a) * frac;
    if (useFilter) {
      lp += filterAlpha * (s - lp);
      s = lp;
    }
    s *= env * noteTrim;

    const outIdx = wrap ? i % N : i;
    if (outIdx < N) {
      L[outIdx] += s * gl;
      R[outIdx] += s * gr;
    }

    // advance (loop-aware)
    if (hasLoop && pos >= z.loopEnd && (z.loopMode === 1 || i < offN)) {
      pos -= loopSpan;
    }
    pos += increment;
  }
}

// ── Utilities for the bed render pipeline ────────────────────────────────────

/** Peak amplitude of a buffer. */
export function peakOf(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

/** RMS of a buffer. */
export function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}
