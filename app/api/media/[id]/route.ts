import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { storageGet } from "@/lib/storage";

/** Public delivery of CMS images (kind MEDIA only). Invoice files are never served here. */
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const file = await db.storedFile.findFirst({ where: { id, kind: "MEDIA" } });
  if (!file) throw new HttpError(404, "Image not found.");
  const found = await storageGet(file.pathname);
  if (!found) throw new HttpError(404, "Image not found.");
  return new Response(found.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
