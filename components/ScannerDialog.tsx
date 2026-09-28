"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  applyAdjust,
  applyFilter,
  canvasToJpeg,
  detectCorners,
  fileToCanvas,
  insetQuad,
  loadOpenCv,
  rotateCanvas,
  warpQuad,
  WORK_MAX,
  type FilterName,
  type Quad,
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

export function ScannerDialog({ file, onDone }: { file: File; onDone: (result: ScanResult | null) => void }) {
  const toast = useToast();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const quadRef = useRef<Quad | null>(null);
  const scaleRef = useRef(1);
  const dragRef = useRef(-1);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading the photo...");
  const [filter, setFilter] = useState<FilterName>("scan");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [busy, setBusy] = useState(false);

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

  const layout = useCallback(() => {
    const src = sourceRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!src || !canvas || !overlay || !stage || !box) return;

    const availW = Math.max(240, stage.clientWidth);
    const availH = Math.max(240, Math.round(window.innerHeight * 0.5));
    const scale = Math.min(availW / src.width, availH / src.height, 1);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
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

  // Load the photo.
  useEffect(() => {
    let cancelled = false;
    fileToCanvas(file, WORK_MAX)
      .then((canvas) => {
        if (cancelled) return;
        sourceRef.current = canvas;
        quadRef.current = insetQuad(canvas.width, canvas.height, 0.05);
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

  // Draw, then try automatic edge detection.
  useEffect(() => {
    if (!ready) return;
    layout();
    setStatus("Looking for the page edges...");
    let cancelled = false;
    loadOpenCv().then((available) => {
      if (cancelled || !sourceRef.current) return;
      const found = available ? detectCorners(sourceRef.current) : null;
      if (found) {
        quadRef.current = found;
        setStatus("Edges found. Drag a corner if something is off.");
      } else {
        setStatus(available ? "No clear edges found. Drag the corners onto the page." : "Automatic detection is unavailable. Drag the corners onto the page.");
      }
      drawOverlay();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, layout, drawOverlay]);

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

  /* ------------------------- corner dragging ------------------------- */
  const pointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const quad = quadRef.current;
    if (!quad) return;
    const p = pointer(e);
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
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const quad = quadRef.current;
    const src = sourceRef.current;
    if (dragRef.current === -1 || !quad || !src) return;
    const p = pointer(e);
    quad[dragRef.current] = {
      x: Math.max(0, Math.min(src.width, p.x / scaleRef.current)),
      y: Math.max(0, Math.min(src.height, p.y / scaleRef.current)),
    };
    drawOverlay();
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

  /* ------------------------------ tools ------------------------------ */
  async function redetect() {
    if (!sourceRef.current) return;
    setStatus("Looking for the page edges...");
    const available = await loadOpenCv();
    const found = available ? detectCorners(sourceRef.current) : null;
    if (found) {
      quadRef.current = found;
      setStatus("Edges found. Drag a corner if something is off.");
    } else {
      setStatus(available ? "No clear edges found. Drag the corners onto the page." : "Automatic detection is unavailable. Drag the corners onto the page.");
    }
    drawOverlay();
  }

  function wholeImage() {
    const src = sourceRef.current;
    if (!src) return;
    quadRef.current = insetQuad(src.width, src.height, 0);
    setStatus("Using the whole image.");
    drawOverlay();
  }

  function rotate(direction: "cw" | "ccw") {
    const src = sourceRef.current;
    if (!src) return;
    const rotated = rotateCanvas(src, direction);
    sourceRef.current = rotated;
    quadRef.current = insetQuad(rotated.width, rotated.height, 0.04);
    layout();
    setStatus("Rotated. Check the corners.");
  }

  async function accept() {
    const src = sourceRef.current;
    const quad = quadRef.current;
    if (!src || !quad || busy) return;
    setBusy(true);
    setStatus("Processing the page...");
    await new Promise((r) => window.setTimeout(r, 30)); // let the status paint first
    try {
      const page = warpQuad(src, quad);
      applyFilter(page, filter);
      applyAdjust(page, brightness, contrast);
      onDoneRef.current(await canvasToJpeg(page));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That page could not be processed. Try taking the photo again.", "error");
      setBusy(false);
      setStatus("Processing failed. Try again or use the original photo.");
    }
  }

  async function useOriginal() {
    const src = sourceRef.current;
    if (!src || busy) return;
    setBusy(true);
    setStatus("Preparing the photo...");
    try {
      onDoneRef.current(await canvasToJpeg(src));
    } catch (err) {
      toast(err instanceof Error ? err.message : "The photo could not be prepared.", "error");
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
      active ? "border-accent bg-accent-soft text-accent-dark" : "border-line bg-white text-ink hover:bg-paper"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="scan-title">
      <div className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5">
        <div className="mb-3">
          <h2 id="scan-title" className="text-lg font-bold">
            Adjust the corners
          </h2>
          <p className="min-h-5 text-sm text-muted" aria-live="polite">
            {status}
          </p>
        </div>

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

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(false)} onClick={redetect} disabled={!ready || busy}>
            <Icon name="scan" className="size-4" /> Detect edges
          </button>
          <button type="button" className={chip(false)} onClick={wholeImage} disabled={!ready || busy}>
            Whole image
          </button>
          <button type="button" className={chip(false)} onClick={() => rotate("ccw")} disabled={!ready || busy} aria-label="Rotate left">
            <Icon name="rotateCcw" className="size-4" /> Left
          </button>
          <button type="button" className={chip(false)} onClick={() => rotate("cw")} disabled={!ready || busy} aria-label="Rotate right">
            <Icon name="rotateCw" className="size-4" /> Right
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Page finish">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={chip(filter === f.key)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <label className="block">
            <span className="label !mb-0.5">Brightness</span>
            <input type="range" min={-60} max={60} step={5} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-[#0b7a5b]" />
          </label>
          <label className="block">
            <span className="label !mb-0.5">Contrast</span>
            <input type="range" min={0.7} max={1.8} step={0.05} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-[#0b7a5b]" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)} disabled={busy}>
            Discard
          </button>
          <button type="button" className="btn btn-ghost" onClick={useOriginal} disabled={!ready || busy}>
            Use original photo
          </button>
          <button type="button" className="btn btn-primary" onClick={accept} disabled={!ready || busy}>
            {busy ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
            Use this page
          </button>
        </div>
      </div>
    </div>
  );
}
