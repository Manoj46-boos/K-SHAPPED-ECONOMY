/**
 * feed320 — downsample any evidence frame to 320-px phone-feed width
 * (the scale at which high-RPM feed viewers judge the frame).
 * Usage: node tools/feed320.mjs <in.png> <out.png>
 */
import fs from 'node:fs';
import { createCanvas, loadImage } from 'canvas';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('usage: node feed320.mjs <in.png> <out.png>'); process.exit(1); }
const img = await loadImage(inPath);
const w = 320;
const h = Math.round(img.height * (w / img.width));
const c = createCanvas(w, h);
const ctx = c.getContext('2d');
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(img, 0, 0, w, h);
fs.writeFileSync(outPath, c.toBuffer('image/png'));
console.log(`saved ${outPath} (${w}x${h})`);
