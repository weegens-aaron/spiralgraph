# Spiralgraph

A browser Spirograph with configurable toothed pieces. No build step, no dependencies.

```sh
npm start          # serves on http://localhost:5173 (or: python3 -m http.server 5173)
npm test           # geometry / rolling maths tests (node --test)
```

## Features

- **Frame**: internal ring (tracer rolls inside) or external wheel (tracer rolls outside).
- **One shared tooth size** slider for both pieces. Bigger teeth means fewer of them on the
  same-sized pieces, which changes the gear ratio and therefore the pattern.
- **Pieces**: any rounded regular polygon, set with three whole-number sliders: sides,
  side length and corner roundedness (corner radius). The tooth count follows:
  `teeth = round(outline length / tooth size)`. Side length 0 gives a circle; 2 sides gives
  an oval "bar".
- **Adaptive slider ranges**: every slider's min/max follows the other settings, so you
  can't build something broken. Each piece keeps a minimum tooth count (frame 12, tracer 6),
  and in internal mode the tracer always fits inside the ring. Switching to internal with
  an oversized tracer shrinks it to fit, keeping its shape.
- **Tracer stays inside the ring**: pure rolling would let flat edges and big tracers poke
  through the wall, so each pose gets the smallest translation that keeps the tracer inside
  (a tiny exact cutting-plane solve), like a real piece bridging the curve.
- **Pens stay on the tracer**: pen x/y slider ranges follow the tracer's actual outline.
- **Export**: the whole drawing, uncropped, whatever the zoom: on the paper colour, or
  transparent.
- **Exact meshing**: each piece is nudged (by under half a tooth) so its outline is exactly
  `teeth x tooth size`, so the pattern closes when the maths says it will.
- **All controls are sliders** (focus one and use the arrow keys for single steps). Ranges
  adapt: e.g. the side-length max shrinks as you add sides, and Rotations tops out at the
  full pattern.
- **Pens**: as many as you like, each with its own colour, width and position on the tracer.
  In *Pens* mode, click inside the tracer to add one and drag a hole to move it.
- **Drawing**: set a start tooth, tracer offset and number of rotations, then *Animate* or
  draw *Instant*ly. *Full pattern* picks exactly enough rotations to close the curve.
  In *Roll* mode, drag anywhere to roll the tracer by hand.
- Undo per drawing session, clear, zoom (mouse wheel), fit, PNG export, paper colour.

## Layout

| File | Responsibility |
| --- | --- |
| `js/geometry.js` | `Shape`: rounded polygon parameterised by arc length |
| `js/pieces.js` | Whole-number piece model, tooth counts, outer slider limits, closure maths |
| `js/constraints.js` | The feasibility rules and the adaptive slider ranges derived from them (pens too) |
| `js/contain.js` | Keeps the tracer inside the ring (smallest-translation fix per pose) |
| `js/export.js` | Renders all ink to a PNG sized to its bounding box |
| `js/rolling.js` | `Roller`: rolling without slipping, adaptive sampling |
| `js/ink.js` | Drawn strokes in world coordinates (redraw, undo) |
| `js/render.js` | View transform and drawing of toothed pieces and pens |
| `js/ui.js` | Side-panel DOM binding (no app logic) |
| `js/pointer.js` | Canvas mouse interaction |
| `js/app.js` | App state and actions |

Note: a polygon tracer rolled inside a ring will overlap the ring slightly along its flat
edges. That's real geometry (a straight edge can't hug a concave curve), not a bug.
