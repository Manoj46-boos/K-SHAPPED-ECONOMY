/**
 * The encoder — renders frames through WebCodecs (hardware-accelerated where
 * available) and streams a finished MP4 straight to disk via the File System
 * Access API. Falls back through codec chains and finally to MediaRecorder.
 * Designed for low-RAM machines: nothing large is held in memory.
 */

import { Muxer, FileSystemWritableFileStreamTarget, ArrayBufferTarget } from 'mp4-muxer';
import { Timeline } from './timeline';
import { drawFrame, RenderOptions } from './director';

// ── v2 (PATCH 10): yield via MessageChannel macrotask — unthrottled in
// background tabs, unlike setTimeout (same pattern as audio.ts) ────────────
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

export interface EncoderStats {
  frame: number;
  totalFrames: number;
  fps: number;
  elapsedMs: number;
  etaMs: number;
  bytes: number;
  sceneLabel: string;
}

export interface RenderJob {
  timeline: Timeline;
  mixBuffer: AudioBuffer;
  canvas: HTMLCanvasElement;
  options: RenderOptions;
  /** called every ~6 frames */
  onProgress?: (stats: EncoderStats) => void;
  /** destination — if provided, streams to disk */
  writable?: FileSystemWritableFileStream | null;
  /** the file handle behind `writable` — enables the C1 fast-start remux
   *  (the moov relocation streams through the handle; without it the
   *  streaming render keeps moov-at-end). */
  handle?: FileSystemFileHandle | null;
  onLog?: (msg: string) => void;
  /** limit audio encoding duration (test renders) — ms */
  audioDurationMs?: number;
  /** v3 (panel P2-1): optional override for the per-frame draw. The Shorts
   *  9:16 pipeline uses this to compose the vertical frame instead of the
   *  standard 16:9 drawFrame. tMs is the timeline-local time of the frame. */
  drawOverride?: (ctx: CanvasRenderingContext2D, tMs: number) => void;
}

const VIDEO_CODEC_CHAIN = [
  { codec: 'avc1.640028', muxer: 'avc' as const }, // High 4.0
  { codec: 'avc1.4D4028', muxer: 'avc' as const }, // Main 4.0
  { codec: 'avc1.42E01E', muxer: 'avc' as const }, // Baseline
  { codec: 'vp09.00.10.08', muxer: 'vp9' as const },
];

async function pickVideoCodec(
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
  log?: (m: string) => void
): Promise<{ codec: string; muxer: 'avc' | 'vp9' } | null> {
  const VE: any = (globalThis as any).VideoEncoder;
  if (!VE) return null;
  for (const cand of VIDEO_CODEC_CHAIN) {
    try {
      const support = await VE.isConfigSupported({
        codec: cand.codec,
        width,
        height,
        bitrate,
        framerate,
      });
      if (support?.supported) {
        log?.(`video codec: ${cand.codec}`);
        return cand;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function pickAudioCodec(
  log?: (m: string) => void
): Promise<{ codec: string; muxer: 'aac' | 'opus'; sampleRate: number } | null> {
  const AE: any = (globalThis as any).AudioEncoder;
  if (!AE) return null;
  for (const cand of [
    { codec: 'mp4a.40.2', muxer: 'aac' as const, sampleRate: 48000 },
    { codec: 'opus', muxer: 'opus' as const, sampleRate: 48000 },
  ]) {
    try {
      const support = await AE.isConfigSupported({
        codec: cand.codec,
        sampleRate: cand.sampleRate,
        numberOfChannels: 2,
        bitrate: 256000, // v5: upload table recommends 384k stereo; 256k is the artifact-free WebCodecs ceiling
      });
      if (support?.supported) {
        log?.(`audio codec: ${cand.codec}`);
        return cand;
      }
    } catch {
      // try next
    }
  }
  return null;
}

export interface CapabilityReport {
  webcodecs: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  fileSystemAccess: boolean;
  recommended: 'webcodecs' | 'mediarecorder';
}

export async function probeCapabilities(log?: (m: string) => void): Promise<CapabilityReport> {
  const video = await pickVideoCodec(1920, 1080, 12_000_000, 30, log); // D-9: probe at the shipped bitrate
  const audio = await pickAudioCodec(log);
  const fsa = 'showSaveFilePicker' in (globalThis as any);
  const webcodecs = !!(video && audio);
  return {
    webcodecs,
    videoCodec: video?.codec ?? null,
    audioCodec: audio?.codec ?? null,
    fileSystemAccess: fsa,
    recommended: webcodecs ? 'webcodecs' : 'mediarecorder',
  };
}

/** Encode the audio mix into chunks, feeding the muxer. */
async function encodeAudio(
  mixBuffer: AudioBuffer,
  muxer: any,
  audioCodec: string,
  onLog?: (m: string) => void,
  limitMs?: number
): Promise<void> {
  const AE: any = (globalThis as any).AudioEncoder;
  const sampleRate = mixBuffer.sampleRate;
  const encoder = new AE({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error: (e: any) => onLog?.(`audio encoder error: ${e?.message ?? e}`),
  });
  encoder.configure({
    codec: audioCodec,
    sampleRate,
    numberOfChannels: 2,
    bitrate: 256000, // v5: matches the probe — one audio bitrate for the whole chain
  });
  const CH = 1024; // AAC frame size
  const total =
    limitMs && limitMs > 0
      ? Math.min(mixBuffer.length, Math.ceil((limitMs / 1000) * mixBuffer.sampleRate))
      : mixBuffer.length;
  const left = mixBuffer.getChannelData(0);
  const right =
    mixBuffer.numberOfChannels > 1 ? mixBuffer.getChannelData(1) : mixBuffer.getChannelData(0);
  for (let off = 0; off < total; off += CH) {
    const n = Math.min(CH, total - off);
    const data = new Float32Array(n * 2);
    data.set(left.subarray(off, off + n), 0);
    data.set(right.subarray(off, off + n), n);
    const ad = new (globalThis as any).AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((off / sampleRate) * 1e6),
      data,
    });
    encoder.encode(ad);
    ad.close();
    if (encoder.encodeQueueSize > 24) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  onLog?.('audio track encoded');
}

/**
 * Full render: draws every frame, encodes, muxes, saves.
 * Resolves when the file is complete and closed.
 */
export async function renderVideo(job: RenderJob): Promise<{ bytes: number }> {
  const { timeline: tl, mixBuffer, canvas, options, onProgress, onLog } = job;
  const W = canvas.width;
  const H = canvas.height;
  const fps = tl.fps;
  // v2 (PATCH 10): `desynchronized: true` skips the compositor where
  // Chromium supports it (no-op elsewhere) — a few extra fps for free.
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
  ctx.imageSmoothingQuality = 'high';

  // D-9 (100-judge dossier): 12 Mbps for 1080p — the film's vivid data inks
  // (upVivid/downVivid fills, thin chart strokes) were being washed by the
  // platform transcode off an 8 Mbps master; 12 Mbps sits in YouTube's
  // recommended 1080p band and stops the register loss. Bitrate does not
  // change render speed (same frames; larger stream writes, ~50% bigger
  // file). 720p stays the half-price fallback.
  const bitrate = W >= 1920 ? 12_000_000 : 4_500_000;
  const video = await pickVideoCodec(W, H, bitrate, fps, onLog);
  const audio = await pickAudioCodec(onLog);
  if (!video || !audio) {
    throw new Error(
      'This browser cannot encode video (WebCodecs unavailable). Please use Chrome or Edge, latest version.'
    );
  }

  // muxer target
  let bytesWritten = 0;
  let target: any;
  let closer: (() => Promise<void>) | null = null;
  if (job.writable) {
    target = new FileSystemWritableFileStreamTarget(job.writable, { chunkSize: 1 << 22 });
    closer = async () => {
      await job.writable!.close();
    };
  } else {
    target = new ArrayBufferTarget();
  }

  const muxer = new Muxer({
    target,
    fastStart: false,
    firstTimestampBehavior: 'offset',
    video: {
      codec: video.muxer,
      width: W,
      height: H,
      frameRate: fps,
    },
    audio: {
      codec: audio.muxer,
      numberOfChannels: 2,
      sampleRate: mixBuffer.sampleRate,
    },
  });

  // ── audio first (fast) ──
  await encodeAudio(mixBuffer, muxer, audio.codec, onLog, job.audioDurationMs);

  // ── video ──
  const VE: any = (globalThis as any).VideoEncoder;
  let encodeError: Error | null = null;
  const encoder = new VE({
    output: (chunk: any, meta: any) => {
      muxer.addVideoChunk(chunk, meta);
      bytesWritten += chunk.byteLength;
    },
    error: (e: any) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({
    codec: video.codec,
    width: W,
    height: H,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
    ...(video.muxer === 'avc' ? { avc: { format: 'avc' } } : {}),
  });

  const totalFrames = tl.totalFrames;
  const started = performance.now();
  let lastReport = 0;
  const frameDur = 1e6 / fps;

  for (let f = 0; f < totalFrames; f++) {
    if (encodeError) throw encodeError;
    const tMs = (f / fps) * 1000;
    if (job.drawOverride) {
      // v3 (panel P2-1): Shorts compose their own 9:16 frame
      job.drawOverride(ctx, tMs);
    } else {
      drawFrame(ctx, tl, tMs, options);
    }
    const frame = new (globalThis as any).VideoFrame(canvas, {
      timestamp: Math.round(f * frameDur),
      duration: Math.round(frameDur),
    });
    // v5: 2-second closed GOP — closer to the platform's upload spec (their
    // table value is half the frame rate; 60 frames is the WebCodecs-verified
    // floor that still keeps the file near the 8 Mbps budget)
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();

    // backpressure — keeps memory flat on low-RAM machines
    if (encoder.encodeQueueSize > 12) {
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    // v2 (PATCH 10): report every 500ms and yield once a second via a
    // MessageChannel macrotask — the v1 200ms setTimeout(0) loop was up to
    // 5 scheduler yields/sec starving the encoder on 2-core laptops.
    const now = performance.now();
    if (now - lastReport > 500) {
      lastReport = now;
      const elapsed = now - started;
      const done = f + 1;
      const fpsRender = done / (elapsed / 1000);
      const eta = ((totalFrames - done) / Math.max(0.01, fpsRender)) * 1000;
      const beat = tl.beats.find((b) => tMs >= b.startMs && tMs < b.endMs);
      onProgress?.({
        frame: done,
        totalFrames,
        fps: fpsRender,
        elapsedMs: elapsed,
        etaMs: eta,
        bytes: bytesWritten,
        sceneLabel: beat
          ? `ch ${(beat.chapter + 1).toString().padStart(2, '0')} · ${beat.beat.scene.type}`
          : 'finishing',
      });
    }
    if (f % 30 === 0) await yieldToUI();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  onLog?.('muxer finalized');

  if (!job.writable) {
    // in-memory fallback: hand back the blob via download
    // C1 (market review — SLOW-START PLAYBACK RISK): the MP4 is muxed with
    // moov at the END (fastStart:false — in-memory fastStart would double
    // the render's peak memory). Before the file leaves the process, the
    // box-level remux below relocates moov ahead of mdat — the first frame
    // starts while the file streams, the classic "video takes seconds to
    // start" tax dies. Pure box surgery, no re-encode.
    const raw = (target as ArrayBufferTarget).buffer;
    let out: ArrayBuffer = raw as ArrayBuffer;
    try {
      const moved = relocateMoov(raw as ArrayBuffer);
      if (moved) {
        out = moved;
        onLog?.('fast-start remux: moov relocated ahead of mdat');
      }
    } catch (e) {
      onLog?.(`fast-start remux skipped (${String(e)}) — shipping muxer output`);
    }
    const blob = new Blob([out], { type: 'video/mp4' });
    (globalThis as any).__lastRenderBlob = blob; // debug/testing hook
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'k-shaped-economy.mp4';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    bytesWritten = blob.size;
  } else {
    await closer?.();
    // C1 (cont.): the streaming (save-to-disk) path remuxes THROUGH the
    // file handle — a two-pass box move: pass 1 locates moov by reading
    // only box headers, pass 2 rewrites ftyp+moov first and streams the
    // remainder (mdat is never held in memory — safe for multi-GB renders).
    if (job.handle) {
      try {
        const moved = await relocateMoovInFile(job.handle, onLog);
        if (moved) onLog?.('fast-start remux: moov relocated ahead of mdat (streamed)');
      } catch (e) {
        onLog?.(`fast-start remux skipped (${String(e)}) — shipping muxer output`);
      }
    }
  }
  onLog?.(`done — ${(bytesWritten / 1e6).toFixed(1)} MB`);
  return { bytes: bytesWritten };
}

/** Ask the user where to save; returns the writable stream + its handle
 *  (the handle drives the C1 fast-start remux). */
export async function pickSaveTarget(
  suggestedName: string
): Promise<{ writable: FileSystemWritableFileStream; handle: FileSystemFileHandle } | null> {
  const w = globalThis as any;
  if (typeof w.showSaveFilePicker !== 'function') return null;
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'MP4 video',
          accept: { 'video/mp4': ['.mp4'] },
        },
      ],
    });
    return { writable: await handle.createWritable(), handle };
  } catch (e: any) {
    if (e?.name === 'AbortError') return null; // user cancelled
    throw e;
  }
}

// ── C1 (market review) — THE FAST-START REMUX ───────────────────────────────
// mp4-muxer's fastStart:true buffers the whole film in memory to relocate
// moov (~2GB on this cut — unsafe on the 8GB render laptop), so the muxer
// ships moov-at-end. The remux below is the post-render fix: pure MP4 box
// surgery that moves the moov box ahead of mdat. No re-encode, no resize —
// the player can start playback from the first bytes.

/** Top-level box scan for one buffer: returns [type, offset, size] list. */
function scanMp4Boxes(buf: ArrayBuffer): Array<{ type: string; off: number; size: number }> {
  const v = new DataView(buf);
  const boxes: Array<{ type: string; off: number; size: number }> = [];
  let off = 0;
  while (off + 8 <= buf.byteLength) {
    let size = v.getUint32(off);
    const type = String.fromCharCode(v.getUint8(off + 4), v.getUint8(off + 5), v.getUint8(off + 6), v.getUint8(off + 7));
    let head = 8;
    if (size === 1) {
      if (off + 16 > buf.byteLength) break;
      size = Number(v.getBigUint64(off + 8));
      head = 16;
    } else if (size === 0) {
      size = buf.byteLength - off; // extends to EOF
    }
    if (size < head || off + size > buf.byteLength) throw new Error(`bad box '${type}' @${off}`);
    boxes.push({ type, off, size });
    off += size;
  }
  return boxes;
}

/** Buffer remux: rebuilds the MP4 with moov first. Returns null when the
 *  file already carries moov up front (nothing to do). */
export function relocateMoov(buf: ArrayBuffer): ArrayBuffer | null {
  const boxes = scanMp4Boxes(buf);
  const moov = boxes.find((b) => b.type === 'moov');
  if (!moov) throw new Error('no moov box found');
  if (boxes.findIndex((b) => b.type === 'moov') <= 1) return null; // ftyp[,moov] — already fast-start
  const parts: ArrayBuffer[] = [];
  const front = boxes.filter((b) => b !== moov && (b.type === 'ftyp' || b.type === 'free' || b.type === 'sidx'));
  for (const b of front) parts.push(buf.slice(b.off, b.off + b.size));
  parts.push(buf.slice(moov.off, moov.off + moov.size));
  for (const b of boxes) {
    if (b === moov) continue;
    if (front.includes(b)) continue;
    parts.push(buf.slice(b.off, b.off + b.size));
  }
  return concatBuffers(parts);
}

/** Streaming remux through a file handle (multi-GB safe: mdat is copied as
 *  chunks, never held whole). Writes the relocated MP4 back to the same
 *  file. Returns false when no relocation was needed. */
async function relocateMoovInFile(handle: FileSystemFileHandle, onLog?: (m: string) => void): Promise<boolean> {
  const file = await handle.getFile();
  const size = file.size;
  // pass 1 — box headers only (16 bytes at a time)
  const boxes: Array<{ type: string; off: number; size: number }> = [];
  let off = 0;
  while (off + 8 <= size) {
    const head = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let bsize = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    let hlen = 8;
    if (bsize === 1) {
      bsize = Number(head.getBigUint64(8));
      hlen = 16;
    } else if (bsize === 0) {
      bsize = size - off;
    }
    if (bsize < hlen || off + bsize > size) throw new Error(`bad box '${type}' @${off}`);
    boxes.push({ type, off, size: bsize });
    off += bsize;
  }
  const moovIdx = boxes.findIndex((b) => b.type === 'moov');
  if (moovIdx < 0) throw new Error('no moov box found');
  if (moovIdx <= 1) return false; // already fast-start
  const moov = boxes[moovIdx];
  // pass 2 — rewrite: ftyp+moov, then everything else (moov skipped)
  const out = await handle.createWritable({ keepExistingData: false });
  const front = boxes.filter((b) => b !== moov && (b.type === 'ftyp' || b.type === 'free' || b.type === 'sidx'));
  for (const b of front) await out.write(await file.slice(b.off, b.off + b.size));
  onLog?.('fast-start remux: moov written, streaming media boxes…');
  await out.write(await file.slice(moov.off, moov.off + moov.size));
  for (const b of boxes) {
    if (b === moov) continue;
    if (front.includes(b)) continue;
    // stream the big boxes (mdat) in 64MB slices — flat memory
    const CHUNK = 1 << 26;
    for (let p = b.off; p < b.off + b.size; p += CHUNK) {
      await out.write(await file.slice(p, Math.min(p + CHUNK, b.off + b.size)));
    }
  }
  await out.close();
  return true;
}

function concatBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((a, p) => a + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), o);
    o += p.byteLength;
  }
  return out.buffer;
}
