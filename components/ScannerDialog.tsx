"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  canvasToJpeg,
  DEFAULT_ADJUST,
  detectCorners,
  drawFinished,
  fileToCanvas,
  insetQuad,
  isUsableQuad,
  loadOpenCv,
  OUTPUT_MAX,
  PREVIEW_MAX,
  renderPage,
  rotateCanvas,
  rotateQuad,
  warpQuad,
  WORK_MAX,
  type FilterName,
  type Quad,
  type ScanSettings,
} from "@/lib/scanner";
import { Icon, Spinner } from "./Icon";
import { useToast } from "./Providers";

export type ScanResult = { blob: Blob; width: number; height: number };

const HANDLE_GRAB = 34;
const FILTERS: { key: FilterName; label: string }[] = [
  { key: "scan", label: "Scan" },
  { key: "grey", label: "Greyscale" },
  { key: "color", label: "Colour" },
  { key: "original", label: "No filter" },
];
const CROSSED = "The corners cross each other. Drag them so they outline the page.";

/**
 * Pipeline (always in this order, always from the clean source, so nothing stacks):
 *   source photo -> crop + perspective -> selected filter -> brightness + contrast -> preview
 * The perspective step is cached in `baseRef` and only redone when the corners, rotation or photo
 * change. Filter / brightness / contrast changes re-run only the cheap part on a copy of it.
 */
export function ScannerDialog({ file, onDone }: { file: File; onDone: (result: ScanResult | null) => void }) {
  const toast = useToast();
  const onDoneRef = useRef(onDone);
  const aliveRef = useRef(true);

  const sourceRef = useRef<HTMLCanvasElement | null>(null); // current (rotated) working photo
  const quadRef = useRef<Quad | null>(null); // corners in source pixel coordinates
  const baseRef = useRef<HTMLCanvasElement | null>(null); // unfiltered perspective-corrected preview
  const baseDirtyRef = useRef(true);
  const touchedRef = useRef(false); // user moved corners -> automatic detection must not override them
  const rafRef = useRef(0);
  const scaleRef = useRef(1);
  const dragRef = useRef(-1);
  const settingsRef = useRef<ScanSettings>({ filter: "scan", ...DEFAULT_ADJUST });

  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLCanvasElement>(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading the photo...");
  const [filter, setFilter] = useState<FilterName>("scan");
  const [brightness, setBrightness] = useState<number>(DEFAULT_ADJUST.brightness);
  const [contrast, setContrast] = useState<number>(DEFAULT_ADJUST.contrast);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ------------------------------ live preview ------------------------------ */
  const renderResult = useCallback(() => {
    const src = sourceRef.current;
    const quad = quadRef.current;
    const out = resultRef.current;
    if (!src || !quad || !out) return;
    try {
      if (!isUsableQuad(quad, src.width, src.height)) {
        setProblem(CROSSED);
        return; // keep the last good preview on screen
      }
      if (baseDirtyRef.current || !baseRef.current) {
        baseRef.current = warpQuad(src, quad, PREVIEW_MAX);
        baseDirtyRef.current = false;
      }
      drawFinished(baseRef.current, out, settingsRef.current);
      setProblem(null);
    } catch (err) {
      console.error("[scanner] preview failed", err);
      setProblem("The preview could not be updated. Adjust the corners or press Whole image.");
    }
  }, []);

  /** Coalesces rapid changes (slider drags, corner drags) into one render per frame. */
  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (aliveRef.current) renderResult();
    });
  }, [renderResult]);

  /** The geometry changed (corners / rotation / photo): redo the perspective step. */
  const invalidate = useCallback(() => {
    baseDirtyRef.current = true;
    scheduleRender();
  }, [scheduleRender]);

  // Filter, brightness or contrast changed: re-render immediately from the cached base.
  useEffect(() => {
    settingsRef.current = { filter, brightness, contrast };
    if (ready) scheduleRender();
  }, [filter, brightness, contrast, ready, scheduleRender]);

  /* --------------------------- corner editor canvas -------------------------- */
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const quad = quadRef.current;
    if (!overlay || !quad) return;
    const ctx = overlay.getContext("2d") as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const s = scaleRef.current;
    const pts = quad.map((p) => ({ x: p.x * s, y: p.y * s }));

    ctx.save();
    ctx.fillStyle = "rgba(8, 18, 32, 0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, overlay.width, overlay.height);
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 3; i >= 1; i--) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();

    ctx.strokeStyle = "#2fd3a5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();

    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0b7a5b";
      ctx.stroke();
    });
  }, []);

  /** Sizes the editor canvases to the current photo (call again after rotating). */
  const layout = useCallback(() => {
    const src = sourceRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!src || !canvas || !overlay || !stage || !box) return;

    const availW = Math.max(200, stage.clientWidth - 16);
    const availH = Math.max(180, Math.round(window.innerHeight * (window.innerWidth < 768 ? 0.28 : 0.5)));
    const scale = Math.min(availW / src.width, availH / src.height, 1);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    scaleRef.current = scale;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    for (const c of [canvas, overlay]) {
      c.width = w;
      c.height = h;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(src, 0, 0, w, h);
    drawOverlay();
  }, [drawOverlay]);

  /* ------------------------------ edge detection ----------------------------- */
  const detect = useCallback(
    async (manual: boolean) => {
      if (!sourceRef.current) return;
      setDetecting(true);
      setStatus("Looking for the page edges...");
      let available = false;
      try {
        available = await loadOpenCv();
      } catch {
        available = false;
      }
      if (!aliveRef.current) return;

      let found: Quad | null = null;
      if (available && sourceRef.current) {
        try {
          found = detectCorners(sourceRef.current);
        } catch {
          found = null;
        }
      }

      if (found && (manual || !touchedRef.current)) {
        quadRef.current = found;
        drawOverlay();
        invalidate();
        setStatus("Edges found. Drag a corner if something is off.");
      } else if (!found) {
        const message = available
          ? "No clear page edges found. Drag the corners onto the page, or use Whole image."
          : "Automatic edge detection could not load. Drag the corners onto the page, or use Whole image.";
        setStatus(message);
        if (manual) toast(message, "error");
      }
      setDetecting(false);
    },
    [drawOverlay, invalidate, toast],
  );

  /* ------------------------------- load the photo ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    fileToCanvas(file, WORK_MAX)
      .then((canvas) => {
        if (cancelled) return;
        sourceRef.current = canvas;
        quadRef.current = insetQuad(canvas.width, canvas.height, 0.05);
        baseDirtyRef.current = true;
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        toast(err instanceof Error ? err.message : "That file is not a readable image.", "error");
        onDoneRef.current(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file, toast]);

  // First draw, then try automatic detection in the background (never blocks anything).
  useEffect(() => {
    if (!ready) return;
    layout();
    invalidate();
    setStatus("Drag the corners onto the page. Looking for edges automatically...");
    void detect(false);
  }, [ready, layout, invalidate, detect]);

  useEffect(() => {
    const onResize = () => layout();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onDoneRef.current(null);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [layout, busy]);

  /* ------------------------------ corner dragging ---------------------------- */
  const localPoint = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const quad = quadRef.current;
    if (!quad || busy) return;
    const p = localPoint(e);
    let closest = -1;
    let best = HANDLE_GRAB;
    quad.forEach((c, i) => {
      const d = Math.hypot(c.x * scaleRef.current - p.x, c.y * scaleRef.current - p.y);
      if (d < best) {
        best = d;
        closest = i;
      }
    });
    if (closest === -1) return;
    dragRef.current = closest;
    touchedRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const quad = quadRef.current;
    const src = sourceRef.current;
    if (dragRef.current === -1 || !quad || !src) return;
    const p = localPoint(e);
    quad[dragRef.current] = {
      x: Math.max(0, Math.min(src.width, p.x / scaleRef.current)),
      y: Math.max(0, Math.min(src.height, p.y / scaleRef.current)),
    };
    drawOverlay();
    invalidate(); // live preview follows the corner
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current === -1) return;
    dragRef.current = -1;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  /* ---------------------------------- tools ---------------------------------- */
  function wholeImage() {
    const src = sourceRef.current;
    if (!src) return;
    quadRef.current = insetQuad(src.width, src.height, 0);
    touchedRef.current = true;
    setStatus("Using the whole image.");
    drawOverlay();
    invalidate();
  }

  function rotate(direction: "cw" | "ccw") {
    const src = sourceRef.current;
    const quad = quadRef.current;
    if (!src) return;
    try {
      const rotated = rotateCanvas(src, direction);
      quadRef.current = quad ? rotateQuad(quad, direction, src.width, src.height) : insetQuad(rotated.width, rotated.height, 0.04);
      sourceRef.current = rotated;
      layout(); // new dimensions -> resize canvases, redraw photo and corners
      invalidate();
      setStatus(direction === "cw" ? "Rotated right." : "Rotated left.");
    } catch (err) {
      console.error("[scanner] rotate failed", err);
      toast("The photo could not be rotated. Try again.", "error");
    }
  }

  function resetAdjust() {
    setBrightness(DEFAULT_ADJUST.brightness);
    setContrast(DEFAULT_ADJUST.contrast);
  }

  /** Final page: full-resolution version of exactly what the preview shows. */
  async function accept() {
    const src = sourceRef.current;
    const quad = quadRef.current;
    if (!src || !quad || busy) return;
    if (!isUsableQuad(quad, src.width, src.height)) {
      setProblem(CROSSED);
      toast(CROSSED, "error");
      return;
    }
    setBusy(true);
    setProblem(null);
    setStatus("Processing the page...");
    await new Promise((r) => window.setTimeout(r, 30)); // let the status paint first
    try {
      const page = renderPage(src, quad, settingsRef.current, OUTPUT_MAX);
      const jpeg = await canvasToJpeg(page);
      onDoneRef.current(jpeg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "That page could not be processed.";
      console.error("[scanner] accept failed", err);
      setProblem(`${message} You can try again, use the original photo, or change the corners.`);
      toast(message, "error");
      if (aliveRef.current) {
        setBusy(false);
        setStatus("Processing failed. Nothing was lost; try again.");
      }
    }
  }

  /** Bypasses cropping and filters: the current (rotated) photo as it is. */
  async function useOriginal() {
    const src = sourceRef.current;
    if (!src || busy) return;
    setBusy(true);
    setProblem(null);
    setStatus("Preparing the photo...");
    try {
      const jpeg = await canvasToJpeg(src);
      onDoneRef.current(jpeg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The photo could not be prepared.";
      console.error("[scanner] original failed", err);
      setProblem(message);
      toast(message, "error");
      if (aliveRef.current) setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      active ? "border-accent bg-accent-soft text-accent-dark" : "border-line bg-white text-ink hover:bg-paper"
    }`;
  const locked = !ready || busy;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="scan-title">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5">
        <div className="mb-3">
          <h2 id="scan-title" className="text-lg font-bold">
            Scan this page
          </h2>
          <p className="min-h-5 text-sm text-muted" aria-live="polite">
            {status}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">1. Drag the corners onto the page</p>
            <div ref={stageRef} className="flex min-h-40 w-full justify-center rounded-xl bg-paper p-2">
              {!ready && (
                <div className="grid place-items-center text-muted">
                  <Spinner className="size-7" />
                </div>
              )}
              <div ref={boxRef} className="relative" hidden={!ready}>
                <canvas ref={canvasRef} className="block rounded" />
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 touch-none"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted">2. Result (live preview)</p>
            <div className="flex min-h-40 w-full items-center justify-center rounded-xl bg-paper p-2">
              {!ready && <Spinner className="size-7 text-muted" />}
              <canvas ref={resultRef} className="h-auto max-h-[28dvh] w-auto max-w-full rounded bg-white shadow md:max-h-[50dvh]" hidden={!ready} aria-label="Live preview of the scanned page" />
            </div>
          </div>
        </div>

        {problem && (
          <p className="alert alert-error mt-3" role="alert">
            {problem}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(false)} onClick={() => void detect(true)} disabled={locked || detecting}>
            {detecting ? <Spinner className="size-4" /> : <Icon name="scan" className="size-4" />} Detect edges
          </button>
          <button type="button" className={chip(false)} onClick={wholeImage} disabled={locked}>
            Whole image
          </button>
          <button type="button" className={chip(false)} onClick={() => rotate("ccw")} disabled={locked} aria-label="Rotate left">
            <Icon name="rotateCcw" className="size-4" /> Left
          </button>
          <button type="button" className={chip(false)} onClick={() => rotate("cw")} disabled={locked} aria-label="Rotate right">
            <Icon name="rotateCw" className="size-4" /> Right
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Page finish">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={chip(filter === f.key)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} disabled={locked}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <label className="block">
            <span className="label !mb-0.5 flex justify-between">
              Brightness <span className="font-normal text-muted">{brightness > 0 ? `+${brightness}` : brightness}</span>
            </span>
            <input type="range" min={-60} max={60} step={5} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} disabled={locked} className="w-full accent-[#0b7a5b]" />
          </label>
          <label className="block">
            <span className="label !mb-0.5 flex justify-between">
              Contrast <span className="font-normal text-muted">{contrast.toFixed(2)}x</span>
            </span>
            <input type="range" min={0.7} max={1.8} step={0.05} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} disabled={locked} className="w-full accent-[#0b7a5b]" />
          </label>
        </div>
        {(brightness !== DEFAULT_ADJUST.brightness || contrast !== DEFAULT_ADJUST.contrast) && (
          <button type="button" className="mt-1 self-start text-xs font-semibold text-accent-dark underline" onClick={resetAdjust} disabled={locked}>
            Reset brightness and contrast
          </button>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>
            Discard
          </button>
          <button type="button" className="btn btn-ghost" onClick={useOriginal} disabled={locked}>
            Use original photo
          </button>
          <button type="button" className="btn btn-primary" onClick={accept} disabled={locked}>
            {busy ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
            Use this page
          </button>
        </div>
      </div>
    </div>
  );
}
