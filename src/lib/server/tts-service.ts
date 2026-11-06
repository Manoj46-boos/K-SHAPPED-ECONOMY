/**
 * Premium voiceover service — Microsoft Edge neural TTS (free, human-like).
 * Generates per-sentence MP3 audio + word-level timing data (for karaoke captions
 * and gesture sync), with a disk cache so interrupted jobs resume instantly.
 */
import { EdgeTTS } from '@andresaya/edge-tts';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.render-assets', 'tts');
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

export interface TimedWord {
  /** milliseconds from start of this line's audio */
  t: number;
  /** duration in ms */
  d: number;
  w: string;
}

export interface LineResult {
  id: string;
  key: string;
  /** number of ms (estimated — client refines by decoding audio) */
  estDuration: number;
  words: TimedWord[];
  cached: boolean;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function lineKey(voice: string, rate: number, pitch: number, text: string): string {
  return createHash('sha1')
    .update(`${voice}|${rate}|${pitch}|${text}`)
    .digest('hex')
    .slice(0, 24);
}

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(key: string): Promise<LineResult | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${key}.json`), 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data.estDuration === 'number' && Array.isArray(data.words)) {
      return { id: data.id, key, estDuration: data.estDuration, words: data.words, cached: true };
    }
    return null;
  } catch {
    return null;
  }
}

async function synthesize(
  tts: EdgeTTS,
  id: string,
  text: string,
  voice: string,
  rate: number,
  pitch: number
): Promise<LineResult> {
  const key = lineKey(voice, rate, pitch, text);
  const cached = await readCache(key);
  if (cached) return cached;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await tts.generate(text, voice, {
        rate,
        pitch,
        volume: 0,
        outputFormat: OUTPUT_FORMAT,
        timeout: 90000,
      });
      const audio = Buffer.from(r.audio);
      if (audio.length < 512) throw new Error('audio too small — synthesis failed');
      const words: TimedWord[] = (r.wordBoundaries || []).map((wb: any) => ({
        t: Math.round(wb.offset / 10000),
        d: Math.round(wb.duration / 10000),
        w: unescapeXml(String(wb.text ?? '')),
      }));
      await ensureCacheDir();
      await writeFile(path.join(CACHE_DIR, `${key}.mp3`), audio);
      await writeFile(
        path.join(CACHE_DIR, `${key}.json`),
        JSON.stringify({ id, estDuration: r.duration ?? 0, words, text, voice, rate })
      );
      return { id, key, estDuration: r.duration ?? 0, words, cached: false };
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
  }
  throw new Error(
    `TTS synthesis failed for line "${text.slice(0, 60)}…": ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

/** Runs synthesis with bounded concurrency; fresh EdgeTTS per slot avoids socket reuse issues.
 *  v8: each line may override the voice (quoted characters) and carry
 *  rate/pitch deltas from its beat's voStyle — the cache key includes the
 *  resolved combination, so a Guy-voiced quote never collides with the
 *  same text in the narrator's voice. */
export interface SynthLine {
  id: string;
  text: string;
  voice?: string;
  rateDelta?: number;
  pitchDelta?: number;
}

export async function synthesizeLines(
  lines: SynthLine[],
  voice: string,
  rate: number,
  pitch: number,
  concurrency = 3,
  onProgress?: (done: number, total: number) => void
): Promise<LineResult[]> {
  const results = new Map<string, LineResult>();
  let cursor = 0;
  let done = 0;
  const total = lines.length;

  async function worker(): Promise<void> {
    const tts = new EdgeTTS({ timeout: 90000 });
    while (cursor < total) {
      const idx = cursor++;
      const line = lines[idx];
      // v8: resolve this line's effective vocal direction
      const lineVoice = line.voice || voice;
      const lineRate = rate + (Number.isFinite(line.rateDelta) ? (line.rateDelta as number) : 0);
      const linePitch = pitch + (Number.isFinite(line.pitchDelta) ? (line.pitchDelta as number) : 0);
      results.set(line.id, await synthesize(tts, line.id, line.text, lineVoice, lineRate, linePitch));
      done++;
      onProgress?.(done, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, total)) }, () => worker())
  );
  return lines.map((l) => {
    const r = results.get(l.id);
    if (!r) throw new Error(`missing synthesis result for ${l.id}`);
    return r;
  });
}

export function cacheDir(): string {
  return CACHE_DIR;
}
