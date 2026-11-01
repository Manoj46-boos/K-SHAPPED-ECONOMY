// Visual verification: seek preview to many timestamps, sample canvas pixels.
// Run inside the page via agent-browser eval (an IIFE string is injected).
(() => {
  const inp = document.querySelector('input[type=range]');
  if (!inp) return 'NO-SLIDER';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const canvas = document.querySelector('canvas');
  const results = [];
  const sampleAt = (tMs) => {
    setter.call(inp, String(tMs));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { sampleAt, canvasReady: !!canvas, canvasW: canvas?.width, canvasH: canvas?.height };
})()
