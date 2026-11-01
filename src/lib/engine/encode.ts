/**
 * The encoder — renders frames through WebCodecs (hardware-accelerated where
 * available) and streams a finished MP4 straight to disk via the File System
 * Access API. Falls back through codec chains and finally to MediaRecorder.
 * Designed for low-RAM machines: nothing large is held in memory.
 */

import { Muxer, FileSystemWritableFileStreamTarget, ArrayBufferTarget } from 'mp4-muxer';
import { Timeline } from './timeline';
import { drawFrame, RenderOptions } from './director';

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
  onLog?: (msg: string) => void;
  /** limit audio encoding duration (test renders) — ms */
  audioDurationMs?: number;
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
        bitrate: 192000,
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
  const video = await pickVideoCodec(1920, 1080, 6_000_000, 30, log);
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
    bitrate: 192000,
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
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingQuality = 'high';

  const bitrate = W >= 1920 ? 6_000_000 : 3_200_000;
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
    drawFrame(ctx, tl, tMs, options);
    const frame = new (globalThis as any).VideoFrame(canvas, {
      timestamp: Math.round(f * frameDur),
      duration: Math.round(frameDur),
    });
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();

    // backpressure — keeps memory flat on low-RAM machines
    if (encoder.encodeQueueSize > 12) {
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    // yield to UI regularly
    const now = performance.now();
    if (now - lastReport > 200) {
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
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  onLog?.('muxer finalized');

  if (!job.writable) {
    // in-memory fallback: hand back the blob via download
    const blob = new Blob([(target as ArrayBufferTarget).buffer], { type: 'video/mp4' });
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
  }
  onLog?.(`done — ${(bytesWritten / 1e6).toFixed(1)} MB`);
  return { bytes: bytesWritten };
}

/** Ask the user where to save; returns the writable stream. */
export async function pickSaveTarget(
  suggestedName: string
): Promise<FileSystemWritableFileStream | null> {
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
    return await handle.createWritable();
  } catch (e: any) {
    if (e?.name === 'AbortError') return null; // user cancelled
    throw e;
  }
}
