import { NextRequest, NextResponse } from 'next/server';
import { synthesizeLines } from '@/lib/server/tts-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface TtsLine {
  id: string;
  text: string;
  /** v8: per-line voice override (quoted economists get their own voices) */
  voice?: string;
  /** v8: per-line rate/pitch deltas from the beat's voStyle direction */
  rateDelta?: number;
  pitchDelta?: number;
}

interface TtsBody {
  lines: TtsLine[];
  voice?: string;
  rate?: number;
  pitch?: number;
}

export async function POST(req: NextRequest) {
  let body: TtsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lines = Array.isArray(body?.lines) ? body.lines : null;
  if (!lines || lines.length === 0 || lines.length > 40) {
    return NextResponse.json({ error: '`lines` must contain 1–40 items' }, { status: 400 });
  }
  for (const l of lines) {
    if (typeof l?.id !== 'string' || typeof l?.text !== 'string' || !l.text.trim()) {
      return NextResponse.json({ error: 'each line needs `id` and non-empty `text`' }, { status: 400 });
    }
  }

  const voice = typeof body.voice === 'string' && body.voice ? body.voice : 'en-US-AndrewMultilingualNeural';
  const rate = Number.isFinite(body.rate) ? Number(body.rate) : -4;
  const pitch = Number.isFinite(body.pitch) ? Number(body.pitch) : 0;

  try {
    // v8 (panel P0-4): the batch carries per-line vocal direction. The
    // service resolves each line's effective (voice, rate, pitch) — base
    // settings + the beat's voStyle deltas + any per-beat voice override —
    // and caches per resolved combination, so quoted-voice lines and
    // narrator lines never collide in the cache.
    const results = await synthesizeLines(lines, voice, rate, pitch, 3);
    return NextResponse.json({
      ok: true,
      voice,
      rate,
      pitch,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'TTS generation failed' },
      { status: 500 }
    );
  }
}
