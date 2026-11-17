import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTracer, isFeasible, penRanges, pullInside, rangesFor } from '../js/constraints.js';
import { Shape } from '../js/geometry.js';
import { shapeParams, toothCount } from '../js/pieces.js';

const BASE = {
  mode: 'internal',
  pitch: 6,
  frame: { sides: 4, sideLength: 0, roundness: 143 },
  tracer: { sides: 3, sideLength: 42, roundness: 39 },
};
const teethOf = (s) => ({ frame: toothCount(s.frame, s.pitch), tracer: toothCount(s.tracer, s.pitch) });
const PIECE_KEYS = ['sides', 'sideLength', 'roundness'].flatMap((f) => [`frame.${f}`, `tracer.${f}`]);

function withSetting(state, key, value) {
  if (!key.includes('.')) return { ...state, [key]: value };
  const [role, field] = key.split('.');
  return { ...state, [role]: { ...state[role], [field]: value } };
}

test('both ends of every adaptive range keep the state feasible', () => {
  for (const mode of ['internal', 'external']) {
    const state = { ...BASE, mode };
    const ranges = rangesFor(state, teethOf(state));
    for (const key of [...PIECE_KEYS, 'pitch']) {
      const [min, max] = ranges[key];
      assert.ok(min <= max, `${mode} ${key}`);
      assert.ok(isFeasible(withSetting(state, key, min)), `${mode} ${key} min ${min}`);
      assert.ok(isFeasible(withSetting(state, key, max)), `${mode} ${key} max ${max}`);
    }
  }
});

test('ranges stop exactly at the edge: one step past is infeasible', () => {
  // Both limits come from the fit rule, strictly inside the outer slider caps.
  const ranges = rangesFor(BASE, teethOf(BASE));
  const [, maxRound] = ranges['tracer.roundness'];
  const [minRing] = ranges['frame.roundness'];
  assert.ok(maxRound < 150 && minRing > 1, `${maxRound} ${minRing}`);
  assert.ok(!isFeasible(withSetting(BASE, 'tracer.roundness', maxRound + 1)));
  assert.ok(!isFeasible(withSetting(BASE, 'frame.roundness', minRing - 1)));
});

test('internal mode limits the tracer to fit inside the ring', () => {
  const internal = rangesFor(BASE, teethOf(BASE));
  const external = rangesFor({ ...BASE, mode: 'external' }, teethOf(BASE));
  assert.ok(internal['tracer.roundness'][1] < external['tracer.roundness'][1]);
  assert.ok(internal['frame.roundness'][0] > external['frame.roundness'][0]);
});

test('big tooth size is limited by the minimum tooth count', () => {
  const tiny = { ...BASE, tracer: { sides: 3, sideLength: 0, roundness: 10 } }; // ~63 units round
  const [, maxPitch] = rangesFor(tiny, teethOf(tiny)).pitch;
  assert.ok(maxPitch < 20, `max pitch ${maxPitch}`);
  assert.ok(toothCount(tiny.tracer, maxPitch) >= 6);
});

test('pen ranges hug the tracer outline, not a bounding square', () => {
  const tracer = new Shape(shapeParams(BASE.tracer, BASE.pitch)); // rounded triangle
  for (const pen of [{ x: 0, y: 0 }, { x: 20, y: -30 }, { x: -25, y: 10 }]) {
    const { x, y } = penRanges(tracer, pen);
    assert.ok(tracer.contains(x[0], pen.y) && tracer.contains(x[1], pen.y), `x ends ${x}`);
    assert.ok(!tracer.contains(x[0] - 1, pen.y) && !tracer.contains(x[1] + 1, pen.y), `x past ${x}`);
    assert.ok(tracer.contains(pen.x, y[0]) && tracer.contains(pen.x, y[1]), `y ends ${y}`);
    assert.ok(!tracer.contains(pen.x, y[0] - 1) && !tracer.contains(pen.x, y[1] + 1), `y past ${y}`);
  }
  // A triangle is lopsided: the top reaches further than the flat bottom edge.
  const { y } = penRanges(tracer, { x: 0, y: 0 });
  assert.ok(y[1] > -y[0] + 10, `${y}`);
});

test('pullInside lands on a whole-number point on the tracer', () => {
  const tracer = new Shape(shapeParams(BASE.tracer, BASE.pitch));
  for (const point of [{ x: 300, y: 0 }, { x: -80.6, y: 77.2 }, { x: 0, y: -999 }]) {
    const pulled = pullInside(tracer, point);
    assert.ok(Number.isInteger(pulled.x) && Number.isInteger(pulled.y));
    assert.ok(tracer.contains(pulled.x, pulled.y), JSON.stringify(pulled));
    assert.ok(Math.hypot(pulled.x, pulled.y) > 20, 'pulled to the rim, not the centre');
  }
  assert.deepEqual(pullInside(tracer, { x: 3.4, y: -2.6 }), { x: 3, y: -3 }); // already on it
});

test('fitTracer shrinks an oversized tracer to fit, keeping its sides', () => {
  const huge = { ...BASE, tracer: { sides: 5, sideLength: 150, roundness: 150 } };
  assert.ok(!isFeasible(huge));
  const fitted = fitTracer(huge);
  assert.ok(isFeasible({ ...huge, tracer: fitted }));
  assert.equal(fitted.sides, 5);
  assert.equal(fitTracer(BASE), BASE.tracer); // already fine: untouched
});
