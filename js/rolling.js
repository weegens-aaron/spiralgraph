// rolling.js — rolls a tracer shape around a fixed frame shape without slipping.
//
// The frame is parameterised by arc length s, the tracer by arc length u.
// Rolling without slipping means |du| == |ds|:
//   internal (tracer inside a ring):  u = u0 + (s - sStart), tangents parallel
//   external (tracer outside a wheel): u = u0 - (s - sStart), tangents opposed
// The tracer's rotation psi aligns its contact tangent with the frame's, and
// its translation puts the two contact points on top of each other.
// An optional `adjust(pose)` step post-processes every pose (see contain.js).

const MAX_STEP = 1.5; // world units of arc length per sample
const MAX_TURN = (1.5 * Math.PI) / 180; // max tracer rotation per sample
const MAX_REFINE_DEPTH = 6; // up to 64 extra poses per sample step

export class Roller {
  constructor({ frame, tracer, mode, sStart, u0, adjust = (pose) => pose }) {
    this.adjust = adjust;
    this.frame = frame;
    this.tracer = tracer;
    this.external = mode === 'external';
    this.sign = this.external ? -1 : 1;
    this.sStart = sStart;
    this.u0 = u0;
  }

  uAt(s) {
    return this.u0 + this.sign * (s - this.sStart);
  }

  /** Rigid transform (rotation + translation) of the tracer at frame arc s. */
  pose(s) {
    const f = this.frame.at(s);
    const t = this.tracer.at(this.uAt(s));
    const psi = f.angle - t.angle + (this.external ? Math.PI : 0);
    const cos = Math.cos(psi);
    const sin = Math.sin(psi);
    return this.adjust({
      psi,
      cos,
      sin,
      tx: f.x - (cos * t.x - sin * t.y),
      ty: f.y - (sin * t.x + cos * t.y),
    });
  }

  /** Frame arc lengths from sFrom to sTo, split at every curvature change. */
  samples(sFrom, sTo) {
    const lo = Math.min(sFrom, sTo);
    const hi = Math.max(sFrom, sTo);
    const breaks = [lo, hi, ...periodicBreaks(this.frame, lo, hi), ...this.#tracerBreaks(lo, hi)];
    breaks.sort((a, b) => a - b);

    const out = [lo];
    for (let i = 1; i < breaks.length; i++) {
      const a = breaks[i - 1];
      const b = breaks[i];
      const len = b - a;
      if (len <= 1e-9) continue;
      const mid = (a + b) / 2;
      const turnRate = this.frame.curvatureAt(mid) + this.tracer.curvatureAt(this.uAt(mid));
      const steps = Math.max(1, Math.ceil(len / MAX_STEP), Math.ceil((len * turnRate) / MAX_TURN));
      for (let k = 1; k <= steps; k++) out.push(a + (len * k) / steps);
    }
    return sTo < sFrom ? out.reverse() : out;
  }

  /**
   * World-space polylines for each pen while rolling from sFrom to sTo.
   * Returns one flat [x0, y0, x1, y1, ...] array per pen (start included).
   */
  trace(sFrom, sTo, pens) {
    const lines = pens.map(() => []);
    const emit = (pose) =>
      pens.forEach((pen, i) => {
        const w = toWorld(pose, pen.x, pen.y);
        lines[i].push(w.x, w.y);
      });
    let prev = null;
    for (const s of this.samples(sFrom, sTo)) {
      const pose = this.pose(s);
      if (prev) this.#refine(prev.s, prev.pose, s, pose, emit, MAX_REFINE_DEPTH);
      emit(pose);
      prev = { s, pose };
    }
    return lines;
  }

  /**
   * Emit extra poses between two samples while the tracer centre moves faster
   * than MAX_STEP, e.g. when containment slides it through a tight ring corner.
   */
  #refine(sA, a, sB, b, emit, depth) {
    if (depth === 0 || Math.hypot(b.tx - a.tx, b.ty - a.ty) <= MAX_STEP) return;
    const sMid = (sA + sB) / 2;
    const mid = this.pose(sMid);
    this.#refine(sA, a, sMid, mid, emit, depth - 1);
    emit(mid);
    this.#refine(sMid, mid, sB, b, emit, depth - 1);
  }

  #tracerBreaks(lo, hi) {
    const uA = this.uAt(lo);
    const uB = this.uAt(hi);
    // Map tracer-arc breakpoints back into frame-arc space.
    return periodicBreaks(this.tracer, Math.min(uA, uB), Math.max(uA, uB)).map(
      (u) => this.sStart + this.sign * (u - this.u0),
    );
  }
}

/** Every boundary of `shape` (repeated per lap) strictly inside (lo, hi). */
function periodicBreaks(shape, lo, hi) {
  const p = shape.perimeter;
  const out = [];
  for (let lap = Math.floor(lo / p); lap <= Math.floor(hi / p); lap++) {
    for (const b of shape.boundaries) {
      const s = lap * p + b;
      if (s > lo && s < hi) out.push(s);
    }
  }
  return out;
}

export function toWorld(pose, x, y) {
  return { x: pose.cos * x - pose.sin * y + pose.tx, y: pose.sin * x + pose.cos * y + pose.ty };
}

export function toLocal(pose, x, y) {
  const dx = x - pose.tx;
  const dy = y - pose.ty;
  return { x: pose.cos * dx + pose.sin * dy, y: -pose.sin * dx + pose.cos * dy };
}
