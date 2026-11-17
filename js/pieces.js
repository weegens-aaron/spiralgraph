// pieces.js — the whole-number piece model and every slider range.
//
// A piece is three integers in absolute length units, like a real plastic part:
//   sides       number of straight sides
//   sideLength  length of each straight side
//   roundness   corner radius (corner roundedness)
// Its tooth count follows from its size and the shared tooth size (pitch):
//   teeth = round(perimeter / pitch)
// Bigger teeth => fewer of them on the same piece => a different pattern.
// For exact meshing the shape is then scaled (by < half a tooth) so that
// perimeter === teeth * pitch exactly.

import { TAU } from './geometry.js';

/** Fewest teeth a piece may have (enforced by constraints.js). */
export const MIN_TEETH = { frame: 12, tracer: 6 };

/** Outer [min, max] for every piece slider, per role (constraints.js narrows these). */
export const PIECE_RANGES = {
  frame: { sides: [2, 12], sideLength: [0, 300], roundness: [1, 250] },
  tracer: { sides: [2, 12], sideLength: [0, 150], roundness: [1, 150] },
};

/** Outer [min, max] for the other sliders. */
export const RANGES = {
  pitch: [2, 20],
  speed: [1, 20],
  penWidth: [1, 10],
};

/** Clamp a piece's sliders to whole numbers in range. */
export function normalizePiece(piece, role) {
  const limits = PIECE_RANGES[role];
  return {
    sides: clampInt(piece.sides, ...limits.sides),
    sideLength: clampInt(piece.sideLength, ...limits.sideLength),
    roundness: clampInt(piece.roundness, ...limits.roundness),
  };
}

export const nominalPerimeter = ({ sides, sideLength, roundness }) => sides * sideLength + TAU * roundness;

export function toothCount(piece, pitch) {
  return Math.max(1, Math.round(nominalPerimeter(piece) / pitch));
}

/** Geometry for Shape, snapped so perimeter === teeth * pitch exactly. */
export function shapeParams(piece, pitch) {
  const snap = (toothCount(piece, pitch) * pitch) / nominalPerimeter(piece);
  return { sides: piece.sides, sideLength: piece.sideLength * snap, cornerRadius: piece.roundness * snap };
}

export function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/** Laps around the frame until the tracer returns to its starting tooth. */
export function lapsToClose(frameTeeth, tracerTeeth) {
  return tracerTeeth / gcd(frameTeeth, tracerTeeth);
}

export function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}
