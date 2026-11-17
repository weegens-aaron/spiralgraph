// geometry.js — rounded regular polygons, parameterised by arc length.
//
// A shape is the Minkowski sum of a regular n-gon (side length L) and a disk
// (radius r): n straight edges joined by n circular corner arcs. That one
// model covers circles (L = 0), stadium "bars" (n = 2), rounded triangles,
// squares, etc. All shapes are centred on the origin and traversed CCW
// (math coordinates, y up).

export const TAU = Math.PI * 2;
// Below the smallest real corner (1 tooth at pitch 3 => r ~ 0.48), so the
// clamp never kicks in for valid pieces and perimeters stay exact.
export const MIN_CORNER_RADIUS = 0.1;
const ANGLE_TABLE_SIZE = 1024;

export class Shape {
  constructor({ sides, sideLength, cornerRadius }) {
    this.sides = Math.max(2, Math.round(sides));
    this.sideLength = Math.max(0, sideLength);
    this.cornerRadius = Math.max(MIN_CORNER_RADIUS, cornerRadius);

    this.segments = buildSegments(this.sides, this.sideLength, this.cornerRadius);
    const last = this.segments[this.segments.length - 1];
    this.perimeter = last.s0 + last.len;
    // Arc-length positions where curvature changes (used for exact sampling).
    this.boundaries = this.segments.filter((seg) => seg.len > 0).map((seg) => seg.s0);

    const polyR = polygonCircumradius(this.sides, this.sideLength);
    this.circumradius = polyR + this.cornerRadius;
    this.apothem = polygonInradius(this.sides, this.sideLength);
    // Outward normal of edge k (edge 0 lies along the bottom).
    this.edgeNormals = Array.from({ length: this.sides }, (_, k) => {
      const angle = -Math.PI / 2 + (TAU * k) / this.sides;
      return [Math.cos(angle), Math.sin(angle)];
    });

    this.angleTable = this.#buildAngleTable();
  }

  /** Wrap any (possibly negative / multi-lap) arc length into [0, perimeter). */
  wrap(s) {
    const p = this.perimeter;
    return ((s % p) + p) % p;
  }

  segmentAt(s) {
    const ws = this.wrap(s);
    let found = this.segments[0];
    for (const seg of this.segments) {
      if (seg.len > 0 && seg.s0 <= ws) found = seg;
    }
    return { seg: found, t: Math.min(found.len, ws - found.s0) };
  }

  /** Point and tangent angle at arc length s. */
  at(s) {
    const { seg, t } = this.segmentAt(s);
    if (seg.type === 'line') {
      return {
        x: seg.x0 + t * Math.cos(seg.dirA),
        y: seg.y0 + t * Math.sin(seg.dirA),
        angle: seg.dirA,
      };
    }
    const gamma = seg.a0 + t / seg.r;
    return {
      x: seg.cx + seg.r * Math.cos(gamma),
      y: seg.cy + seg.r * Math.sin(gamma),
      angle: gamma + Math.PI / 2,
    };
  }

  curvatureAt(s) {
    const { seg } = this.segmentAt(s);
    return seg.type === 'arc' ? 1 / seg.r : 0;
  }

  /** Arc length of the boundary point lying in polar direction `theta`. */
  arcLengthAtAngle(theta) {
    const table = this.angleTable;
    const start = table[0].angle;
    let target = theta;
    while (target < start) target += TAU;
    while (target >= start + TAU) target -= TAU;

    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].angle <= target) lo = mid;
      else hi = mid;
    }
    const a = table[lo];
    const b = table[hi];
    const span = b.angle - a.angle || 1;
    return a.s + ((target - a.angle) / span) * (b.s - a.s);
  }

  /**
   * Exact signed distance to the outline (negative inside). By symmetry the
   * nearest polygon feature lies in the point's own edge sector, so fold the
   * point onto that edge, measure, then subtract the corner radius.
   */
  signedDistance(x, y) {
    const n = this.sides;
    const k = Math.round(((Math.atan2(y, x) + Math.PI / 2) * n) / TAU);
    const [nx, ny] = this.edgeNormals[((k % n) + n) % n];
    const out = x * nx + y * ny - this.apothem; // past the edge line
    const beyond = Math.abs(ny * x - nx * y) - this.sideLength / 2; // past its ends
    const polygon = beyond > 0 ? Math.hypot(Math.max(out, 0), beyond) : out;
    return polygon - this.cornerRadius;
  }

  contains(x, y) {
    return this.signedDistance(x, y) <= 0;
  }

  /** Arc lengths for drawing: uniform steps plus every segment boundary. */
  sampleArcLengths(step) {
    const count = Math.max(8, Math.ceil(this.perimeter / step));
    const values = Array.from({ length: count }, (_, i) => (i * this.perimeter) / count);
    return [...values, ...this.boundaries].sort((a, b) => a - b);
  }

  #buildAngleTable() {
    // Polar angle is monotonic around a convex shape centred on the origin.
    const table = [];
    let prev = null;
    for (let i = 0; i <= ANGLE_TABLE_SIZE; i++) {
      const s = (i / ANGLE_TABLE_SIZE) * this.perimeter;
      const p = this.at(s);
      let angle = Math.atan2(p.y, p.x);
      if (prev !== null) {
        while (angle < prev) angle += TAU;
      }
      table.push({ s, angle });
      prev = angle;
    }
    return table;
  }

}

/** Centre-to-vertex distance of a regular n-gon with side L (n = 2: a segment). */
export function polygonCircumradius(n, L) {
  return n === 2 ? L / 2 : L / (2 * Math.sin(Math.PI / n));
}

/** Centre-to-edge distance of a regular n-gon with side L (n = 2: a segment). */
export function polygonInradius(n, L) {
  return n === 2 ? 0 : L / (2 * Math.tan(Math.PI / n));
}

function buildSegments(n, L, r) {
  const R = polygonCircumradius(n, L);
  // Phase chosen so the first edge is horizontal along the bottom.
  const phase = -Math.PI / 2 - Math.PI / n;
  const vertex = (k) => {
    const a = phase + (TAU * (k % n)) / n;
    return [R * Math.cos(a), R * Math.sin(a)];
  };

  const segments = [];
  let s = 0;
  for (let k = 0; k < n; k++) {
    const dirA = phase + (TAU * k) / n + Math.PI / 2 + Math.PI / n;
    const normalA = dirA - Math.PI / 2; // outward normal of a CCW edge
    const [vx, vy] = vertex(k);
    segments.push({
      type: 'line',
      x0: vx + r * Math.cos(normalA),
      y0: vy + r * Math.sin(normalA),
      dirA,
      len: L,
      s0: s,
    });
    s += L;

    const [cx, cy] = vertex(k + 1);
    const sweep = TAU / n;
    segments.push({ type: 'arc', cx, cy, r, a0: normalA, sweep, len: r * sweep, s0: s });
    s += r * sweep;
  }
  return segments;
}
