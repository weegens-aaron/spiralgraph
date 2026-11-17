// Run with: node --test tests/
// Checks the rolling engine against closed-form trochoids for circles, plus
// the whole-number piece model's invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shape } from '../js/geometry.js';
import { Roller, toWorld } from '../js/rolling.js';
import { containment } from '../js/contain.js';
import { lapsToClose, normalizePiece, shapeParams, toothCount } from '../js/pieces.js';

const PITCH = 6;
const shapeOf = (piece, pitch = PITCH) => new Shape(shapeParams(piece, pitch));
// A circle with exactly `teeth` teeth (snapping makes the radius exact).
const circle = (teeth) => shapeOf({ sides: 4, sideLength: 0, roundness: (teeth * PITCH) / (2 * Math.PI) });

test('pen distance from centre matches trochoid radius bounds', () => {
  for (const mode of ['internal', 'external']) {
    const frame = circle(96);
    const tracer = circle(36);
    const roller = new Roller({ frame, tracer, mode, sStart: 0, u0: 0 });
    const R = frame.circumradius;
    const r = tracer.circumradius;
    const d = 20;
    const centreDist = mode === 'internal' ? R - r : R + r;
    let min = Infinity;
    let max = 0;
    for (const s of roller.samples(0, frame.perimeter * lapsToClose(96, 36))) {
      const p = roller.pose(s);
      // Tracer centre must ride on a circle of radius R -/+ r.
      assert.ok(Math.abs(Math.hypot(p.tx, p.ty) - centreDist) < 1e-6, `${mode} centre off track`);
      const dist = Math.hypot(p.tx + p.cos * d, p.ty + p.sin * d);
      min = Math.min(min, dist);
      max = Math.max(max, dist);
    }
    assert.ok(Math.abs(max - (centreDist + d)) < 0.05, `${mode} max ${max}`);
    assert.ok(Math.abs(min - (centreDist - d)) < 0.05, `${mode} min ${min}`);
  }
});

test('tracer spins at the trochoid rate', () => {
  const frame = circle(96);
  const tracer = circle(36);
  const R = frame.circumradius;
  const r = tracer.circumradius;
  for (const [mode, rate] of [['internal', 1 / R - 1 / r], ['external', 1 / R + 1 / r]]) {
    const roller = new Roller({ frame, tracer, mode, sStart: 0, u0: 0 });
    const a = roller.pose(10).psi;
    const b = roller.pose(11).psi;
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    assert.ok(Math.abs(delta - rate) < 1e-9, `${mode} rate ${delta} vs ${rate}`);
  }
});

test('pattern closes after lapsToClose laps (polygon tracer too)', () => {
  const framePiece = { sides: 4, sideLength: 60, roundness: 57 };
  const tracerPiece = { sides: 3, sideLength: 25, roundness: 28 };
  const frame = shapeOf(framePiece);
  const tracer = shapeOf(tracerPiece);
  const roller = new Roller({ frame, tracer, mode: 'external', sStart: 0, u0: 0 });
  const pen = [{ x: 5, y: 3 }];
  const laps = lapsToClose(toothCount(framePiece, PITCH), toothCount(tracerPiece, PITCH));
  const end = laps * frame.perimeter;
  const start = roller.trace(0, 0, pen)[0];
  const finish = roller.trace(end, end, pen)[0];
  assert.ok(Math.hypot(start[0] - finish[0], start[1] - finish[1]) < 1e-6);
});

test('perimeter == teeth * pitch exactly, for any size and tooth size', () => {
  for (const pitch of [2, 7, 20]) {
    for (const sides of [2, 3, 5, 12]) {
      for (const sideLength of [0, 13, 150]) {
        for (const roundness of [1, 37, 150]) {
          const piece = { sides, sideLength, roundness };
          const shape = shapeOf(piece, pitch);
          const label = `${sides}/${sideLength}/${roundness}@${pitch}`;
          assert.ok(Math.abs(shape.perimeter - toothCount(piece, pitch) * pitch) < 1e-9, label);
        }
      }
    }
  }
});

test('tooth size changes the tooth count, not the piece size', () => {
  const piece = { sides: 3, sideLength: 42, roundness: 39 };
  assert.equal(toothCount(piece, 6), 62);
  assert.equal(toothCount(piece, 12), 31);
  assert.equal(toothCount(piece, 2), 186);
  // Snapping keeps the piece within half a tooth of its nominal size.
  const radii = [2, 6, 12].map((pitch) => shapeOf(piece, pitch).circumradius);
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1.5, radii.join(', '));
});

test('normalizePiece rounds and clamps sliders to whole numbers', () => {
  assert.deepEqual(normalizePiece({ sides: 3.2, sideLength: 7.6, roundness: 40.4 }, 'tracer'), {
    sides: 3,
    sideLength: 8,
    roundness: 40,
  });
  assert.deepEqual(normalizePiece({ sides: 99, sideLength: 999, roundness: 0 }, 'tracer'), {
    sides: 12,
    sideLength: 150,
    roundness: 1,
  });
});

function assertNoJumps(pts, limit, label) {
  for (let i = 2; i < pts.length; i += 2) {
    assert.ok(Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]) < limit, `${label}: jump at ${i}`);
  }
}

test('traces never jump the pen too far, even with sharp corners', () => {
  // Minimum roundedness: as sharp as it gets.
  const frame = shapeOf({ sides: 3, sideLength: 200, roundness: 1 });
  const tracer = shapeOf({ sides: 4, sideLength: 30, roundness: 1 });
  const roller = new Roller({ frame, tracer, mode: 'external', sStart: 0, u0: 0 });
  assertNoJumps(roller.trace(0, frame.perimeter, [{ x: 40, y: 0 }])[0], 5, 'external');

  // Contained bar sliding through tight hexagon corners moves fast: refined.
  const ring = shapeOf({ sides: 6, sideLength: 120, roundness: 1 });
  const bar = shapeOf({ sides: 2, sideLength: 90, roundness: 12 });
  const held = new Roller({ frame: ring, tracer: bar, mode: 'internal', sStart: 0, u0: 0, adjust: containment(ring, bar) });
  assertNoJumps(held.trace(0, ring.perimeter * 2, [{ x: 50, y: 0 }])[0], 5, 'contained');
});

test('containment keeps the tracer inside the ring', () => {
  const cases = [
    [{ sides: 4, sideLength: 0, roundness: 143 }, { sides: 3, sideLength: 42, roundness: 39 }],
    [{ sides: 3, sideLength: 250, roundness: 5 }, { sides: 3, sideLength: 42, roundness: 10 }],
  ];
  for (const [framePiece, tracerPiece] of cases) {
    const frame = shapeOf(framePiece);
    const tracer = shapeOf(tracerPiece);
    const outline = tracer.sampleArcLengths(2).map((u) => tracer.at(u));
    const poke = (adjust) => {
      const roller = new Roller({ frame, tracer, mode: 'internal', sStart: 0, u0: 0, adjust });
      let worst = -Infinity;
      for (let s = 0; s < frame.perimeter; s += 3) {
        const pose = roller.pose(s);
        for (const p of outline) {
          const w = toWorld(pose, p.x, p.y);
          worst = Math.max(worst, frame.signedDistance(w.x, w.y));
        }
      }
      return worst;
    };
    assert.ok(poke(undefined) > 5, 'pure rolling pokes through (else this test proves nothing)');
    assert.ok(poke(containment(frame, tracer)) < 0.1, 'contained');
  }
});

test('signedDistance is exact on the outline and at the centre', () => {
  for (const piece of [
    { sides: 4, sideLength: 0, roundness: 50 },
    { sides: 2, sideLength: 80, roundness: 9 },
    { sides: 5, sideLength: 60, roundness: 3 },
  ]) {
    const shape = shapeOf(piece);
    for (const s of shape.sampleArcLengths(5)) {
      const p = shape.at(s);
      assert.ok(Math.abs(shape.signedDistance(p.x, p.y)) < 1e-9);
    }
    assert.ok(Math.abs(shape.signedDistance(0, 0) + shape.apothem + shape.cornerRadius) < 1e-9);
  }
});
