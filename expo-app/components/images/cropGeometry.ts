/**
 * The arithmetic behind the crop dialog, kept apart from the drawing so it can be reasoned about.
 *
 * A picture of `width` × `height` pixels is shown in a square frame. The person zooms and drags it;
 * what is inside the frame is what gets uploaded. Zoom 1 fits the whole picture inside the frame
 * (clear space on two sides unless it is square); `fillZoom` makes it fill the frame exactly.
 * Offsets are fractions of the frame, so they do not depend on how big the frame is drawn.
 */

export interface PictureSize { width: number; height: number }

export interface CropView {
  zoom: number;
  /** Where the picture's centre sits, from the frame's centre, as a fraction of the frame. */
  offsetX: number;
  offsetY: number;
}

/** The square cut out of the picture, in its own pixels. It may reach past the picture's edges. */
export interface CropRegion { x: number; y: number; size: number }

/** Stored pictures are at most this many pixels across; the server refuses larger. */
export const MAX_OUTPUT_SIZE = 1024;
const MIN_OUTPUT_SIZE = 16;
/** How far past filling the frame a person may zoom in. */
const MAX_ZOOM_PAST_FILL = 4;

export const fillZoom = (p: PictureSize) => Math.max(p.width, p.height) / Math.min(p.width, p.height);
export const maxZoom = (p: PictureSize) => fillZoom(p) * MAX_ZOOM_PAST_FILL;

/** Pictures open filling the frame: the usual case for a photo. "Fit" is one tap away. */
export const initialView = (p: PictureSize): CropView => ({ zoom: fillZoom(p), offsetX: 0, offsetY: 0 });

/** The picture's size, as a fraction of the frame, at a zoom. */
function shownSize(p: PictureSize, zoom: number) {
  const longest = Math.max(p.width, p.height);
  return { w: (p.width / longest) * zoom, h: (p.height / longest) * zoom };
}

/**
 * Keeps zoom in range and the picture where it can be: a picture larger than the frame cannot be
 * dragged so far that clear space shows on that side, and a smaller one stays inside the frame.
 */
export function clampView(p: PictureSize, view: CropView): CropView {
  const zoom = Math.min(maxZoom(p), Math.max(1, view.zoom));
  const { w, h } = shownSize(p, zoom);
  const limitX = Math.abs(w - 1) / 2;
  const limitY = Math.abs(h - 1) / 2;
  return {
    zoom,
    offsetX: Math.min(limitX, Math.max(-limitX, view.offsetX)),
    offsetY: Math.min(limitY, Math.max(-limitY, view.offsetY)),
  };
}

/** Where to draw the picture inside a frame `frame` units across, for the dialog's preview. */
export function previewLayout(p: PictureSize, view: CropView, frame: number) {
  const { w, h } = shownSize(p, view.zoom);
  return {
    left: frame * (0.5 + view.offsetX - w / 2),
    top: frame * (0.5 + view.offsetY - h / 2),
    width: frame * w,
    height: frame * h,
  };
}

/** The square of the picture inside the frame. */
export function cropRegion(p: PictureSize, view: CropView): CropRegion {
  const size = Math.max(p.width, p.height) / view.zoom;
  return {
    x: p.width / 2 - view.offsetX * size - size / 2,
    y: p.height / 2 - view.offsetY * size - size / 2,
    size,
  };
}

/** Whether the region reaches past the picture, so the output needs clear space. */
export function needsPadding(p: PictureSize, r: CropRegion) {
  const slack = 0.5;
  return r.x < -slack || r.y < -slack || r.x + r.size > p.width + slack || r.y + r.size > p.height + slack;
}

/** Pixels across of the uploaded picture: the region's own size, never enlarged, at most 1024. */
export const outputSize = (r: CropRegion) =>
  Math.max(MIN_OUTPUT_SIZE, Math.min(MAX_OUTPUT_SIZE, Math.round(r.size)));

/** Where to draw the whole picture on an output `size` pixels across so that `r` fills it. */
export function outputLayout(p: PictureSize, r: CropRegion, size: number) {
  const scale = size / r.size;
  return { left: -r.x * scale, top: -r.y * scale, width: p.width * scale, height: p.height * scale };
}
