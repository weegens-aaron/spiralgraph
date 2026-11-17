// export.js — renders the whole drawing to a PNG, whatever is on screen.
//
// Ink is stored in world coordinates, so instead of copying the (possibly
// zoomed or cropped) screen canvas we redraw every stroke into a canvas sized
// to the ink's bounding box, at the current zoom so line weights match.

const MARGIN_PX = 16;
const MAX_SIDE_PX = 8192; // stay well inside browser canvas limits

/** Download the ink as a PNG; background null = transparent. */
export function downloadInk(ink, view, background) {
  const bounds = ink.bounds();
  if (!bounds) return; // nothing drawn yet
  const pad = MARGIN_PX + bounds.maxWidth / 2;
  const widthPx = (bounds.maxX - bounds.minX) * view.scale + 2 * pad;
  const heightPx = (bounds.maxY - bounds.minY) * view.scale + 2 * pad;
  const ratio = Math.min(view.dpr, MAX_SIDE_PX / Math.max(widthPx, heightPx));

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(widthPx * ratio);
  canvas.height = Math.ceil(heightPx * ratio);
  const ctx = canvas.getContext('2d');
  ink.redraw(ctx, exportView(view.scale, ratio, bounds, pad));
  if (background) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // fill in pixels, not world units
    ctx.globalCompositeOperation = 'destination-over'; // paint behind the ink
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  canvas.toBlob((blob) => download(blob, 'spiralgraph.png'));
}

/** The slice of View that Ink.redraw needs, framed on the ink's bounds. */
function exportView(scale, ratio, bounds, pad) {
  return {
    scale,
    apply(ctx) {
      const k = scale * ratio;
      ctx.setTransform(k, 0, 0, -k, (pad - bounds.minX * scale) * ratio, (pad + bounds.maxY * scale) * ratio);
    },
    clear(ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
  };
}

function download(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
