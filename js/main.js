// main.js — bootstrap.
import { App } from './app.js';
import { bindPointer } from './pointer.js';

const stage = document.getElementById('stage');
const overlayCanvas = document.getElementById('overlay');

const app = new App({
  panel: document.getElementById('panel'),
  stage,
  inkCanvas: document.getElementById('ink'),
  overlayCanvas,
});

bindPointer(overlayCanvas, app);
window.spiralgraph = app; // handy for poking at from the dev console

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) app.resize(width, height);
}).observe(stage);
