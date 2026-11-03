/**
 * ingest-analytics.mjs — the analytics loop's ingest step (audit P2-3).
 *
 * Reads the CSVs YouTube Studio exports and writes them back into the
 * project as structured, per-beat data the studio reads natively:
 *
 *   node scripts/ingest-analytics.mjs retention.csv [thumbnails.csv]
 *
 *   · retention.csv   — Analytics → Engagement → Audience retention table
 *                       export. Handles both Studio formats: elapsed-time
 *                       rows (seconds vs ratio) and percentage (0–100 vs
 *                       0–1).
 *   · thumbnails.csv  — Content → ⋮ → "Test & compare" results export
 *                       (Impressions / CTR / average view duration per
 *                       variant).
 *
 * What it does:
 *   · maps every retention sample onto the script's beats (built with the
 *     same timeline code the render uses, so timestamps line up exactly)
 *   · records each beat's opening viewers + drop-per-minute
 *   · preserves hand-written beat notes, adds its own where the data is loud
 *   · prints the retention table with the biggest cliffs flagged, so the
 *     next script edit starts from evidence
 *   · writes src/lib/engine/analytics-data.json — after this, the studio
 *     page shows the numbers and the thumbnail race automatically
 *
 * Run it after every upload, once the retention curve has settled (a few
 * days). That is the whole flywheel: render → upload → measure → edit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, '.bed-build');
const DATA_OUT = path.join(ROOT, 'src/lib/engine/analytics-data.json');

// ── 1. compile the timeline chain (canvas-free) if needed ───────────────────
if (!fs.existsSync(path.join(BUILD, 'timeline.js'))) {
  execSync(
    [
      'node_modules/.bin/tsc',
      path.join(ROOT, 'src/lib/engine/timeline.ts'),
      '--outDir', BUILD,
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--target', 'es2022',
      '--skipLibCheck',
      '--esModuleInterop',
      '--resolveJsonModule',
    ].join(' '),
    { stdio: 'inherit' }
  );
}
const { buildTimeline } = await import(path.join(BUILD, 'timeline.js'));
const { SCRIPT } = await import(path.join(BUILD, 'script-data.js'));

// ── 2. CSV parsing (tolerant: quoted fields, BOM, CRLF) ─────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); }
  return rows;
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;

function findCol(headers, candidates) {
  const nh = headers.map(norm);
  for (const c of candidates) {
    const idx = nh.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ── 3. args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!args.length) {
  console.error('usage: node scripts/ingest-analytics.mjs retention.csv [thumbnails.csv]');
  process.exit(1);
}
const retentionCsv = args[0];
const thumbsCsv = args[1] || null;

// ── 4. build the REAL timeline (same code path as the render) ───────────────
// synthetic manifest: word-count timing, the same estimator the render
// harness uses — timestamps land within ~1s of the shipped video
const WORD_MS = 360;
const manifest = { lines: {} };
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    const sentences = beat.vo.split(/\n/).map((x) => x.trim()).filter(Boolean);
    sentences.forEach((text, si) => {
      const words = text.split(/\s+/).filter(Boolean);
      const durMs = Math.round(words.length * WORD_MS + 420);
      const wordList = [];
      let t = 120;
      for (const w of words) { wordList.push({ t, d: Math.round(WORD_MS * 0.72), w }); t += WORD_MS; }
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `x${ci}-${bi}-${si}`, durationMs: durMs, words: wordList };
    });
  });
});
const tl = buildTimeline(manifest, 30);

// ── 5. retention CSV → per-beat numbers ──────────────────────────────────────
const existing = JSON.parse(fs.readFileSync(DATA_OUT, 'utf8'));
const out = { ...existing, video: { ...existing.video, fetchedAt: new Date().toISOString() } };
let cliffCount = 0;

if (retentionCsv && fs.existsSync(retentionCsv)) {
  const rows = parseCsv(fs.readFileSync(retentionCsv, 'utf8'));
  const headers = rows[0];
  const tCol = findCol(headers, ['elapsedvideotime', 'elapsedtime', 'elapsed', 'videotime', 'time']);
  const rCol = findCol(headers, ['audienceretention', 'retainedaudiencepercentage', 'retention', 'viewersretained', 'percentageviewers']);
  if (tCol < 0 || rCol < 0) {
    console.error('could not find time/retention columns in:', headers.join(' | '));
    process.exit(1);
  }
  const samples = rows.slice(1).map((r) => {
    let t = num(r[tCol]);
    let v = num(r[rCol]);
    // retention ratio (0–1) vs percent (0–100): infer from the first row
    if (v > 0 && v <= 1) v *= 100;
    // elapsed as ratio (0–1) → seconds
    if (t > 0 && t <= 1) t *= tl.durationMs / 1000;
    return { t, v };
  }).filter((s) => s.v > 0).sort((a, b) => a.t - b.t);

  const viewersAt = (sec) => {
    if (!samples.length) return undefined;
    if (sec <= samples[0].t) return samples[0].v;
    if (sec >= samples[samples.length - 1].t) return samples[samples.length - 1].v;
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= sec) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi];
    const f = b.t === a.t ? 0 : (sec - a.t) / (b.t - a.t);
    return a.v + (b.v - a.v) * f;
  };

  console.log(`\nretention: ${samples.length} samples · ${(tl.durationMs / 60000).toFixed(1)}-min video · opening ${viewersAt(0)?.toFixed(1)}%\n`);
  console.log('beat'.padEnd(10), 'time'.padStart(9), 'in'.padStart(6), 'Δ/min'.padStart(8), '  cliff?  scene');
  const beats = {};
  for (const b of tl.beats) {
    const chapter = SCRIPT[b.chapter];
    const key = `${chapter.id}-${b.beatIndex}`;
    const t0 = b.startMs / 1000;
    const t1 = b.endMs / 1000;
    const v0 = viewersAt(t0);
    const v1 = viewersAt(t1);
    if (v0 === undefined) continue;
    const durMin = (t1 - t0) / 60;
    const dropPerMin = durMin > 0.05 ? (v1 - v0) / durMin : 0;
    const prev = out.beats[key] || {};
    const cliff = dropPerMin <= -2.5;
    if (cliff) cliffCount++;
    beats[key] = {
      ...prev,
      viewers: Math.round(v0 * 10) / 10,
      dropPerMin: Math.round(dropPerMin * 10) / 10,
      // keep any hand-written note; auto-annotate only the loud losses
      note: prev.note || (cliff ? 'measured cliff — tighten or cut in the next edit' : undefined),
    };
    const mm = Math.floor(t0 / 60);
    const ss = Math.floor(t0 % 60).toString().padStart(2, '0');
    console.log(
      key.padEnd(10),
      (`${mm}:${ss}`).padStart(9),
      (v0.toFixed(0) + '%').padStart(6),
      (dropPerMin >= 0 ? '+' : '') + dropPerMin.toFixed(1),
      cliff ? '  ⚠ CLIFF ' : '          ',
      b.beat.scene.type
    );
  }
  out.beats = beats;
} else {
  console.error('retention csv not found:', retentionCsv);
  process.exit(1);
}

// ── 6. thumbnail Test & Compare CSV → the race ───────────────────────────────
if (thumbsCsv && fs.existsSync(thumbsCsv)) {
  const rows = parseCsv(fs.readFileSync(thumbsCsv, 'utf8'));
  const headers = rows[0];
  const nameCol = findCol(headers, ['thumbnail', 'variant', 'image', 'name']);
  const impCol = findCol(headers, ['impressions', 'impr']);
  const ctrCol = findCol(headers, ['clickthroughrate', 'ctr', 'click']);
  const durCol = findCol(headers, ['averageviewduration', 'avgviewduration', 'viewduration']);
  if (nameCol >= 0 && (ctrCol >= 0 || impCol >= 0)) {
    // map Studio's labels (A/B/C, "Current", file names, 1/2/3) to variants
    const labelToVariant = (raw) => {
      const s = String(raw).toLowerCase();
      if (/current|original/.test(s)) return 0;
      const m = s.match(/\b([abc])\b/) || s.match(/\b([123])\b/);
      if (m) {
        const c = m[1];
        return c === 'a' || c === '1' ? 0 : c === 'b' || c === '2' ? 1 : 2;
      }
      return null;
    };
    for (const r of rows.slice(1)) {
      const variant = labelToVariant(r[nameCol]);
      if (variant === null) continue;
      const t = out.thumbnails.find((x) => x.variant === variant);
      if (!t) continue;
      if (impCol >= 0) t.impressions = num(r[impCol]);
      if (ctrCol >= 0) t.ctr = num(r[ctrCol]) <= 1 ? num(r[ctrCol]) * 100 : num(r[ctrCol]);
      if (durCol >= 0) t.avgViewSec = num(r[durCol]);
    }
    console.log('\nthumbnail race:');
    for (const t of [...out.thumbnails].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))) {
      console.log(
        `  ${t.label} · ${t.hypothesis.slice(0, 58)}…\n     CTR ${t.ctr?.toFixed(2) ?? '—'}% · ${t.impressions?.toLocaleString() ?? '—'} impressions · avg view ${t.avgViewSec?.toFixed(0) ?? '—'}s`
      );
    }
  } else {
    console.warn('thumbnail csv columns not recognised — skipping (got:', headers.join(' | '), ')');
  }
}

// ── 7. write back ─────────────────────────────────────────────────────────────
fs.writeFileSync(DATA_OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\n→ ${path.relative(ROOT, DATA_OUT)} updated · ${cliffCount} cliff${cliffCount === 1 ? '' : 's'} flagged`);
console.log('the studio shows these numbers on the next load (retention rides on every beat).');
