// app.js — application state and actions. Wires geometry, rolling, ink,
// rendering and the side panel together.

import { Shape, TAU } from './geometry.js';
import { Roller, toLocal } from './rolling.js';
import { RANGES, clampInt, gcd, lapsToClose, normalizePiece, shapeParams, toothCount } from './pieces.js';
import { fitTracer, penRanges, pullInside, rangesFor } from './constraints.js';
import { containment } from './contain.js';
import { downloadInk } from './export.js';
import { Ink } from './ink.js';
import { View, drawFrame, drawPens, drawTracer, penAt, ringWidth } from './render.js';
import { Controls } from './ui.js';

const PALETTE = ['#d6336c', '#1c7ed6', '#2f9e44', '#f08c00', '#7048e8', '#0ca678', '#e8590c', '#212529'];

const DEFAULT_PEN_WIDTH = 2;

function defaultState() {
  return {
    pitch: 6,
    mode: 'internal',
    frame: { sides: 4, sideLength: 0, roundness: 143 }, // circle: 150 teeth at pitch 6
    tracer: { sides: 3, sideLength: 42, roundness: 39 }, // rounded triangle: 62 teeth
    pens: [
      { id: 1, x: 32, y: 0, color: PALETTE[0], width: DEFAULT_PEN_WIDTH },
      { id: 2, x: -14, y: 10, color: PALETTE[1], width: DEFAULT_PEN_WIDTH },
    ],
    selectedPenId: null,
    startTooth: 0,
    tracerTooth: 0,
    laps: 1, // rebuild() bumps this to the full pattern
    speed: 2,
    inkOnDrag: true,
    showPieces: true,
    tool: 'roll',
    paper: '#fbf8f1',
  };
}

export class App {
  constructor({ panel, stage, inkCanvas, overlayCanvas }) {
    this.state = defaultState();
    this.stage = stage;
    this.inkCanvas = inkCanvas;
    this.overlay = overlayCanvas;
    this.inkCtx = inkCanvas.getContext('2d');
    this.overlayCtx = overlayCanvas.getContext('2d');
    this.view = new View();
    this.ink = new Ink();
    this.rafId = null;
    this.renderQueued = false;
    this.fullLaps = 0;
    this.controls = new Controls(panel, stage, this);
    this.rebuild();
  }

  // ---- geometry -----------------------------------------------------------

  rebuild() {
    this.stop();
    const s = this.state;
    // Derived from piece size + tooth size; every change funnels through here.
    this.teeth = { frame: toothCount(s.frame, s.pitch), tracer: toothCount(s.tracer, s.pitch) };
    s.startTooth = clampInt(s.startTooth, 0, this.teeth.frame - 1);
    s.tracerTooth = clampInt(s.tracerTooth, 0, this.teeth.tracer - 1);
    this.#keepLapsInRange();
    this.frame = new Shape(shapeParams(s.frame, s.pitch));
    this.tracer = new Shape(shapeParams(s.tracer, s.pitch));
    const sStart = s.startTooth * s.pitch;
    this.roller = new Roller({
      frame: this.frame,
      tracer: this.tracer,
      mode: s.mode,
      sStart,
      u0: s.tracerTooth * s.pitch,
      adjust: s.mode === 'internal' ? containment(this.frame, this.tracer) : undefined,
    });
    this.currentS = sStart;
    this.#keepPensOnTracer();
    this.fit();
    this.syncControls();
    this.#renderPens();
  }

  /** Laps stay at "full pattern" if they were; otherwise clamp to it. */
  #keepLapsInRange() {
    const s = this.state;
    const full = lapsToClose(this.teeth.frame, this.teeth.tracer);
    s.laps = s.laps >= this.fullLaps ? full : clampInt(s.laps, 1, full);
    this.fullLaps = full;
  }

  #keepPensOnTracer() {
    for (const pen of this.state.pens) Object.assign(pen, pullInside(this.tracer, pen));
  }

  pose() {
    return this.roller.pose(this.currentS);
  }

  // ---- view ---------------------------------------------------------------

  resize(width, height) {
    this.view.resize([this.inkCanvas, this.overlay], width, height);
    this.fit(true);
  }

  fit(forceRedraw = false) {
    const extent =
      this.state.mode === 'internal'
        ? this.frame.circumradius + ringWidth(this.frame)
        : this.frame.circumradius + 2 * this.tracer.circumradius + this.state.pitch;
    const before = this.view.scale;
    this.view.fit(extent);
    if (forceRedraw || before !== this.view.scale) this.redrawInk();
    this.requestRender();
  }

  zoom(factor) {
    this.view.scale *= factor;
    this.redrawInk();
    this.requestRender();
  }

  redrawInk() {
    this.ink.redraw(this.inkCtx, this.view);
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.#renderOverlay();
    });
  }

  #renderOverlay() {
    const { overlayCtx: ctx, view, state } = this;
    view.clear(ctx);
    if (!state.showPieces) return;
    const pose = this.pose();
    drawFrame(ctx, view, this.frame, state.mode, state.pitch);
    drawTracer(ctx, view, this.tracer, pose, state.pitch);
    drawPens(ctx, view, state.pens, pose, state.selectedPenId);
  }

  // ---- drawing ------------------------------------------------------------

  /** Roll the tracer to frame arc sTo, inking if a session is active. */
  advance(sTo) {
    if (this.ink.isDrawing) {
      this.ink.append(this.roller.trace(this.currentS, sTo, this.state.pens), this.inkCtx, this.view);
    }
    this.currentS = sTo;
    this.requestRender();
  }

  #beginRun() {
    this.stop();
    this.currentS = this.roller.sStart;
    this.ink.begin(this.state.pens);
    return this.roller.sStart + this.state.laps * this.frame.perimeter;
  }

  animate() {
    if (!this.state.pens.length) return;
    const target = this.#beginRun();
    let last = null;
    const tick = (time) => {
      const dt = last === null ? 0 : Math.min(0.1, (time - last) / 1000);
      last = time;
      const next = Math.min(target, this.currentS + this.state.speed * this.frame.perimeter * dt);
      this.advance(next);
      if (next >= target) this.stop();
      else this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  drawInstant() {
    if (!this.state.pens.length) return;
    this.advance(this.#beginRun());
    this.ink.end();
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.ink.end();
  }

  // ---- mouse rolling --------------------------------------------------------

  /** Start a mouse roll; remembers where we grabbed so nothing jumps. */
  beginRoll(point) {
    this.stop();
    this.grabOffset = this.#arcUnder(point) - this.frame.wrap(this.currentS);
    if (this.state.inkOnDrag && this.state.pens.length) this.ink.begin(this.state.pens);
  }

  /** Roll so the contact point follows the pointer's polar direction. */
  rollToward(point) {
    if (Math.hypot(point.x, point.y) < this.view.px(4)) return;
    const perimeter = this.frame.perimeter;
    // wrap() gives [0, P); shift to (-P/2, P/2] so we roll the short way round.
    let delta = this.frame.wrap(this.#arcUnder(point) - this.grabOffset - this.currentS);
    if (delta > perimeter / 2) delta -= perimeter;
    this.advance(this.currentS + delta);
  }

  endRoll() {
    this.ink.end();
  }

  #arcUnder(point) {
    return this.frame.arcLengthAtAngle(Math.atan2(point.y, point.x));
  }

  // ---- pens -----------------------------------------------------------------

  penAt(point) {
    return penAt(this.view, this.state.pens, this.pose(), point);
  }

  /** World point -> tracer-local point, or null if outside the tracer. */
  tracerLocal(point, { requireInside = false } = {}) {
    const local = toLocal(this.pose(), point.x, point.y);
    return requireInside && !this.tracer.contains(local.x, local.y) ? null : local;
  }

  addPen(local) {
    this.stop();
    const pens = this.state.pens;
    const id = pens.reduce((max, pen) => Math.max(max, pen.id), 0) + 1;
    pens.push({ id, x: 0, y: 0, color: PALETTE[pens.length % PALETTE.length], width: DEFAULT_PEN_WIDTH });
    this.#placePen(pens.at(-1), local);
    this.selectPen(id);
  }

  addRandomPen() {
    const reach = 0.6 * this.tracer.circumradius * Math.cos(Math.PI / this.tracer.sides);
    const angle = Math.random() * TAU;
    const radius = reach * Math.sqrt(Math.random());
    this.addPen({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }

  movePen(id, local) {
    this.stop();
    const pen = this.state.pens.find((p) => p.id === id);
    if (pen) this.#placePen(pen, local);
    this.requestRender();
  }

  /** Snap to the nearest whole position on the tracer. */
  #placePen(pen, local) {
    Object.assign(pen, pullInside(this.tracer, local));
  }

  selectPen(id) {
    this.state.selectedPenId = id;
    this.#renderPens();
    this.requestRender();
  }

  #renderPens() {
    this.controls.renderPens(this.state.pens, this.state.selectedPenId, (pen) => ({
      ...penRanges(this.tracer, pen),
      width: RANGES.penWidth,
    }));
  }

  // ---- panel handlers (called by Controls) ------------------------------------

  onSetting(key, value) {
    const s = this.state;
    s[key] = value;
    switch (key) {
      case 'pitch':
        s.pitch = clampInt(value, ...RANGES.pitch);
        this.rebuild();
        break;
      case 'mode':
        s.tracer = fitTracer(s); // sliders can't guard a mode switch
        this.rebuild();
        break;
      case 'startTooth':
      case 'tracerTooth':
        this.rebuild();
        break;
      case 'laps':
        s.laps = clampInt(value, 1, this.fullLaps);
        break;
      case 'speed':
        s.speed = clampInt(value, ...RANGES.speed);
        break;
      case 'paper':
        this.stage.style.setProperty('--paper', value);
        break;
      case 'tool':
        this.overlay.classList.toggle('pens-tool', value === 'pens');
        break;
    }
    this.syncControls();
    this.requestRender();
  }

  onPiece(piece, field, value) {
    this.state[piece] = normalizePiece({ ...this.state[piece], [field]: value }, piece);
    this.rebuild();
  }

  onAction(name) {
    const actions = {
      'add-pen': () => this.addRandomPen(),
      'full-pattern': () => this.onSetting('laps', this.fullLaps),
      animate: () => this.animate(),
      instant: () => this.drawInstant(),
      stop: () => this.stop(),
      undo: () => this.#editInk(() => this.ink.undo()),
      clear: () => this.#editInk(() => this.ink.clear()),
      fit: () => this.fit(true),
      export: () => downloadInk(this.ink, this.view, this.state.paper),
      'export-transparent': () => downloadInk(this.ink, this.view, null),
    };
    actions[name]?.();
  }

  /** Panel inputs already show the edit, so no relist (it would steal focus). */
  onPenChange(id, patch) {
    this.stop();
    const pen = this.state.pens.find((p) => p.id === id);
    if (!pen) return;
    Object.assign(pen, patch);
    // Moving along one axis changes how far the other can go on the tracer.
    if ('x' in patch || 'y' in patch) this.controls.setPenRanges(id, penRanges(this.tracer, pen));
    this.requestRender();
  }

  onPenRemove(id) {
    this.stop();
    this.state.pens = this.state.pens.filter((pen) => pen.id !== id);
    this.selectPen(this.state.selectedPenId === id ? null : this.state.selectedPenId);
  }

  onPenSelect(id) {
    this.state.selectedPenId = id;
    this.controls.highlightPen(id);
    this.requestRender();
  }

  // ---- misc -------------------------------------------------------------------

  #editInk(edit) {
    this.stop();
    edit();
    this.redrawInk();
  }

  syncControls() {
    this.controls.sync(this.state, { info: this.#info(), ranges: rangesFor(this.state, this.teeth), teeth: this.teeth });
  }

  #info() {
    const { frame: tf, tracer: tr } = this.teeth;
    const g = gcd(tf, tr);
    const lines = [
      `Frame <b>${tf}</b> teeth, tracer <b>${tr}</b> teeth.`,
      `Full pattern: <b>${tr / g}</b> rotations, ${tf / g}-fold symmetry.`,
    ];
    if (this.state.mode === 'internal' && tr >= tf) {
      lines.push('<span class="warn">Tracer is bigger than the ring, so it can\'t really fit inside.</span>');
    }
    return lines.join('<br>');
  }
}
