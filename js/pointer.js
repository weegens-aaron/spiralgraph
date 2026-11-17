// pointer.js — canvas mouse/touch interaction.
//   Roll tool: drag anywhere and the tracer rolls to follow the pointer.
//   Pens tool: click inside the tracer to add a pen, drag a hole to move it.
//   Wheel: zoom.

const ZOOM_STEP = 1.1;

export function bindPointer(canvas, app) {
  let drag = null; // { kind: 'roll' } | { kind: 'pen', id }

  const worldPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return app.view.toWorld(event.clientX - rect.left, event.clientY - rect.top);
  };

  const startPenDrag = (point) => {
    const hit = app.penAt(point);
    if (hit) {
      app.onPenSelect(hit.id);
      return { kind: 'pen', id: hit.id };
    }
    const local = app.tracerLocal(point, { requireInside: true });
    if (!local) {
      app.onPenSelect(null);
      return null;
    }
    app.addPen(local);
    return { kind: 'pen', id: app.state.selectedPenId };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = worldPoint(event);
    if (app.state.tool === 'pens') {
      drag = startPenDrag(point);
    } else {
      app.beginRoll(point);
      drag = { kind: 'roll' };
    }
    if (!drag) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = worldPoint(event);
    if (drag.kind === 'roll') app.rollToward(point);
    else app.movePen(drag.id, app.tracerLocal(point));
  });

  const finish = () => {
    if (!drag) return;
    if (drag.kind === 'roll') app.endRoll();
    else app.selectPen(drag.id); // relist so x/y inputs show the new spot
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      app.zoom(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    },
    { passive: false },
  );
}
