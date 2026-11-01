// Test Edge TTS generation: audio + word boundaries
import { EdgeTTS } from '@andresaya/edge-tts';
import { writeFileSync } from 'fs';

async function main() {
  const tts = new EdgeTTS({ timeout: 60000 });
  try {
    const r = await tts.generate(
      "The S&P 500 is up eighteen point four percent. Same country, same year.",
      'en-US-AndrewMultilingualNeural',
      { rate: -4, outputFormat: 'audio-24khz-96kbitrate-mono-mp3' }
    );
    console.log('SUCCESS');
    console.log('format:', r.format);
    console.log('audio bytes:', r.audio?.byteLength || r.audio?.length);
    console.log('duration (est):', r.duration);
    console.log('wordBoundaries count:', r.wordBoundaries?.length);
    console.log('wordBoundaries sample:', JSON.stringify(r.wordBoundaries?.slice(0, 5), null, 2));
    console.log('sentenceBoundaries sample:', JSON.stringify(r.sentenceBoundaries?.slice(0, 2)));
    writeFileSync('/tmp/tts-test.mp3', Buffer.from(r.audio));
    console.log('wrote /tmp/tts-test.mp3');
  } catch (e) {
    console.error('FAILED:', e && e.message ? e.message : e);
    process.exit(1);
  }
}
main();
