// render.js — world<->screen view transform and drawing of the gear pieces.

import { TAU } from './geometry.js';
import { toWorld } from './rolling.js';

const PEN_HOLE_PX = 5;
const STYLE = {
  frameFill: 'rgba(110, 135, 175, 0.22)',
  frameStroke: 'rgba(55, 75, 110, 0.85)',
  tracerFill: 'rgba(255, 196, 70, 0.30)',
  tracerStroke: 'rgba(170, 110, 10, 0.9)',
  holeRing: '#ffffff',
  selectedRing: '#111111',
};

/** Math-style world coordinates (y up) centred on the canvas. */
export class View {
  constructor() {
    this.scale = 1;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  resize(canvases, width, height) {
    this.width = width;
    this.height = height;
    this.dpr = window.devicePixelRatio || 1;
    for (const canvas of canvases) {
      canvas.width = Math.round(width * this.dpr);
      canvas.height = Math.round(height * this.dpr);
    }
  }

  /** Scale so a disk of `radius` world units fits with a margin. */
  fit(radius) {
    if (!this.width || !this.height) return; // not laid out yet
    this.scale = (0.92 * Math.min(this.width, this.height)) / 2 / Math.max(1, radius);
  }

  apply(ctx) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, -k, (this.width / 2) * this.dpr, (this.height / 2) * this.dpr);
  }

  clear(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  toWorld(screenX, screenY) {
    return {
      x: (screenX - this.width / 2) / this.scale,
      y: -(screenY - this.height / 2) / this.scale,
    };
  }

  /** Convert a size in screen pixels to world units. */
  px(pixels) {
    return pixels / this.scale;
  }
}

/**
 * Trace a toothed outline of `shape` into the current path.
 * outward = +1 puts teeth outside the pitch line, -1 inside (rings).
 * phase = PI offsets the teeth half a pitch so meshing pieces interlock.
 */
function toothedPath(ctx, shape, { pitch, outward, phase = 0, pose = null }) {
  const height = pitch * 0.45;
  shape.sampleArcLengths(pitch / 8).forEach((s, i) => {
    const p = shape.at(s);
    const normal = p.angle - Math.PI / 2;
    const wave = Math.max(-1, Math.min(1, 1.8 * Math.cos((TAU * s) / pitch + phase)));
    const offset = outward * height * wave;
    const local = { x: p.x + offset * Math.cos(normal), y: p.y + offset * Math.sin(normal) };
    const w = pose ? toWorld(pose, local.x, local.y) : local;
    if (i === 0) ctx.moveTo(w.x, w.y);
    else ctx.lineTo(w.x, w.y);
  });
  ctx.closePath();
}

/** Smooth outline of `shape` pushed outward by `offset` (ring outer edge). */
function offsetPath(ctx, shape, offset) {
  shape.sampleArcLengths(shape.perimeter / 360).forEach((s, i) => {
    const p = shape.at(s);
    const normal = p.angle - Math.PI / 2;
    const x = p.x + offset * Math.cos(normal);
    const y = p.y + offset * Math.sin(normal);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function ringWidth(frame) {
  return Math.max(14, frame.circumradius * 0.12);
}

export function drawFrame(ctx, view, frame, mode, pitch) {
  view.apply(ctx);
  ctx.beginPath();
  if (mode === 'internal') {
    offsetPath(ctx, frame, ringWidth(frame));
    toothedPath(ctx, frame, { pitch, outward: -1 });
  } else {
    toothedPath(ctx, frame, { pitch, outward: 1 });
  }
  ctx.fillStyle = STYLE.frameFill;
  ctx.fill('evenodd');
  ctx.strokeStyle = STYLE.frameStroke;
  ctx.lineWidth = view.px(1.2);
  ctx.stroke();
}

export function drawTracer(ctx, view, tracer, pose, pitch) {
  view.apply(ctx);
  ctx.beginPath();
  toothedPath(ctx, tracer, { pitch, outward: 1, phase: Math.PI, pose });
  ctx.fillStyle = STYLE.tracerFill;
  ctx.fill();
  ctx.strokeStyle = STYLE.tracerStroke;
  ctx.lineWidth = view.px(1.2);
  ctx.stroke();

  // Small cross at the tracer's centre so its spin is easy to follow.
  const c = toWorld(pose, 0, 0);
  const arm = toWorld(pose, view.px(8), 0);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(arm.x, arm.y);
  ctx.arc(c.x, c.y, view.px(2), 0, TAU);
  ctx.stroke();
}

export function drawPens(ctx, view, pens, pose, selectedId) {
  view.apply(ctx);
  for (const pen of pens) {
    const w = toWorld(pose, pen.x, pen.y);
    const selected = pen.id === selectedId;
    ctx.beginPath();
    ctx.arc(w.x, w.y, view.px(selected ? PEN_HOLE_PX + 2 : PEN_HOLE_PX), 0, TAU);
    ctx.fillStyle = pen.color;
    ctx.fill();
    ctx.lineWidth = view.px(selected ? 2.5 : 1.5);
    ctx.strokeStyle = selected ? STYLE.selectedRing : STYLE.holeRing;
    ctx.stroke();
  }
}

/** Pen whose hole is under the world point, if any. */
export function penAt(view, pens, pose, point) {
  const reach = view.px(PEN_HOLE_PX + 4);
  return pens.find((pen) => {
    const w = toWorld(pose, pen.x, pen.y);
    return Math.hypot(w.x - point.x, w.y - point.y) <= reach;
  });
}
