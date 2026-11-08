/**
 * P1-5 (report) — the VOICE A/B harness.
 *
 *   "Record one chapter with your own voice against the TTS timing track;
 *    if human wins, ship a hybrid." — 100-Judge Report, P1-5
 *
 * Three modes, all free-tool, all offline:
 *
 *   1. PREP    node tools/voice-ab-prep.mjs --chapter 7
 *              Exports the REAL timing track for that chapter (from the TTS
 *              cache — actual word timings), one read-script .txt per line,
 *              a timing.csv, and a README with recording instructions
 *              (Audacity → WAV 16-bit mono). No dependencies.
 *
 *   2. MERGE   node tools/voice-ab-prep.mjs --chapter 7 --merge
 *              Time-fits your recordings to the TTS timings (linear resample
 *              when a line drifts >2%; bigger drifts are flagged — re-record,
 *              don't stretch) and writes voice-ab/ch7/fitted/<id>.wav plus
 *              voice-ab-manifest.json (word timings preserved, so captions
 *              and karaoke stay frame-synced with YOUR voice).
 *
 *   3. RENDER  node tools/voice-ab-prep.mjs --chapter 7 --render-ab
 *              (needs ffmpeg on PATH) Renders the two arms through the
 *              engine's own renderMix: A-tts.wav (the TTS voice) and
 *              B-human.wav (your voice), same timeline, same score —
 *              voice-ab/ch7/A-tts.wav vs B-human.wav. Listen, pick, ship.
 *
 * The studio "ship a hybrid" step stays manual on purpose: wire the winning
 * arm in only after the A/B says human wins (the report's own framing).
 */
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');

const args = process.argv.slice(2);
const chIdx = args.indexOf('--chapter');
const CHAPTER = chIdx >= 0 ? Number(args[chIdx + 1]) : 7; // default: the twist chapter
const MERGE = args.includes('--merge');
const RENDER = args.includes('--render-ab');

// ── engine build (audio path only) ───────────────────────────────────────────
{
  const files = ['theme', 'easing', 'effects', 'stickman', 'stickman-v2', 'charts', 'textfx',
    'scene-context', 'scene-props', 'scenes-host', 'scenes-data', 'scenes-text',
    'analytics', 'script-data', 'timeline', 'director', 'collision',
    'audio', 'score', 'beds'].map((f) => path.join(REPO, 'src', 'lib', 'engine', f + '.ts'));
  const needBuild = files.some((f) => {
    const out = path.join(BUILD, path.basename(f, '.ts') + '.js');
    return !fs.existsSync(out) || fs.statSync(f).mtimeMs > fs.statSync(out).mtimeMs;
  });
  if (needBuild) {
    execSync(
      ['node_modules/.bin/tsc', ...files,
       '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
       '--target', 'es2022', '--skipLibCheck', '--esModuleInterop',
       '--resolveJsonModule'].join(' '),
      { stdio: 'inherit', cwd: REPO }
    );
  }
}

// browser shims (AudioContext.createBuffer only)
class FakeAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels; this.length = length; this.sampleRate = sampleRate;
    this._ch = []; for (let c = 0; c < channels; c++) this._ch.push(new Float32Array(length));
  }
  getChannelData(c) { return this._ch[Math.min(c, this._ch.length - 1)]; }
}
globalThis.AudioContext = class {
  constructor() { this.sampleRate = 48000; }
  createBuffer(c, l, sr) { return new FakeAudioBuffer(c, l, sr); }
};
globalThis.webkitAudioContext = globalThis.AudioContext;

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { renderMix } = require(path.join(BUILD, 'audio.js'));
const { setBedLoader, encodeWavPcm16 } = require(path.join(BUILD, 'beds.js'));

setBedLoader(async (name) => {
  try {
    const p = path.join(REPO, 'public', 'beds', `${name}.wav`);
    return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
  } catch { return null; }
});

// ── the REAL manifest from the TTS cache (actual word timings) ───────────────
const TTS_DIR = path.join(REPO, '.render-assets', 'tts');
const hasFfmpeg = (() => { try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; } catch { return false; } })();
function mp3DurationSec(mp3) {
  if (!hasFfmpeg) return null;
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}"`).toString().trim();
    return Number(out);
  } catch { return null; }
}
const manifest = { lines: {} };
let cached = 0;
if (fs.existsSync(TTS_DIR)) {
  for (const f of fs.readdirSync(TTS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(TTS_DIR, f), 'utf8'));
    if (!j.id) continue;
    const mp3 = path.join(TTS_DIR, f.replace('.json', '.mp3'));
    const dur = (fs.existsSync(mp3) ? mp3DurationSec(mp3) : null) ?? j.estDuration;
    manifest.lines[j.id] = { key: f.replace('.json', ''), durationMs: Math.round(dur * 1000), words: j.words || [] };
    cached++;
  }
}
console.log(`TTS cache: ${cached} lines with real word timings ${hasFfmpeg ? '(mp3 durations measured via ffprobe)' : '(est durations — install ffmpeg for exact)'}`);

// fall back to the estimator for any line the cache lacks
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w });
    t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo).forEach((text, si) => {
      const id = `${ci}-${bi}-${si}`;
      if (!manifest.lines[id]) {
        const { words, durMs } = estWords(text);
        manifest.lines[id] = { key: `synthetic-${id}`, durationMs: durMs, words };
      }
    });
  });
});

const tl = buildTimeline(manifest, 30);
const CH = CHAPTER - 1; // 0-indexed
const chapterSpec = SCRIPT[CH];
if (!chapterSpec) { console.error(`chapter ${CHAPTER} not found`); process.exit(1); }
const chRange = tl.chapters[CH];
const OUT_DIR = path.join(REPO, 'voice-ab', `ch${CHAPTER}`);

// the chapter's sentence ids + text, in order (startMs = sentence-accurate)
const chapterLines = [];
chapterSpec.beats.forEach((beat, bi) => {
  const tlBeat = tl.beats.find((b) => b.chapter === CH && b.beatIndex === bi);
  splitSentences(beat.vo).forEach((text, si) => {
    const id = `${CH}-${bi}-${si}`;
    const entry = manifest.lines[id];
    const sent = tlBeat?.sentences.find((s) => s.lineId === id);
    chapterLines.push({ id, text, durMs: entry.durationMs, startMs: sent ? sent.startMs : (tlBeat ? tlBeat.startMs : 0) });
  });
});

// ── mode 1: PREP ─────────────────────────────────────────────────────────────
if (!MERGE && !RENDER) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csv = ['id,start_ms,dur_ms,words,text'];
  for (const l of chapterLines) {
    fs.writeFileSync(path.join(OUT_DIR, `${l.id}.txt`), `${l.text}\n`);
    csv.push(`${l.id},${l.startMs},${l.durMs},${manifest.lines[l.id].words.length},"${l.text.replace(/"/g, '""')}"`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'timing.csv'), csv.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), `# Voice A/B — Chapter ${CHAPTER}: ${chapterSpec.title}

You are recording this chapter against the TTS timing track. Everything is
free tools; nothing here touches the render pipeline until you decide.

## How to record
1. Install Audacity (free, audacityteam.org).
2. Open the .txt files in this folder — one per sentence, named by id
   (e.g. ${chapterLines[0].id}.txt, ${chapterLines[1]?.id ?? ''}.txt, …).
3. Record each sentence into its own track/marker, reading the text at a
   natural pace. Target duration is in timing.csv (±10% is fine — the merge
   step time-fits small drift).
4. Keep the read ENERGETIC and slightly faster than feels natural — the
   TTS baseline is ~150 wpm and the edit is cut to that pace.
5. Export each sentence: File → Export → Export as WAV, 16-bit PCM, mono,
   48000 Hz (44100 is fine too), named exactly \`<id>.wav\` (e.g. \`${chapterLines[0].id}.wav\`).
6. Drop the .wav files in this folder, then run:
     node tools/voice-ab-prep.mjs --chapter ${CHAPTER} --merge

## Then listen
     node tools/voice-ab-prep.mjs --chapter ${CHAPTER} --render-ab
   (needs ffmpeg on PATH) → A-tts.wav vs B-human.wav, same timeline, same
   score. If the human arm wins, wire the fitted files in as the hybrid —
   the word timings in voice-ab-manifest.json keep captions frame-synced.

Sentence count: ${chapterLines.length} · total speech: ${(chapterLines.reduce((n, l) => n + l.durMs, 0) / 1000).toFixed(1)}s
`);
  console.log(`PREP → ${path.relative(REPO, OUT_DIR)}/ (${chapterLines.length} lines, timing.csv + read scripts + README)`);
  process.exit(0);
}

// ── decode helpers ───────────────────────────────────────────────────────────
function decodeWavFile(p) {
  const bytes = new Uint8Array(fs.readFileSync(p));
  // RIFF/WAVE PCM16 via the engine's own decoder
  const { decodeWavPcm16 } = require(path.join(BUILD, 'beds.js'));
  const d = decodeWavPcm16(bytes);
  if (!d) throw new Error(`${path.basename(p)} is not a 16-bit PCM WAV — re-export from Audacity as WAV (16-bit PCM)`);
  return d;
}
function decodeAnyFile(p) {
  if (p.endsWith('.wav')) {
    const d = decodeWavFile(p);
    return { samples: d.L, sampleRate: d.sampleRate };
  }
  if (!hasFfmpeg) throw new Error('non-WAV input needs ffmpeg on PATH');
  const buf = execSync(`ffmpeg -v error -i "${p}" -f s16le -ac 1 -ar 48000 -`, { maxBuffer: 1 << 28 });
  const n = buf.length / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return { samples: out, sampleRate: 48000 };
}
/** linear-resample a mono Float32 buffer to a target duration (seconds). */
function fitToDuration(samples, srcRate, targetSec) {
  const srcSec = samples.length / srcRate;
  const ratio = srcSec / targetSec;
  if (Math.abs(ratio - 1) < 0.02) return { samples, stretched: false, drift: ratio };
  const outN = Math.round(targetSec * srcRate);
  const out = new Float32Array(outN);
  for (let i = 0; i < outN; i++) {
    const p = i * ratio;
    const p0 = Math.min(samples.length - 1, p | 0);
    const p1 = Math.min(samples.length - 1, p0 + 1);
    out[i] = samples[p0] + (samples[p1] - samples[p0]) * (p - p0);
  }
  return { samples: out, stretched: true, drift: ratio };
}

// ── mode 2: MERGE ────────────────────────────────────────────────────────────
if (MERGE) {
  const fittedDir = path.join(OUT_DIR, 'fitted');
  fs.mkdirSync(fittedDir, { recursive: true });
  const outManifest = { chapter: CHAPTER, lines: {} };
  let done = 0, flagged = 0;
  for (const l of chapterLines) {
    const src = path.join(OUT_DIR, `${l.id}.wav`);
    if (!fs.existsSync(src)) continue;
    const { samples, sampleRate } = decodeAnyFile(src);
    // trim leading/trailing silence (keep 60ms heads/tails)
    let a = 0, b = samples.length - 1;
    const thr = 0.004;
    while (a < b && Math.abs(samples[a]) < thr) a++;
    while (b > a && Math.abs(samples[b]) < thr) b--;
    const trimmed = samples.slice(Math.max(0, a - 0.06 * sampleRate), Math.min(samples.length, b + 0.06 * sampleRate));
    const targetSec = l.durMs / 1000;
    const { samples: fitted, stretched, drift } = fitToDuration(trimmed, sampleRate, targetSec);
    if (Math.abs(drift - 1) > 0.12) {
      console.warn(`  ⚠ ${l.id}: drift ${(drift * 100 - 100).toFixed(0)}% — time-fit applied, but RE-RECORD this line (stretch artefacts above ±12%)`);
      flagged++;
    }
    // write fitted wav (48k mono)
    const out48 = sampleRate === 48000 ? fitted : (() => {
      const r = sampleRate / 48000; const n = Math.floor(fitted.length / r);
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) { const p = i * r; o[i] = fitted[p | 0] ?? 0; }
      return o;
    })();
    fs.writeFileSync(path.join(fittedDir, `${l.id}.wav`), encodeWavPcm16(out48, out48, 48000));
    outManifest.lines[l.id] = {
      file: `voice-ab/ch${CHAPTER}/fitted/${l.id}.wav`,
      durationMs: l.durMs,
      words: manifest.lines[l.id].words,
      stretched,
      driftPct: Math.round((drift - 1) * 100),
    };
    done++;
  }
  if (!done) {
    console.error(`no <id>.wav recordings found in ${path.relative(REPO, OUT_DIR)} — record first (see the README there)`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(REPO, 'voice-ab', 'voice-ab-manifest.json'), JSON.stringify(outManifest, null, 2));
  console.log(`MERGE → ${done} lines fitted (${flagged} flagged for re-record) · voice-ab/voice-ab-manifest.json`);
  if (!RENDER) process.exit(0);
}

// ── mode 3: RENDER the A/B through the engine's own mixer ────────────────────
if (RENDER) {
  const abManifestPath = path.join(REPO, 'voice-ab', 'voice-ab-manifest.json');
  if (!fs.existsSync(abManifestPath)) {
    console.error('run --merge first (voice-ab/voice-ab-manifest.json missing)');
    process.exit(1);
  }
  const ab = JSON.parse(fs.readFileSync(abManifestPath, 'utf8'));
  const chStart = chRange.startMs / 1000;
  const chDur = (chRange.endMs - chRange.startMs) / 1000 + 2;

  // arm A: TTS (mp3s decoded via ffmpeg when available)
  const voA = new Map();
  if (hasFfmpeg) {
    for (const l of chapterLines) {
      const key = manifest.lines[l.id].key;
      const mp3 = path.join(TTS_DIR, `${key}.mp3`);
      if (!fs.existsSync(mp3)) continue;
      const { samples } = decodeAnyFile(mp3);
      const buf = new FakeAudioBuffer(1, samples.length, 48000);
      buf.getChannelData(0).set(samples);
      voA.set(l.id, buf);
    }
  }
  // arm B: the fitted human recordings
  const voB = new Map();
  for (const [id, meta] of Object.entries(ab.lines)) {
    const p = path.join(REPO, meta.file);
    if (!fs.existsSync(p)) continue;
    const { samples } = decodeAnyFile(p);
    const buf = new FakeAudioBuffer(1, samples.length, 48000);
    buf.getChannelData(0).set(samples);
    voB.set(id, buf);
  }
  console.log(`arm A (TTS): ${voA.size} lines · arm B (human): ${voB.size} lines`);

  for (const [name, vo] of [['A-tts', voA], ['B-human', voB]]) {
    const mix = await renderMix({
      timeline: tl, voBuffers: vo, bgmVolume: 0.55, voVolume: 0.9,
      onProgress: (f, label) => { if (f >= 0.9) console.log(`  [${name}] ${label}`); },
    });
    const sr = mix.sampleRate;
    const n0 = Math.floor(chStart * sr);
    const n = Math.min(mix.length - n0, Math.floor(chDur * sr));
    const L = mix.getChannelData(0).subarray(n0, n0 + n);
    const R = mix.getChannelData(1).subarray(n0, n0 + n);
    const out = path.join(OUT_DIR, `${name}.wav`);
    fs.writeFileSync(out, encodeWavPcm16(Float32Array.from(L), Float32Array.from(R), sr));
    console.log(`RENDER → ${path.relative(REPO, out)} (${(n / sr).toFixed(1)}s)`);
  }
  console.log('\nListen to both, same timeline, same score. If B wins → wire the fitted files in as the hybrid.');
}
process.exit(0);
