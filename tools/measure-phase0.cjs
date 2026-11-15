/** Measure key strings at render sizes — Phase 0 fix calibration. */
const path = require('node:path');
const { registerFont } = require(path.resolve(__dirname, '..', 'node_modules', 'canvas'));
const { createCanvas } = require(path.resolve(__dirname, '..', 'node_modules', 'canvas'));
registerFont(path.resolve('public/fonts/Inter-400.ttf'), { family: 'Inter', weight: '400' });
registerFont(path.resolve('public/fonts/Inter-600.ttf'), { family: 'Inter', weight: '600' });
registerFont(path.resolve('public/fonts/Inter-700.ttf'), { family: 'Inter', weight: '700' });
const c = createCanvas(10, 10);
const ctx = c.getContext('2d');
const m = (t, s, w = 600) => { ctx.font = `${w} ${s}px Inter`; return Math.round(ctx.measureText(t).width); };
console.log('PRICE / GALLON @34/600 =', m('PRICE / GALLON', 34));
console.log('GAS @40/700 =', m('GAS', 40, 700));
console.log('GAS PRICE @34/600 =', m('GAS PRICE', 34));
console.log('/ GALLON @34/600 =', m('/ GALLON', 34));
console.log('$ / GAL @34/600 =', m('$ / GAL', 34));
console.log('PRICE/GAL @34/600 =', m('PRICE/GAL', 34));
console.log('--- stat labels @34/600 (panel inner = 641px) ---');
for (const s of ['S&P 500 · past year', 'Nasdaq · past year', 'corporate profit margins', 'called the economy “good” or “excellent”', 'average recession odds · 72 economists (WSJ)']) {
  console.log(`  "${s}" = ${m(s, 34)} ${m(s, 34) > 641 ? '<< OVERFLOW' : 'fits'} | wrap-measure@25 = ${m(s, 25)}`);
}
console.log('paychecks @34/600 =', m('paychecks', 34));
console.log('low-23,000s · March @46/600 =', m('low-23,000s · March', 46));
