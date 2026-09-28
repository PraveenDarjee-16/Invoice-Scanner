"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CollectionDef } from "@/lib/cms";
import { ApiError, apiFetch, postJson } from "@/lib/api";
import { slugify } from "@/lib/validation";
import { Icon, Spinner } from "../Icon";
import { useToast } from "../Providers";

type Initial = { id: string; title: string; slug: string; published: boolean; sortOrder: number; data: Record<string, unknown> };

export function ContentForm({ def, initial }: { def: CollectionDef; initial?: Initial }) {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [published, setPublished] = useState(initial?.published ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const start: Record<string, string | boolean> = {};
    for (const f of def.fields) {
      const raw = initial?.data?.[f.name];
      start[f.name] = f.type === "boolean" ? raw === true : raw === undefined || raw === null ? "" : String(raw);
    }
    return start;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }));

  async function uploadImage(name: string, file: File | undefined) {
    if (!file) return;
    setUploading(name);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await apiFetch<{ url: string }>("/api/admin/media", { method: "POST", body: form });
      set(name, res.url);
      toast("Image uploaded.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Image upload failed.", "error");
    } finally {
      setUploading(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body = { title, slug, published, sortOrder: Number(sortOrder) || 0, data: values };
      if (initial) await postJson(`/api/admin/content/${def.key}/${initial.id}`, body, "PUT");
      else await postJson(`/api/admin/content/${def.key}`, body);
      toast(`${def.singular} saved.`, "ok");
      router.push(`/admin/content/${def.key}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast(err instanceof Error ? err.message : "Could not save.", "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5" noValidate>
      <div>
        <label className="label" htmlFor="c-title">
          Title
        </label>
        <input
          id="c-title"
          className={`input ${errors.title ? "input-invalid" : ""}`}
          value={title}
          maxLength={160}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        <p className="field-error">{errors.title}</p>
      </div>

      {def.fields.map((f) => {
        const id = `c-${f.name}`;
        const error = errors[`data.${f.name}`];
        const value = values[f.name];
        return (
          <div key={f.name}>
            {f.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" className="size-4 accent-[#0b7a5b]" checked={value === true} onChange={(e) => set(f.name, e.target.checked)} />
                {f.label}
              </label>
            ) : (
              <>
                <label className="label" htmlFor={id}>
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea id={id} className={`input ${error ? "input-invalid" : ""}`} maxLength={f.maxLength} value={String(value)} onChange={(e) => set(f.name, e.target.value)} />
                ) : f.type === "select" ? (
                  <select id={id} className={`input ${error ? "input-invalid" : ""}`} value={String(value)} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">{f.required ? "Choose..." : "None"}</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "image" ? (
                  <div className="space-y-2">
                    {value && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(value)} alt="" className="max-h-40 rounded-lg border border-line" />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn btn-ghost btn-sm cursor-pointer">
                        {uploading === f.name ? <Spinner className="size-4" /> : <Icon name="upload" className="size-4" />}
                        Upload image
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { uploadImage(f.name, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      {value && (
                        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => set(f.name, "")}>
                          Remove
                        </button>
                      )}
                    </div>
                    <input id={id} className={`input ${error ? "input-invalid" : ""}`} placeholder="...or paste an image address" value={String(value)} onChange={(e) => set(f.name, e.target.value)} />
                  </div>
                ) : (
                  <input
                    id={id}
                    className={`input ${error ? "input-invalid" : ""}`}
                    type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                    inputMode={f.type === "url" ? "url" : undefined}
                    maxLength={f.maxLength}
                    value={String(value)}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </>
            )}
            {f.help && <p className="field-help">{f.help}</p>}
            <p className="field-error">{error}</p>
          </div>
        );
      })}

      <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="c-slug">
            URL name
          </label>
          <input
            id="c-slug"
            className={`input ${errors.slug ? "input-invalid" : ""}`}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
          <p className="field-error">{errors.slug}</p>
        </div>
        <div>
          <label className="label" htmlFor="c-order">
            Order
          </label>
          <input id="c-order" type="number" className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          <p className="field-help">Lower numbers appear first.</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm font-semibold text-ink">
          <input type="checkbox" className="size-4 accent-[#0b7a5b]" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => router.push(`/admin/content/${def.key}`)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || uploading !== null}>
          {busy && <Spinner className="size-4" />}
          {initial ? "Save changes" : `Add ${def.singular.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
