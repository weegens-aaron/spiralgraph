// ui.js — DOM binding for the side panel. Knows nothing about gears or maths:
// it reads/writes form values and forwards user intent to handler callbacks.
//
//   [data-setting=key]        -> handlers.onSetting(key, value)
//   [data-piece] [data-field] -> handlers.onPiece(piece, field, value)
//   [data-action=name]        -> handlers.onAction(name)
//   pen list rows             -> handlers.onPen{Change,Remove,Select}
//   [data-teeth=piece]        <- read-only derived tooth count
//
// Every slider is whole-number (default step 1); ranges are pushed in by sync().

const LIVE_INPUT_TYPES = new Set(['range', 'color']);

export class Controls {
  constructor(panel, stage, handlers) {
    this.roots = [panel, stage];
    this.handlers = handlers;
    this.penList = panel.querySelector('#pen-list');
    this.info = panel.querySelector('#info');
    this.#bind();
  }

  #bind() {
    for (const root of this.roots) {
      // Sliders and colour pickers update live; everything else on change.
      root.addEventListener('input', (e) => {
        if (e.target.type === 'range') showValue(e.target);
        if (LIVE_INPUT_TYPES.has(e.target.type)) this.#dispatch(e.target);
      });
      root.addEventListener('change', (e) => {
        if (!LIVE_INPUT_TYPES.has(e.target.type)) this.#dispatch(e.target);
      });
      root.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) this.handlers.onAction(action.dataset.action);
      });
    }
  }

  #dispatch(input) {
    const penRow = input.closest('[data-pen-id]');
    if (penRow) {
      const value = input.type === 'color' ? input.value : Number(input.value);
      this.handlers.onPenChange(Number(penRow.dataset.penId), { [input.dataset.penField]: value });
      return;
    }
    if (input.dataset.setting) {
      this.handlers.onSetting(input.dataset.setting, readValue(input));
      return;
    }
    const piece = input.closest('[data-piece]');
    if (piece && input.dataset.field) {
      this.handlers.onPiece(piece.dataset.piece, input.dataset.field, Number(input.value));
    }
  }

  /** Push state, slider ranges and derived tooth counts into the panel. */
  sync(state, { info, ranges, teeth }) {
    for (const root of this.roots) {
      root.querySelectorAll('[data-setting]').forEach((input) => {
        const key = input.dataset.setting;
        applyRange(input, ranges[key]);
        writeValue(input, state[key]);
      });
      root.querySelectorAll('[data-piece]').forEach((form) => {
        const piece = form.dataset.piece;
        form.querySelectorAll('[data-field]').forEach((input) => {
          const field = input.dataset.field;
          applyRange(input, ranges[`${piece}.${field}`]);
          writeValue(input, state[piece][field]);
        });
      });
      root.querySelectorAll('[data-teeth]').forEach((output) => {
        output.textContent = teeth[output.dataset.teeth];
      });
    }
    this.info.innerHTML = info;
  }

  /** rangesOf(pen) -> { x: [min, max], y: [min, max], width: [min, max] } */
  renderPens(pens, selectedId, rangesOf) {
    this.penList.replaceChildren(
      ...pens.map((pen, i) => penRow(pen, i + 1, pen.id === selectedId, rangesOf(pen))),
    );
    this.penList.querySelectorAll('[data-pen-remove]').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onPenRemove(Number(button.closest('[data-pen-id]').dataset.penId));
      });
    });
    this.penList.querySelectorAll('[data-pen-id]').forEach((row) => {
      row.addEventListener('pointerdown', () => this.handlers.onPenSelect(Number(row.dataset.penId)));
    });
  }

  /** Update one pen's slider limits in place (re-rendering would steal focus). */
  setPenRanges(id, ranges) {
    const row = this.penList.querySelector(`[data-pen-id="${id}"]`);
    for (const [field, range] of Object.entries(ranges)) {
      applyRange(row?.querySelector(`[data-pen-field="${field}"]`), range);
    }
  }

  /** Toggle the selected row in place (re-rendering would steal focus). */
  highlightPen(id) {
    this.penList.querySelectorAll('[data-pen-id]').forEach((row) => {
      row.classList.toggle('selected', Number(row.dataset.penId) === id);
    });
  }
}

function penRow(pen, number, selected, ranges) {
  const slider = (field, label) => {
    const [min, max] = ranges[field];
    return `<label class="slider inline"><span>${label} <output>${pen[field]}</output></span>
      <input type="range" data-pen-field="${field}" min="${min}" max="${max}" value="${pen[field]}" /></label>`;
  };
  const row = document.createElement('li');
  row.className = selected ? 'pen selected' : 'pen';
  row.dataset.penId = pen.id;
  row.innerHTML = `
    <input type="color" data-pen-field="color" value="${pen.color}" title="Pen ${number} colour" />
    <div class="pen-sliders">${slider('x', 'x')}${slider('y', 'y')}${slider('width', 'width')}</div>
    <button type="button" data-pen-remove title="Remove pen ${number}">x</button>`;
  return row;
}

function applyRange(input, range) {
  if (!input || !range) return;
  [input.min, input.max] = range;
}

function readValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'range') return Number(input.value);
  return input.value;
}

function writeValue(input, value) {
  if (input.type === 'radio') input.checked = input.value === value;
  else if (input.type === 'checkbox') input.checked = Boolean(value);
  else input.value = value;
  if (input.type === 'range') showValue(input);
}

/** Mirror a slider's value into the <output> in its label. */
function showValue(input) {
  const output = input.closest('label')?.querySelector('output');
  if (output) output.textContent = input.value;
}
