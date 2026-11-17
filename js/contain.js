// contain.js — keeps a tracer inside a ring.
//
// Pure rolling of a non-circular tracer inside a ring lets it poke through:
// a flat edge sticks out along the tangent, and a tracer bigger than a ring
// corner jams into it. A real plastic piece instead bridges the curve,
// touching the wall in two places. So after each rolling pose we apply the
// smallest translation that puts the tracer back inside (it always fits; see
// constraints.js). Smallest matters: it is unique and varies continuously,
// whereas "any fix that works" can flip between solutions and scribble.
// It is found with cutting planes: the ring's signed distance is convex, so
// the wall linearised at any poking point is a half-plane that contains every
// valid translation. Collect those cuts, take the exact min-norm point of
// their intersection, repeat; once that point actually fits it IS the
// smallest fix. Rotation is untouched and the fix depends only on the pose,
// so closure stays exact.

import { toWorld } from './rolling.js';

const HULL_POINTS = 96; // fine enough that corner arcs sag < 0.05 units
const TOLERANCE = 1e-3;
const MAX_ITERATIONS = 20;
const MAX_PEAKS = 6; // new cuts per iteration
const SAME_NORMAL = 1 - 1e-6; // cuts this parallel merge into one
const EPS = 1e-9;

/** A Roller `adjust` step that keeps `tracer` inside `frame`. */
export function containment(frame, tracer) {
  // Outline points suffice: the tracer is convex, and so is the ring's inside.
  const hull = tracer.sampleArcLengths(tracer.perimeter / HULL_POINTS).map((u) => tracer.at(u));
  const n = hull.length;
  // Reused per call (poses are computed synchronously, one at a time).
  const buffers = { x: new Float64Array(n), y: new Float64Array(n), depth: new Float64Array(n) };
  // Points inside the ring's inscribed circle can't poke out: skip exact maths.
  const safeSq = (frame.apothem + frame.cornerRadius) ** 2;
  return (pose) => containPose(pose, frame, hull, buffers, safeSq);
}

/** The pose, translated as little as possible so the hull is inside `frame`. */
function containPose(pose, frame, hull, { x, y, depth }, safeSq) {
  hull.forEach((p, k) => {
    const w = toWorld(pose, p.x, p.y);
    x[k] = w.x;
    y[k] = w.y;
  });
  const cuts = [];
  let v = { x: 0, y: 0 };
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    for (let k = 0; k < hull.length; k++) {
      const px = x[k] + v.x;
      const py = y[k] + v.y;
      depth[k] = px * px + py * py < safeSq ? -Infinity : frame.signedDistance(px, py);
    }
    const peaks = pokePeaks(depth);
    if (peaks.length === 0) break; // fits: v is the smallest fix
    for (const k of peaks) {
      // Linearised wall as a half-plane on the translation w: n.w <= b.
      const [nx, ny] = gradient(frame, x[k] + v.x, y[k] + v.y);
      addCut(cuts, { nx, ny, b: nx * v.x + ny * v.y - depth[k] });
    }
    v = minNormPoint(cuts);
  }
  return v.x === 0 && v.y === 0 ? pose : { ...pose, tx: pose.tx + v.x, ty: pose.ty + v.y };
}

/** Indices of the outline's local depth maxima past the wall, deepest first. */
function pokePeaks(depths) {
  const n = depths.length;
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const d = depths[i];
    // Strict on one side so a flat run against the wall yields one peak.
    if (d > TOLERANCE && d > depths[(i + n - 1) % n] && d >= depths[(i + 1) % n]) peaks.push(i);
  }
  return peaks.sort((a, b) => depths[b] - depths[a]).slice(0, MAX_PEAKS);
}

/** Add a cut, merging it into a parallel one (keeping the tighter) if present. */
function addCut(cuts, cut) {
  const twin = cuts.find((c) => c.nx * cut.nx + c.ny * cut.ny > SAME_NORMAL);
  if (twin) twin.b = Math.min(twin.b, cut.b);
  else cuts.push(cut);
}

/**
 * Exact min-norm point of the half-planes {w : n.w <= b} (n unit). In 2D the
 * optimum has at most two active planes, so enumerate the origin, every
 * single-plane foot and every pairwise corner, and keep the shortest feasible.
 */
function minNormPoint(planes) {
  const feasible = (w) => planes.every((p) => p.nx * w.x + p.ny * w.y <= p.b + 1e-7);
  const candidates = [{ x: 0, y: 0 }];
  planes.forEach((p, i) => {
    candidates.push({ x: p.b * p.nx, y: p.b * p.ny });
    for (const q of planes.slice(i + 1)) {
      const det = p.nx * q.ny - p.ny * q.nx;
      if (Math.abs(det) < EPS) continue;
      candidates.push({ x: (p.b * q.ny - q.b * p.ny) / det, y: (q.b * p.nx - p.b * q.nx) / det });
    }
  });
  const norm = (w) => Math.hypot(w.x, w.y);
  candidates.sort((a, b) => norm(a) - norm(b));
  // Cuts never exclude a valid fix, so some candidate is feasible; the
  // fallback (deepest-first foot) only guards against round-off.
  return candidates.find(feasible) ?? { x: planes[0].b * planes[0].nx, y: planes[0].b * planes[0].ny };
}

/** Unit outward direction of the signed distance (central differences). */
function gradient(frame, x, y) {
  const h = 1e-4;
  const gx = frame.signedDistance(x + h, y) - frame.signedDistance(x - h, y);
  const gy = frame.signedDistance(x, y + h) - frame.signedDistance(x, y - h);
  const length = Math.hypot(gx, gy) || 1;
  return [gx / length, gy / length];
}
