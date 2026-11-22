#!/usr/bin/env node
/**
 * remux-faststart.mjs — U12 (market review Table 5, fast-start delivery).
 *
 * The film encode (encode.ts) lands moov at the END on purpose: the
 * mp4-muxer's in-memory fastStart would buffer the whole film in RAM. The
 * fast-start step is THIS post-render shell remux instead — a stream-copy
 * that moves moov to the head in seconds of wall time at no RAM cost:
 *
 *   ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4
 *
 * Usage: node tools/remux-faststart.mjs <in.mp4> [out.mp4]
 *   (out defaults to <in>-faststart.mp4; refuses to run without ffmpeg)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [,, inArg, outArg] = process.argv;
if (!inArg || !fs.existsSync(inArg)) {
  console.error('usage: node tools/remux-faststart.mjs <in.mp4> [out.mp4]');
  process.exit(2);
}
const inPath = path.resolve(inArg);
const outPath = outArg
  ? path.resolve(outArg)
  : inPath.replace(/\.mp4$/i, '') + '-faststart.mp4';

const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  console.error('ffmpeg not found on PATH — install it for the fast-start step');
  process.exit(3);
}

const t0 = Date.now();
const r = spawnSync('ffmpeg', [
  '-y', '-i', inPath,
  '-c', 'copy',                 // stream-copy: no re-encode, seconds, no RAM
  '-movflags', '+faststart',    // moov to the head — streamable from byte 0
  '-movflags', '+use_metadata_tags',
  outPath,
], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr.split('\n').slice(-6).join('\n'));
  process.exit(1);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// verification: moov must sit in the FIRST kilobyte of the file
const head = fs.readFileSync(outPath).subarray(0, 1024);
const fast = head.includes(Buffer.from('moov'));
console.log(`${path.basename(inPath)} -> ${path.basename(outPath)}  remux ${secs}s  moov-at-head: ${fast ? 'YES' : 'NO'}`);
process.exit(fast ? 0 : 1);