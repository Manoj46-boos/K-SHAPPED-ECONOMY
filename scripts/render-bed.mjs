/**
 * render-bed.mjs — the offline soundfont bed render (audit P2-1).
 *
 * "Same notes, real instruments": renders the score (score.ts) through
 * GeneralUser GS with the engine's own SF2 player (sf2.ts), level-matches
 * each loop against the DSP bed it replaces, and writes the bed assets
 * the mix loads at render time:
 *
 *   public/beds/sf2-<mood>-<v>.wav        the bed (24 kHz stereo PCM16)
 *   public/beds/midi/bed-<mood>-<v>.mid   the same loops as MIDI, for
 *                                         FluidSynth / any DAW / GM player
 *
 * Usage:
 *   node scripts/render-bed.mjs [--sf2 /path/to/GeneralUser_GS.sf2]
 *
 * The soundfont is NOT committed (30 MB, third-party license) — pass a
 * path, set SF2_PATH, drop GeneralUser_GS.sf2 in the repo root, or let
 * the script download the GeneralUser GS v1.471 mirror once into
 * .bed-build/. Everything else is deterministic: same soundfont →
 * byte-identical beds.
 *
 * Runs on the 8 GB Dell in well under a minute — this is the "rendering
 * happens once, offline" step from the audit.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, '.bed-build');
const BEDS = path.join(ROOT, 'public', 'beds');
const SF2_URL =
  'https://raw.githubusercontent.com/ROCKNIX/generaluser-gs/main/GeneralUser%20GS%20v1.471.sf2';

// ── 1. compile the engine's audio chain (canvas-free) to CJS ────────────────
const ENGINE_FILES = [
  'src/lib/engine/audio.ts',
  'src/lib/engine/sf2.ts',
  'src/lib/engine/midi-export.ts',
];
if (!fs.existsSync(path.join(BUILD, 'audio.js'))) {
  execSync(
    [
      'node_modules/.bin/tsc',
      ...ENGINE_FILES.map((f) => path.join(ROOT, f)),
      '--outDir', BUILD,
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--target', 'es2022',
      '--skipLibCheck',
      '--esModuleInterop',
    ].join(' '),
    { stdio: 'inherit' }
  );
}

const { parseSf2, renderSf2Notes, rmsOf, peakOf } = await import(
  path.join(BUILD, 'sf2.js')
);
const { scaledScore, GM_MAP, DRUM_KEYS, midiVelocityFor, MOODS, LOOP_LEN, SR_BGM } = await import(
  path.join(BUILD, 'score.js')
);
const { renderMoodLoopDsp, BED_REF_VOL } = await import(path.join(BUILD, 'audio.js'));
const { encodeWavPcm16 } = await import(path.join(BUILD, 'beds.js'));
const { exportBedMidi } = await import(path.join(BUILD, 'midi-export.js'));

// ── 2. locate the soundfont ──────────────────────────────────────────────────
function findSf2() {
  const argIdx = process.argv.indexOf('--sf2');
  const candidates = [
    argIdx >= 0 ? process.argv[argIdx + 1] : null,
    process.env.SF2_PATH,
    path.join(ROOT, 'GeneralUser_GS.sf2'),
    path.join(BUILD, 'GeneralUser_GS.sf2'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).size > 1_000_000) return c;
  }
  return null;
}

let sf2Path = findSf2();
if (!sf2Path) {
  console.log('soundfont not found — downloading GeneralUser GS v1.471 once…');
  execSync(`curl -sL --max-time 300 -o "${path.join(BUILD, 'GeneralUser_GS.sf2')}" "${SF2_URL}"`, {
    stdio: 'inherit',
    shell: '/bin/bash',
  });
  sf2Path = path.join(BUILD, 'GeneralUser_GS.sf2');
}

// ── 3. parse ─────────────────────────────────────────────────────────────────
const t0 = Date.now();
const sf2Bytes = new Uint8Array(fs.readFileSync(sf2Path));
const sf2 = parseSf2(sf2Bytes);
console.log(
  `parsed ${sf2.presets.length} presets · ${(sf2Bytes.length / 1e6).toFixed(1)} MB · ${(
    (Date.now() - t0) / 1000
  ).toFixed(1)}s`
);
for (const key of ['0:0', '0:48', '0:33', '128:0']) {
  const p = sf2.presetIndex.get(key);
  console.log(`  GM ${key} → ${p ? `${p.name} (${p.zones.length} zones)` : 'MISSING'}`);
}

// ── 4. render + level-match every mood-variant loop ─────────────────────────
fs.mkdirSync(path.join(BEDS, 'midi'), { recursive: true });

const db = (v) => (20 * Math.log10(v + 1e-12)).toFixed(1);
const rows = [];
let worstPeak = 0;

// GM sample balance vs the DSP bed's voice balance. The GeneralUser drum
// kit needs per-voice compensation: the bass drum is recorded hot, while
// the closed hi-hat carries ~-28 dB of zone attenuation of its own (a
// quiet sample by design) — without the +18 dB trim the shaker texture
// that opened every bright/lift chapter in the DSP bed simply vanishes.
// Trims are empirical, against the DSP bed's per-voice presence.
const VOICE_TRIM = { pad: 1.0, piano: 1.0, bass: 1.0, kick: 0.5, shaker: 8.0 };

for (const mood of MOODS) {
  for (let v = 0; v < 2; v++) {
    const notes = scaledScore(mood, v, BED_REF_VOL);
    const renderNotes = notes.map((n) => ({
      key: n.voice === 'shaker' || n.voice === 'kick' ? DRUM_KEYS[n.voice] : n.midi,
      vel: midiVelocityFor(n),
      startSec: n.startSec,
      durSec: n.durSec,
      pan: n.pan * 0.5, // DSP pan is ±0.6..1.2 spread; soften for samples
      bank: GM_MAP[n.voice].bank,
      program: GM_MAP[n.voice].program,
      gain: VOICE_TRIM[n.voice],
    }));

    const { L, R } = renderSf2Notes(sf2, renderNotes, {
      sampleRate: SR_BGM,
      length: LOOP_LEN,
      wrap: true, // note tails wrap → the bed tiles seamlessly
    });

    // level-match to the DSP bed this file replaces (per-loop RMS, both ch),
    // then soft-clip transients above 0.85 — a gentle knee that costs well
    // under 0.1 dB of RMS but keeps the loop peak out of the mix bus's
    // true-peak headroom (the master's tanh glue would do the same later;
    // doing it here keeps the WAV a clean, predictable asset).
    const dsp = renderMoodLoopDsp(mood, v, BED_REF_VOL);
    const dspRms = (rmsOf(dsp.L) + rmsOf(dsp.R)) / 2;
    const sf2Rms = (rmsOf(L) + rmsOf(R)) / 2;
    const gain = sf2Rms > 1e-9 ? dspRms / sf2Rms : 1;
    const T = 0.85;
    const softClip = (x) => {
      const a = Math.abs(x * gain);
      if (a <= T) return x * gain;
      const c = T + (1 - T) * Math.tanh((a - T) / (1 - T));
      return Math.sign(x) * c;
    };

    const oL = new Float32Array(LOOP_LEN);
    const oR = new Float32Array(LOOP_LEN);
    for (let i = 0; i < LOOP_LEN; i++) {
      oL[i] = softClip(L[i]);
      oR[i] = softClip(R[i]);
    }
    const outPk = Math.max(peakOf(oL), peakOf(oR));
    if (outPk > worstPeak) worstPeak = outPk;

    const name = `sf2-${mood}-${v}`;
    fs.writeFileSync(path.join(BEDS, `${name}.wav`), encodeWavPcm16(oL, oR, SR_BGM));

    rows.push({
      loop: name,
      notes: notes.length,
      dspRms: db(dspRms),
      sf2Raw: db(sf2Rms),
      matched: db((rmsOf(oL) + rmsOf(oR)) / 2),
      deltaDb: (
        20 * Math.log10((rmsOf(oL) + rmsOf(oR)) / 2 + 1e-12) -
        20 * Math.log10(dspRms + 1e-12)
      ).toFixed(2),
      peak: outPk.toFixed(3),
    });
  }
}

// ── 5. MIDI export (the audit's "export the loop notes to MIDI") ────────────
for (const { name, bytes } of exportBedMidi(BED_REF_VOL)) {
  fs.writeFileSync(path.join(BEDS, 'midi', `${name}.mid`), bytes);
}

// ── 6. report ────────────────────────────────────────────────────────────────
console.log(`\nrendered ${rows.length} bed loops + ${rows.length} MIDI files → public/beds/`);
console.log(
  'loop'.padEnd(18) +
  'notes'.padStart(6) +
  'dsp RMS'.padStart(10) +
  'sf2 raw'.padStart(10) +
  'matched'.padStart(10) +
  'ΔdB'.padStart(7) +
  'peak'.padStart(7)
);
for (const r of rows) {
  console.log(
    r.loop.padEnd(18) +
    String(r.notes).padStart(6) +
    r.dspRms.padStart(10) +
    r.sf2Raw.padStart(10) +
    r.matched.padStart(10) +
    r.deltaDb.padStart(7) +
    r.peak.padStart(7)
  );
}
const worstDelta = Math.max(...rows.map((r) => Math.abs(Number(r.deltaDb))));
const allFiles = fs.readdirSync(BEDS).filter((f) => f.endsWith('.wav')).length;
console.log(
  `\nlevel parity: worst |Δ| ${worstDelta.toFixed(2)} dB · worst peak ${worstPeak.toFixed(
    3
  )} · ${allFiles} wav + ${fs.readdirSync(path.join(BEDS, 'midi')).length} mid · ${(
    (Date.now() - t0) /
    1000
  ).toFixed(1)}s total`
);
console.log('\nnext renderMix() loads these automatically (beds.ts); missing files fall back to DSP.');
