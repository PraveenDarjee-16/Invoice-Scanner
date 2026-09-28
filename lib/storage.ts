import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { put, get, del } from "@vercel/blob";

/**
 * File storage. Production always uses a PRIVATE Vercel Blob store.
 * In development, when no Blob credentials exist, files go to ./.local-storage so
 * `npm run dev` works without any cloud account. That fallback is never used in production.
 */
const localMode =
  !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && process.env.NODE_ENV !== "production";
const LOCAL_ROOT = path.join(process.cwd(), ".local-storage");

export type StoredObject = { pathname: string; url: string };

/** Builds a safe, unique object path such as `submissions/abc/pages/p1-9f2c.jpg`. */
export function buildPath(...segments: string[]): string {
  const clean = segments.map((s) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "x");
  const last = clean.pop() as string;
  const dot = last.lastIndexOf(".");
  const base = dot > 0 ? last.slice(0, dot) : last;
  const ext = dot > 0 ? last.slice(dot) : "";
  return [...clean, `${base}-${randomBytes(6).toString("hex")}${ext}`].join("/");
}

function localPath(pathname: string): string {
  const full = path.resolve(LOCAL_ROOT, pathname);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid storage path.");
  return full;
}

export async function storagePut(pathname: string, body: Buffer, contentType: string): Promise<StoredObject> {
  if (localMode) {
    const full = localPath(pathname);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return { pathname, url: `local:${pathname}` };
  }
  const blob = await put(pathname, body, { access: "private", contentType });
  return { pathname: blob.pathname, url: blob.url };
}

export type StoredStream = { stream: ReadableStream<Uint8Array>; contentType?: string };

export async function storageGet(pathname: string): Promise<StoredStream | null> {
  if (localMode) {
    try {
      const data = await fs.readFile(localPath(pathname));
      return {
        stream: new Response(new Uint8Array(data)).body as ReadableStream<Uint8Array>,
      };
    } catch {
      return null;
    }
  }
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return { stream: result.stream as ReadableStream<Uint8Array>, contentType: result.blob.contentType };
}

export async function storageGetBuffer(pathname: string): Promise<Buffer | null> {
  const found = await storageGet(pathname);
  if (!found) return null;
  return Buffer.from(await new Response(found.stream).arrayBuffer());
}

/** Best-effort delete; a missing object is not an error. */
export async function storageDelete(objects: StoredObject[]): Promise<void> {
  if (objects.length === 0) return;
  if (localMode) {
    await Promise.all(objects.map((o) => fs.rm(localPath(o.pathname), { force: true }).catch(() => undefined)));
    return;
  }
  try {
    await del(objects.map((o) => o.url));
  } catch (err) {
    console.error("[storage] delete failed", err);
  }
}
