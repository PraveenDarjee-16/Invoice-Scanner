import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getAdmin, getClient } from "@/lib/session";
import { storageGet } from "@/lib/storage";

/**
 * Authenticated download of any stored page, PDF or ZIP.
 * Admins may open everything; a client may only open files from their own submissions.
 * Add ?download=1 to force a "save as" instead of showing the file in the browser.
 */
export const GET = handle<{ id: string }>(async (req: NextRequest, { params }) => {
  const { id } = await params;

  const file = await db.storedFile.findUnique({
    where: { id },
    include: {
      pageEntry: { select: { invoice: { select: { submission: { select: { clientId: true } } } } } },
      pdfForInvoice: { select: { submission: { select: { clientId: true } } } },
      zipForSubmission: { select: { clientId: true } },
    },
  });
  if (!file || file.kind === "MEDIA") throw new HttpError(404, "File not found.");

  const ownerId =
    file.pageEntry?.invoice.submission.clientId ??
    file.pdfForInvoice?.submission.clientId ??
    file.zipForSubmission?.clientId ??
    null;

  const admin = await getAdmin();
  if (!admin) {
    const client = await getClient();
    if (!client) throw new HttpError(401, "Please sign in to download this file.");
    if (!ownerId || ownerId !== client.id) throw new HttpError(404, "File not found.");
  }

  const found = await storageGet(file.pathname);
  if (!found) throw new HttpError(404, "The file is missing from storage.");

  const asAttachment = req.nextUrl.searchParams.get("download") === "1" || file.kind === "ZIP";
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(found.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
