import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { cacheDir } from '@/lib/server/tts-service';

export const runtime = 'nodejs';

/** Serves a cached TTS audio file. Keys are sha1-derived, reject anything unsafe. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!/^[a-f0-9]{6,64}$/.test(key)) {
    return NextResponse.json({ error: 'bad key' }, { status: 400 });
  }
  const file = path.join(cacheDir(), `${key}.mp3`);
  try {
    const buf = await readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
