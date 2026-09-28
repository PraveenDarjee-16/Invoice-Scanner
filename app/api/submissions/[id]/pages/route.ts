import { db } from "@/lib/db";
import { handle, HttpError, ok, str } from "@/lib/http";
import { requireClientApi } from "@/lib/session";
import { removeStoredFiles } from "@/lib/submissions";
import { buildPath, storagePut } from "@/lib/storage";
import { isJpeg, MAX_PAGE_BYTES } from "@/lib/validation";

export const maxDuration = 60;

/** Receives ONE scanned page (multipart). Re-sending the same position replaces the earlier upload. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const client = await requireClientApi();
  const { id } = await params;

  const submission = await db.submission.findFirst({ where: { id, clientId: client.id } });
  if (!submission) throw new HttpError(404, "Submission not found.");
  if (submission.status === "COMPLETED") throw new HttpError(409, "This submission is already complete.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "The page upload was incomplete. Please try again.");
  }

  const invoiceId = str(form.get("invoiceId"));
  const position = Number(form.get("position"));
  const width = Math.max(0, Math.min(20000, Math.round(Number(form.get("width")) || 0)));
  const height = Math.max(0, Math.min(20000, Math.round(Number(form.get("height")) || 0)));
  const file = form.get("file");

  if (!(file instanceof File)) throw new HttpError(422, "No page image was received.");
  if (file.size <= 0) throw new HttpError(422, "The page image is empty.");
  if (file.size > MAX_PAGE_BYTES) throw new HttpError(413, "This page image is too large. Retake it at a lower resolution.");

  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, submissionId: id } });
  if (!invoice) throw new HttpError(404, "Invoice not found in this submission.");
  if (!Number.isInteger(position) || position < 1 || position > invoice.pageCount) {
    throw new HttpError(422, "Invalid page number.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isJpeg(bytes)) throw new HttpError(422, "Only JPEG page images are accepted.");

  const stored = await storagePut(
    buildPath("submissions", id, "pages", `inv${invoice.position}-page${position}.jpg`),
    bytes,
    "image/jpeg",
  );
  const record = await db.storedFile.create({
    data: {
      kind: "PAGE",
      pathname: stored.pathname,
      url: stored.url,
      filename: `${invoice.fileName.replace(/\.pdf$/i, "")}_page_${position}.jpg`,
      contentType: "image/jpeg",
      size: bytes.length,
    },
  });

  const existing = await db.invoicePage.findUnique({ where: { invoiceId_position: { invoiceId, position } } });
  if (existing) {
    await db.invoicePage.update({ where: { id: existing.id }, data: { fileId: record.id, width, height } });
    await removeStoredFiles([existing.fileId]);
  } else {
    await db.invoicePage.create({ data: { invoiceId, position, fileId: record.id, width, height } });
  }

  return ok({ position });
});
