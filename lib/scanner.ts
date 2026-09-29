/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Browser-side document scanning: corner detection (OpenCV.js, optional), perspective
 * correction, readability filters, rotation and JPEG export.
 * Everything except detectCorners() is plain canvas code and works offline.
 */
import { MAX_PAGE_BYTES } from "./validation";

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type FilterName = "scan" | "grey" | "color" | "original";

export const WORK_MAX = 1800; // longest side of the working image
export const OUTPUT_MAX = 1700; // longest side of the produced page
export const PREVIEW_MAX = 640; // longest side of the live preview (keeps sliders smooth)
const OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";

/* ------------------------------ OpenCV loader ------------------------------ */
/**
 * OpenCV.js is only used by detectCorners(). Nothing else in the scanner depends on it,
 * and every failure here resolves to `false` (never throws), so a blocked or slow download
 * cannot break rotation, filters, manual corners or "Use original photo".
 */
let cvPromise: Promise<boolean> | null = null;

const cvReady = () => Boolean((window as any).cv?.Mat);

export function loadOpenCv(): Promise<boolean> {
  if (cvReady()) return Promise.resolve(true);
  if (cvPromise) return cvPromise;

  const attempt = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (okay: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(okay);
    };
    const timer = window.setTimeout(() => finish(cvReady()), 25000);

    try {
      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;
      script.onerror = () => finish(false);
      script.onload = () => {
        try {
          const w = window as any;
          if (cvReady()) return finish(true);
          const cvObj = w.cv;
          if (!cvObj) return finish(false);
          // Older builds: runtime initialises asynchronously.
          cvObj.onRuntimeInitialized = () => finish(true);
          // Newer builds: `cv` is a promise-like resolving to the module.
          if (typeof cvObj.then === "function") {
            cvObj.then((mod: any) => {
              if (mod?.Mat) w.cv = mod;
              finish(cvReady());
            }, () => finish(false));
          }
        } catch {
          finish(false);
        }
      };
      document.head.appendChild(script);
    } catch {
      finish(false);
    }
  });

  cvPromise = attempt;
  // A failed attempt must not be cached forever, so "Detect edges" can try again.
  attempt.then((okay) => {
    if (!okay && cvPromise === attempt) cvPromise = null;
  });
  return attempt;
}

/* --------------------------------- Geometry -------------------------------- */
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function insetQuad(w: number, h: number, inset: number): Quad {
  const dx = w * inset;
  const dy = h * inset;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = points.slice().sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const d = p.x + p.y;
    if (d < best) {
      best = d;
      start = i;
    }
  });
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]) as Quad;
}

/** Homography mapping the destination rectangle onto the source quad (8 coefficients). */
function solveHomography(dst: Point[], src: Point[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = src[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      [A[pivot], A[col]] = [A[col], A[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }
    for (let r = col + 1; r < 8; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < 8; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = new Array<number>(8).fill(0);
  for (let row = 7; row >= 0; row--) {
    let sum = b[row];
    for (let c = row + 1; c < 8; c++) sum -= A[row][c] * h[c];
    h[row] = sum / A[row][row];
  }
  return h;
}

const newCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Perspective-corrects the quad out of a canvas into a straight, upright page. */
export function warpQuad(source: HTMLCanvasElement, quad: Quad, maxSide = OUTPUT_MAX): HTMLCanvasElement {
  let outW = Math.max(40, Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]))));
  let outH = Math.max(40, Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]))));
  const longest = Math.max(outW, outH);
  if (longest > maxSide) {
    const k = maxSide / longest;
    outW = Math.round(outW * k);
    outH = Math.round(outH * k);
  }

  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = solveHomography(dstPts, quad);
  const out = newCanvas(outW, outH);
  const outCtx = out.getContext("2d") as CanvasRenderingContext2D;

  if (!h) {
    outCtx.drawImage(source, 0, 0, source.width, source.height, 0, 0, outW, outH);
    return out;
  }

  const srcData = (source.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(
    0,
    0,
    source.width,
    source.height,
  );
  const { width: sw, height: sh, data: sp } = srcData;
  const outData = outCtx.createImageData(outW, outH);
  const op = outData.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = h[6] * x + h[7] * y + 1;
      const u = (h[0] * x + h[1] * y + h[2]) / denom;
      const v = (h[3] * x + h[4] * y + h[5]) / denom;
      const o = (y * outW + x) * 4;
      if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) {
        op[o] = op[o + 1] = op[o + 2] = 255;
        op[o + 3] = 255;
        continue;
      }
      const x0 = u | 0;
      const y0 = v | 0;
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = u - x0;
      const fy = v - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sp[i00 + c] + (sp[i10 + c] - sp[i00 + c]) * fx;
        const bottom = sp[i01 + c] + (sp[i11 + c] - sp[i01 + c]) * fx;
        op[o + c] = top + (bottom - top) * fy;
      }
      op[o + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

/* --------------------------------- Filters --------------------------------- */
function percentiles(hist: Uint32Array, total: number, lowP: number, highP: number): [number, number] {
  let acc = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * lowP) {
      low = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= total * (1 - highP)) {
      high = i;
      break;
    }
  }
  if (high <= low) return [0, 255];
  return [low, high];
}

/** Adaptive threshold via an integral image: the classic black-on-white "scanned" look. */
function filterScan(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data: d } = img;

  const grey = new Float64Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) grey[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += grey[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(8, Math.round(Math.min(w, h) / 22));
  const bias = 0.93;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const value = grey[y * w + x];
      const out = value < (sum / area) * bias ? Math.max(0, Math.min(70, value * 0.35)) : 255;
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = out;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function filterGrey(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g]++;
  }
  const [low, high] = percentiles(hist, d.length / 4, 0.02, 0.98);
  const span = Math.max(1, high - low);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(0, Math.min(255, ((d[i] - low) / span) * 255));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

/** Keeps colours but lifts the paper towards white. */
function filterColour(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
  const [low, high] = percentiles(hist, d.length / 4, 0.05, 0.95);
  const span = Math.max(1, high - low);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, ((d[i + c] - low) / span) * 255));
  }
  ctx.putImageData(img, 0, 0);
}

/** Brightness (-60..60) and contrast (0.7..1.8, 1 = unchanged). */
export function applyAdjust(canvas: HTMLCanvasElement, brightness: number, contrast: number) {
  if (brightness === 0 && contrast === 1) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - 128) * contrast + 128 + brightness));
  }
  ctx.putImageData(img, 0, 0);
}

export function applyFilter(canvas: HTMLCanvasElement, filter: FilterName) {
  if (filter === "scan") filterScan(canvas);
  else if (filter === "grey") filterGrey(canvas);
  else if (filter === "color") filterColour(canvas);
}

/* ------------------------------ Corner detection ---------------------------- */
export function detectCorners(source: HTMLCanvasElement): Quad | null {
  const cv = (window as any).cv;
  if (!cv?.Mat) return null;
  // Any OpenCV failure returns null instead of throwing, so the scanner keeps working.

  const k = Math.min(1, 700 / Math.max(source.width, source.height));
  const small = newCanvas(Math.round(source.width * k), Math.round(source.height * k));
  (small.getContext("2d") as CanvasRenderingContext2D).drawImage(source, 0, 0, small.width, small.height);

  const mats: any[] = [];
  let contours: any = null;
  let quad: Quad | null = null;
  try {
    const src = cv.imread(small);
    const grey = new cv.Mat();
    const blur = new cv.Mat();
    const edges = new cv.Mat();
    const hierarchy = new cv.Mat();
    mats.push(src, grey, blur, edges, hierarchy);
    cv.cvtColor(src, grey, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(grey, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blur, edges, 60, 180);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    mats.push(kernel);
    cv.dilate(edges, edges, kernel);

    contours = new cv.MatVector();
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = small.width * small.height * 0.15;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > bestArea) {
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const pts: Point[] = [];
          for (let p = 0; p < 4; p++) pts.push({ x: approx.data32S[p * 2] / k, y: approx.data32S[p * 2 + 1] / k });
          quad = orderCorners(pts);
          bestArea = area;
        }
        approx.delete();
      }
      contour.delete();
    }
  } catch {
    quad = null;
  } finally {
    mats.forEach((m) => m?.delete?.());
    contours?.delete?.();
  }
  return quad;
}

/* ----------------------- Live pipeline (no stacking) ----------------------- */
export type ScanSettings = { filter: FilterName; brightness: number; contrast: number };

export const DEFAULT_ADJUST = { brightness: 0, contrast: 1 } as const;

/**
 * Draws `base` (an UNFILTERED, perspective-corrected page) onto `target`, then applies the
 * selected filter, brightness and contrast. `base` is never modified, so switching
 * Scan -> Greyscale -> Colour -> No filter always starts again from the clean pixels.
 */
export function drawFinished(base: HTMLCanvasElement, target: HTMLCanvasElement, settings: ScanSettings) {
  if (target.width !== base.width) target.width = base.width;
  if (target.height !== base.height) target.height = base.height;
  const ctx = target.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(base, 0, 0);
  applyFilter(target, settings.filter);
  applyAdjust(target, settings.brightness, settings.contrast);
}

/** Full pipeline for the final page: source -> crop/perspective -> filter -> brightness -> contrast. */
export function renderPage(source: HTMLCanvasElement, quad: Quad, settings: ScanSettings, maxSide = OUTPUT_MAX): HTMLCanvasElement {
  const base = warpQuad(source, quad, maxSide);
  const out = newCanvas(base.width, base.height);
  drawFinished(base, out, settings);
  return out;
}

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

/** True when the four corners form a convex quadrilateral with a sensible size. */
export function isUsableQuad(quad: Quad, width: number, height: number): boolean {
  const signs = [0, 1, 2, 3].map((i) => Math.sign(cross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4])));
  if (signs.some((v) => v === 0) || !signs.every((v) => v === signs[0])) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) area += quad[i].x * quad[(i + 1) % 4].y - quad[(i + 1) % 4].x * quad[i].y;
  return Math.abs(area) / 2 > width * height * 0.01;
}

/** Moves the corners together with the image when it is rotated by 90 degrees. */
export function rotateQuad(quad: Quad, direction: "cw" | "ccw", oldWidth: number, oldHeight: number): Quad {
  const moved = quad.map((p) => (direction === "cw" ? { x: oldHeight - p.y, y: p.x } : { x: p.y, y: oldWidth - p.x }));
  return orderCorners(moved);
}

/* --------------------------------- Helpers --------------------------------- */
export function rotateCanvas(source: HTMLCanvasElement, direction: "cw" | "ccw"): HTMLCanvasElement {
  const out = newCanvas(source.height, source.width);
  const ctx = out.getContext("2d") as CanvasRenderingContext2D;
  if (direction === "cw") {
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, out.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, 0, 0);
  return out;
}

/** Decodes an image file (EXIF orientation applied by the browser) onto a canvas no larger than `max`. */
export async function fileToCanvas(file: File, max: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file is not a readable image."));
      el.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = newCanvas(Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the page."))), "image/jpeg", quality),
  );
}

/** JPEG export that always stays below the upload limit (lowers quality, then size, if needed). */
export async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<{ blob: Blob; width: number; height: number }> {
  let current = canvas;
  for (let round = 0; round < 4; round++) {
    for (const quality of [0.85, 0.72, 0.6]) {
      const blob = await toBlob(current, quality);
      if (blob.size <= MAX_PAGE_BYTES) return { blob, width: current.width, height: current.height };
    }
    const smaller = newCanvas(Math.round(current.width * 0.8), Math.round(current.height * 0.8));
    (smaller.getContext("2d") as CanvasRenderingContext2D).drawImage(current, 0, 0, smaller.width, smaller.height);
    current = smaller;
  }
  throw new Error("This page is too detailed to compress. Retake it at a lower resolution.");
}
