// constraints.js — slider ranges that adapt to the other settings.
//
// The rules live in one place, isFeasible(). Each slider's range is then the
// set of whole numbers that keeps every rule true while all other settings
// stay put. Every rule is monotonic in every setting (bigger pieces = more
// teeth and more room, etc.), so that set is always one unbroken interval.
// A slider's range never depends on its own value, so dragging is stable.
// Pens follow the same idea with one rule: they stay on the tracer.

import { polygonCircumradius, polygonInradius } from './geometry.js';
import { MIN_TEETH, PIECE_RANGES, RANGES, lapsToClose, toothCount } from './pieces.js';

const SHRINK_STEP = 0.95;
const PULL_STEP = 0.01;
const MAX_SHRINKS = 100;

const circumradius = (piece) => polygonCircumradius(piece.sides, piece.sideLength) + piece.roundness;
const inradius = (piece) => polygonInradius(piece.sides, piece.sideLength) + piece.roundness;

/**
 * The rules:
 *  1. Every piece has at least MIN_TEETH[role] teeth.
 *  2. Internal mode: the tracer fits inside the ring with a tooth to spare.
 */
export function isFeasible({ mode, pitch, frame, tracer }) {
  if (toothCount(frame, pitch) < MIN_TEETH.frame) return false;
  if (toothCount(tracer, pitch) < MIN_TEETH.tracer) return false;
  return mode !== 'internal' || circumradius(tracer) + pitch <= inradius(frame);
}

/** Every slider range, keyed like the inputs ('frame.sides', 'pitch', ...). */
export function rangesFor(state, teeth) {
  const ranges = { ...RANGES };
  for (const [role, limits] of Object.entries(PIECE_RANGES)) {
    for (const [field, outer] of Object.entries(limits)) {
      const ok = (v) => isFeasible({ ...state, [role]: { ...state[role], [field]: v } });
      ranges[`${role}.${field}`] = feasibleRange(outer, ok);
    }
  }
  ranges.pitch = feasibleRange(RANGES.pitch, (v) => isFeasible({ ...state, pitch: v }));
  ranges.startTooth = [0, teeth.frame - 1];
  ranges.tracerTooth = [0, teeth.tracer - 1];
  ranges.laps = [1, lapsToClose(teeth.frame, teeth.tracer)];
  return ranges;
}

/**
 * Pen x/y slider ranges: whole positions that stay on the tracer while the
 * other coordinate stays put (the tracer is convex, so each is one interval).
 */
export function penRanges(tracer, pen) {
  const reach = Math.ceil(tracer.circumradius);
  return {
    x: feasibleRange([-reach, reach], (x) => tracer.contains(x, pen.y)),
    y: feasibleRange([-reach, reach], (y) => tracer.contains(pen.x, y)),
  };
}

/** Nearest whole position on the tracer along the line to its centre. */
export function pullInside(tracer, { x, y }) {
  for (let k = 1; k > 0; k -= PULL_STEP) {
    const point = { x: Math.round(x * k), y: Math.round(y * k) };
    if (tracer.contains(point.x, point.y)) return point;
  }
  return { x: 0, y: 0 }; // the centre is always on the tracer
}

/** Smallest and largest whole value in `outer` for which `ok` holds. */
function feasibleRange([min, max], ok) {
  let low = null;
  let high = null;
  for (let v = min; v <= max; v++) {
    if (!ok(v)) continue;
    low ??= v;
    high = v;
  }
  // Nothing feasible (only in degenerate states): leave the slider free so
  // the user can steer back out rather than being stuck.
  return low === null ? [min, max] : [low, high];
}

/**
 * Make an infeasible state feasible after a change sliders can't guard
 * (e.g. switching to internal mode with a big tracer): shrink the tracer,
 * keeping its proportions, until it fits. Returns the (possibly new) tracer.
 */
export function fitTracer(state) {
  let tracer = state.tracer;
  for (let i = 0; i < MAX_SHRINKS && !isFeasible({ ...state, tracer }); i++) {
    tracer = {
      sides: tracer.sides,
      sideLength: Math.floor(tracer.sideLength * SHRINK_STEP),
      roundness: Math.max(1, Math.floor(tracer.roundness * SHRINK_STEP)),
    };
  }
  return isFeasible({ ...state, tracer }) ? tracer : state.tracer;
}
