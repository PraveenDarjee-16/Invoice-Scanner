"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch, postJson } from "@/lib/api";
import {
  MAX_INVOICES_PER_SUBMISSION,
  MAX_PAGES_PER_INVOICE,
  MAX_PAGES_PER_SUBMISSION,
  MAX_SOURCE_IMAGE_BYTES,
  toFileSlug,
} from "@/lib/validation";
import { formatBytes, plural } from "@/lib/format";
import { Icon, Spinner } from "./Icon";
import { useConfirm, useToast } from "./Providers";
import { ScannerDialog, type ScanResult } from "./ScannerDialog";

type PageItem = { id: string; blob: Blob; url: string; width: number; height: number };
type Draft = { id: string; name: string; pages: PageItem[] };
type Remote = {
  submissionId: string;
  code: string;
  invoices: { id: string; position: number }[];
  pagesDone: Set<string>;
  pdfDone: Set<string>;
};
type Phase = "edit" | "uploading" | "failed";

const uid = () => Math.random().toString(36).slice(2, 10);
const defaultName = (n: number) => `Invoice_${String(n).padStart(3, "0")}`;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const newDraft = (n: number): Draft => ({ id: uid(), name: defaultName(n), pages: [] });

export function UploadWorkspace() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [drafts, setDrafts] = useState<Draft[]>(() => [newDraft(1)]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [job, setJob] = useState<{ invoiceId: string; files: File[] } | null>(null);
  const [preview, setPreview] = useState<{ page: PageItem; index: number; total: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [progress, setProgress] = useState({ done: 0, total: 1, label: "" });
  const [failure, setFailure] = useState<{ message: string; status: number } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const remoteRef = useRef<Remote | null>(null);
  const finishedRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ invoiceId: string; index: number } | null>(null);

  const active = drafts.find((d) => d.id === activeId) ?? drafts[0];
  const totalPages = drafts.reduce((n, d) => n + d.pages.length, 0);
  const totalBytes = drafts.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.blob.size, 0), 0);

  /** Any edit invalidates a half-finished upload, so the next Upload All starts a fresh submission. */
  const edit = useCallback((fn: (list: Draft[]) => Draft[]) => {
    remoteRef.current = null;
    setDrafts(fn);
  }, []);

  // Warn before leaving with unsent pages.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (finishedRef.current || draftsRef.current.every((d) => d.pages.length === 0)) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // Free the page previews when the screen closes.
  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => d.pages.forEach((p) => URL.revokeObjectURL(p.url)));
    },
    [],
  );

  /* --------------------------- adding pages --------------------------- */
  function chooseFiles(list: FileList | null) {
    const files: File[] = [];
    for (const file of Array.from(list ?? [])) {
      if (!file.type.startsWith("image/")) toast(`"${file.name}" is not an image and was skipped.`, "error");
      else if (file.size > MAX_SOURCE_IMAGE_BYTES) toast(`"${file.name}" is larger than ${formatBytes(MAX_SOURCE_IMAGE_BYTES)}. Take it at a lower resolution.`, "error");
      else files.push(file);
    }
    if (files.length === 0) return;

    const room = MAX_PAGES_PER_INVOICE - active.pages.length;
    if (room <= 0) return toast(`An invoice can have up to ${MAX_PAGES_PER_INVOICE} pages.`, "error");
    if (files.length > room) toast(`Only ${plural(room, "more page")} fit in this invoice. The rest were skipped.`, "info");
    setJob({ invoiceId: active.id, files: files.slice(0, room) });
  }

  function onScanDone(result: ScanResult | null) {
    if (!job) return;
    const [, ...rest] = job.files;
    if (result) {
      const page: PageItem = { id: uid(), blob: result.blob, url: URL.createObjectURL(result.blob), width: result.width, height: result.height };
      edit((list) => list.map((d) => (d.id === job.invoiceId ? { ...d, pages: [...d.pages, page] } : d)));
    }
    setJob(rest.length > 0 ? { invoiceId: job.invoiceId, files: rest } : null);
  }

  /* --------------------------- page actions --------------------------- */
  function removePage(invoiceId: string, pageId: string) {
    edit((list) =>
      list.map((d) => {
        if (d.id !== invoiceId) return d;
        const gone = d.pages.find((p) => p.id === pageId);
        if (gone) URL.revokeObjectURL(gone.url);
        return { ...d, pages: d.pages.filter((p) => p.id !== pageId) };
      }),
    );
  }

  function movePage(invoiceId: string, from: number, to: number) {
    edit((list) =>
      list.map((d) => {
        if (d.id !== invoiceId || to < 0 || to >= d.pages.length || from === to) return d;
        const pages = d.pages.slice();
        const [item] = pages.splice(from, 1);
        pages.splice(to, 0, item);
        return { ...d, pages };
      }),
    );
  }

  /* ------------------------- invoice actions -------------------------- */
  function addInvoice() {
    if (drafts.length >= MAX_INVOICES_PER_SUBMISSION) return toast(`You can send up to ${MAX_INVOICES_PER_SUBMISSION} invoices in one upload.`, "error");
    const draft = newDraft(drafts.length + 1);
    edit((list) => [...list, draft]);
    setActiveId(draft.id);
  }

  async function removeInvoice(id: string) {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;
    if (target.pages.length > 0) {
      const yes = await confirm({
        title: `Remove ${target.name}?`,
        message: `Its ${plural(target.pages.length, "page")} will be discarded.`,
        confirmLabel: "Remove invoice",
        danger: true,
      });
      if (!yes) return;
    }
    target.pages.forEach((p) => URL.revokeObjectURL(p.url));
    const remaining = drafts.filter((d) => d.id !== id);
    const next = remaining.length > 0 ? remaining : [newDraft(1)];
    edit(() => next);
    setActiveId(next[0].id);
  }

  const renameInvoice = (id: string, name: string) => {
    setNameError(null);
    edit((list) => list.map((d) => (d.id === id ? { ...d, name } : d)));
  };

  /* ------------------------------ upload ------------------------------ */
  function validate(): { message: string; invoiceId: string } | null {
    for (const [i, d] of drafts.entries()) {
      if (d.pages.length === 0) return { message: `Invoice ${i + 1} (${d.name}) has no pages. Add pages or remove the invoice.`, invoiceId: d.id };
      if (d.name.trim().length < 2) return { message: `Give invoice ${i + 1} a name of at least 2 characters.`, invoiceId: d.id };
    }
    if (totalPages > MAX_PAGES_PER_SUBMISSION) {
      return { message: `One upload can hold up to ${MAX_PAGES_PER_SUBMISSION} pages. Send the rest in a second submission.`, invoiceId: drafts[0].id };
    }
    return null;
  }

  async function uploadPage(remote: Remote, invoiceId: string, position: number, page: PageItem) {
    for (let attempt = 1; ; attempt++) {
      try {
        const form = new FormData();
        form.set("invoiceId", invoiceId);
        form.set("position", String(position));
        form.set("width", String(page.width));
        form.set("height", String(page.height));
        form.set("file", page.blob, `page-${position}.jpg`);
        await apiFetch(`/api/submissions/${remote.submissionId}/pages`, { method: "POST", body: form });
        return;
      } catch (err) {
        const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        if (!retryable || attempt >= 3) throw err;
        await sleep(800 * attempt);
      }
    }
  }

  async function runUpload() {
    const list = draftsRef.current;
    let remote = remoteRef.current;

    if (!remote) {
      setProgress({ done: 0, total: 1, label: "Reserving your submission..." });
      const res = await postJson<{ submissionId: string; code: string; invoices: { id: string; position: number }[] }>("/api/submissions", {
        invoices: list.map((d) => ({ name: d.name.trim(), pageCount: d.pages.length })),
      });
      remote = { ...res, pagesDone: new Set(), pdfDone: new Set() };
      remoteRef.current = remote;
    }
    const current = remote;

    const pageCount = list.reduce((n, d) => n + d.pages.length, 0);
    const total = pageCount + list.length + 1;
    let done = current.pagesDone.size + current.pdfDone.size;
    const report = (label: string) => setProgress({ done, total, label });

    // 1. Page images, three at a time.
    const tasks: { invoiceId: string; position: number; page: PageItem; key: string }[] = [];
    list.forEach((d, di) =>
      d.pages.forEach((page, pi) => {
        const invoiceId = current.invoices[di].id;
        const key = `${invoiceId}:${pi + 1}`;
        if (!current.pagesDone.has(key)) tasks.push({ invoiceId, position: pi + 1, page, key });
      }),
    );
    report(`Uploading pages (${current.pagesDone.size} of ${pageCount})...`);
    let cursor = 0;
    let aborted = false;
    const worker = async () => {
      while (!aborted && cursor < tasks.length) {
        const task = tasks[cursor++];
        try {
          await uploadPage(current, task.invoiceId, task.position, task.page);
        } catch (err) {
          aborted = true;
          throw err;
        }
        current.pagesDone.add(task.key);
        done++;
        report(`Uploading pages (${current.pagesDone.size} of ${pageCount})...`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));

    // 2. One PDF per invoice, built on the server.
    for (const [di, d] of list.entries()) {
      const invoiceId = current.invoices[di].id;
      if (current.pdfDone.has(invoiceId)) continue;
      report(`Creating PDF ${di + 1} of ${list.length}: ${d.name}...`);
      await postJson(`/api/submissions/${current.submissionId}/invoices/${invoiceId}/pdf`, {});
      current.pdfDone.add(invoiceId);
      done++;
    }

    // 3. The ZIP.
    report("Creating the ZIP...");
    await postJson(`/api/submissions/${current.submissionId}/finalize`, {});
    done++;
    report("Done");
    finishedRef.current = true;
    router.push(`/submissions/${current.submissionId}?done=1`);
  }

  async function uploadAll() {
    const problem = validate();
    if (problem) {
      setActiveId(problem.invoiceId);
      setNameError(problem.message);
      toast(problem.message, "error");
      return;
    }
    setFailure(null);
    setPhase("uploading");
    try {
      await runUpload();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setFailure({ message: err instanceof Error ? err.message : "The upload failed. Please try again.", status });
      setPhase("failed");
    }
  }

  /* ------------------------------ render ------------------------------ */
  const activeIndex = drafts.findIndex((d) => d.id === active.id);
  const fileNamePreview = `${toFileSlug(active.name, defaultName(activeIndex + 1))}.pdf`;
  const uploading = phase !== "edit";

  return (
    <div className="space-y-4 pb-28">
      {/* invoice tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Invoices">
        {drafts.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === active.id}
            onClick={() => setActiveId(d.id)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
              d.id === active.id ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:bg-paper"
            }`}
          >
            <span className="max-w-[9rem] truncate">{d.name.trim() || `Invoice ${i + 1}`}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${d.id === active.id ? "bg-white/20" : "bg-paper text-muted"}`}>{d.pages.length}</span>
          </button>
        ))}
        <button type="button" onClick={addInvoice} className="btn btn-ghost shrink-0" disabled={uploading}>
          <Icon name="plus" className="size-4" />
          Add invoice
        </button>
      </div>

      {/* active invoice */}
      <section className="card space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="invoice-name">
              Invoice / PDF name
            </label>
            <input
              id="invoice-name"
              className={`input ${nameError && active.name.trim().length < 2 ? "input-invalid" : ""}`}
              value={active.name}
              maxLength={120}
              placeholder="ABC Traders September 2026"
              autoComplete="off"
              onChange={(e) => renameInvoice(active.id, e.target.value)}
              disabled={uploading}
            />
            <p className="field-help">
              Saved as <span className="font-semibold text-ink">{fileNamePreview}</span>
            </p>
          </div>
          {drafts.length > 1 && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => removeInvoice(active.id)} disabled={uploading}>
              <Icon name="trash" className="size-4" />
              Remove invoice
            </button>
          )}
        </div>

        {nameError && (
          <p className="alert alert-error" role="alert">
            {nameError}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => cameraRef.current?.click()} disabled={uploading || active.pages.length >= MAX_PAGES_PER_INVOICE}>
            <Icon name="camera" />
            Capture with camera
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => galleryRef.current?.click()} disabled={uploading || active.pages.length >= MAX_PAGES_PER_INVOICE}>
            <Icon name="image" />
            Choose from device
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files; chooseFiles(f); e.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; chooseFiles(f); e.target.value = ""; }} />

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-bold text-ink">Pages</h2>
            <p className="text-sm text-muted">
              {plural(active.pages.length, "page")} of {MAX_PAGES_PER_INVOICE}
            </p>
          </div>

          {active.pages.length === 0 ? (
            <div className="empty">
              <p className="font-semibold text-ink">Start with the first page</p>
              <p className="mx-auto mt-1 max-w-md text-sm">Lay the invoice flat, fill the frame and keep all four corners visible. The scanner straightens and cleans it for you. Pages can be reordered afterwards.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {active.pages.map((page, index) => (
                <li
                  key={page.id}
                  draggable={!uploading}
                  onDragStart={(e) => {
                    dragRef.current = { invoiceId: active.id, index };
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => dragRef.current && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragRef.current;
                    dragRef.current = null;
                    if (from && from.invoiceId === active.id) movePage(active.id, from.index, index);
                  }}
                  className="overflow-hidden rounded-xl border border-line bg-white"
                >
                  <div className="relative">
                    <button type="button" className="block w-full bg-paper" onClick={() => setPreview({ page, index, total: active.pages.length })} aria-label={`Preview page ${index + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={page.url} alt={`Scanned page ${index + 1}`} className="aspect-[3/4] w-full object-contain" draggable={false} />
                    </button>
                    <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">{index + 1}</span>
                    <button
                      type="button"
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/95 text-danger shadow"
                      onClick={() => removePage(active.id, page.id)}
                      disabled={uploading}
                      aria-label={`Remove page ${index + 1}`}
                      title="Remove page"
                    >
                      <Icon name="x" className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <span className="text-xs text-muted">Page {index + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" className="grid size-8 place-items-center rounded-lg border border-line hover:bg-paper disabled:opacity-40" onClick={() => movePage(active.id, index, index - 1)} disabled={index === 0 || uploading} aria-label={`Move page ${index + 1} earlier`} title="Move earlier">
                        <Icon name="arrowLeft" className="size-4" />
                      </button>
                      <button type="button" className="grid size-8 place-items-center rounded-lg border border-line hover:bg-paper disabled:opacity-40" onClick={() => movePage(active.id, index, index + 1)} disabled={index === active.pages.length - 1 || uploading} aria-label={`Move page ${index + 1} later`} title="Move later">
                        <Icon name="arrowRight" className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm">
            <span className="font-bold text-ink">{plural(drafts.length, "invoice")}</span>
            <span className="text-muted">
              {" "}
              · {plural(totalPages, "page")} · about {formatBytes(totalBytes)}
            </span>
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={uploadAll} disabled={uploading || totalPages === 0}>
            <Icon name="upload" />
            Upload All
          </button>
        </div>
      </div>

      {/* scanner */}
      {job && job.files[0] && <ScannerDialog key={`${job.files[0].name}-${job.files.length}-${job.files[0].size}`} file={job.files[0]} onDone={onScanDone} />}

      {/* preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink/85 p-4" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label="Page preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.page.url} alt={`Page ${preview.index + 1}`} className="max-h-[80dvh] max-w-full rounded-lg bg-white object-contain" />
          <p className="text-sm text-white">
            Page {preview.index + 1} of {preview.total}
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
            Close
          </button>
        </div>
      )}

      {/* upload progress */}
      {uploading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="progress-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            {phase === "uploading" ? (
              <>
                <h2 id="progress-title" className="flex items-center gap-2 text-lg font-bold">
                  <Spinner className="size-5 text-accent" />
                  Sending your invoices
                </h2>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress.done / progress.total) * 100)}>
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                </div>
                <p className="mt-3 text-sm">{progress.label}</p>
                <p className="mt-1 text-xs text-muted">Keep this screen open until it finishes.</p>
              </>
            ) : (
              <>
                <h2 id="progress-title" className="text-lg font-bold text-danger">
                  Upload not finished
                </h2>
                <p className="alert alert-error mt-3" role="alert">
                  {failure?.message}
                </p>
                {failure?.status === 401 && <p className="mt-2 text-sm">Sign in again in a new browser tab, then press Retry here. Your pages are still on this screen.</p>}
                <p className="mt-2 text-sm text-muted">Pages that already arrived are not sent twice.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setPhase("edit")}>
                    Back to editing
                  </button>
                  <button type="button" className="btn btn-primary" onClick={uploadAll}>
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
