/**
 * Pixel-diff gate — the panel's demanded assertion: an AFTER frame that is
 * identical (or near-identical) to its BEFORE twin must never ship as fix
 * evidence. Usage: node tools/diff-gate.cjs <dir> <threshold%>
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require(path.resolve(__dirname, '..', 'node_modules', 'canvas'));

const DIR = process.argv[2];
const TH = Number(process.argv[3] || 0.05); // % pixels changed to pass
(async () => {
  const befores = fs.readdirSync(DIR).filter((f) => f.startsWith('BEFORE_'));
  let fail = 0;
  for (const b of befores) {
    const a = 'AFTER_' + b.slice(7);
    if (!fs.existsSync(path.join(DIR, a))) { console.log(`MISSING ${a}`); fail++; continue; }
    const [ib, ia] = await Promise.all([loadImage(path.join(DIR, b)), loadImage(path.join(DIR, a))]);
    if (ib.width !== ia.width || ib.height !== ia.height) { console.log(`SIZE ${b}`); fail++; continue; }
    const c = createCanvas(ib.width, ib.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(ib, 0, 0);
    const d1 = ctx.getImageData(0, 0, ib.width, ib.height).data;
    ctx.clearRect(0, 0, ib.width, ib.height);
    ctx.drawImage(ia, 0, 0);
    const d2 = ctx.getImageData(0, 0, ia.width, ia.height).data;
    let changed = 0;
    const total = ib.width * ib.height;
    for (let i = 0; i < d1.length; i += 16) { // sample every 4th px
      if (Math.abs(d1[i] - d2[i]) > 12 || Math.abs(d1[i + 1] - d2[i + 1]) > 12 || Math.abs(d1[i + 2] - d2[i + 2]) > 12) changed++;
    }
    const pct = (changed / total * 100);
    const ok = pct >= TH;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${b.slice(7)} delta=${pct.toFixed(2)}%`);
  }
  console.log(fail ? `GATE: ${fail} failure(s)` : 'GATE: all pairs show real change');
  process.exit(fail ? 1 : 0);
})();
