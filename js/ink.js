// ink.js — the drawn pattern, stored in world coordinates.
//
// Strokes are grouped into sessions (one auto-draw run or one mouse drag), so
// undo removes a whole session and resize/zoom can redraw everything crisply.

export class Ink {
  constructor() {
    this.sessions = [];
    this.active = null;
  }

  get isDrawing() {
    return this.active !== null;
  }

  begin(pens) {
    this.end();
    this.active = pens.map((pen) => ({ color: pen.color, width: pen.width, pts: [] }));
    this.sessions.push(this.active);
  }

  /** Append one traced polyline per pen and draw just the new bit. */
  append(lines, ctx, view) {
    if (!this.active) return;
    this.active.forEach((stroke, i) => {
      const from = Math.max(0, stroke.pts.length - 2);
      const fresh = stroke.pts.length > 0 ? lines[i].slice(2) : lines[i];
      for (const value of fresh) stroke.pts.push(value);
      drawStroke(ctx, view, stroke, from);
    });
  }

  end() {
    if (!this.active) return;
    if (this.active.every((stroke) => stroke.pts.length < 4)) this.sessions.pop();
    this.active = null;
  }

  undo() {
    this.end();
    this.sessions.pop();
  }

  clear() {
    this.active = null;
    this.sessions = [];
  }

  /** World-space bounding box of all ink plus the widest pen, or null if empty. */
  bounds() {
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, maxWidth: 0 };
    for (const stroke of this.sessions.flat()) {
      if (stroke.pts.length < 4) continue;
      box.maxWidth = Math.max(box.maxWidth, stroke.width);
      for (let i = 0; i < stroke.pts.length; i += 2) {
        box.minX = Math.min(box.minX, stroke.pts[i]);
        box.maxX = Math.max(box.maxX, stroke.pts[i]);
        box.minY = Math.min(box.minY, stroke.pts[i + 1]);
        box.maxY = Math.max(box.maxY, stroke.pts[i + 1]);
      }
    }
    return box.maxWidth > 0 ? box : null;
  }

  redraw(ctx, view) {
    view.clear(ctx);
    for (const session of this.sessions) {
      for (const stroke of session) drawStroke(ctx, view, stroke, 0);
    }
  }
}

function drawStroke(ctx, view, stroke, fromIndex) {
  const pts = stroke.pts;
  if (pts.length - fromIndex < 4) return;
  view.apply(ctx);
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width / view.scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[fromIndex], pts[fromIndex + 1]);
  for (let i = fromIndex + 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}
