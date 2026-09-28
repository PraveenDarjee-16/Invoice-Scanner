import { db } from "@/lib/db";
import { clientIp, handle, HttpError, ok, readJson, str } from "@/lib/http";
import { requireClientApi } from "@/lib/session";
import { createSubmissionWithCode } from "@/lib/submissions";
import {
  MAX_INVOICES_PER_SUBMISSION,
  MAX_PAGES_PER_INVOICE,
  MAX_PAGES_PER_SUBMISSION,
  sanitizeFileName,
  toFileSlug,
} from "@/lib/validation";

/**
 * Step 1 of "Upload All": reserves the submission and its invoices.
 * Page images then arrive one by one at /api/submissions/[id]/pages.
 */
export const POST = handle(async (req) => {
  const client = await requireClientApi();
  const body = await readJson(req);
  const list = Array.isArray(body.invoices) ? body.invoices : [];

  if (list.length < 1) throw new HttpError(422, "Add at least one invoice before uploading.");
  if (list.length > MAX_INVOICES_PER_SUBMISSION) {
    throw new HttpError(422, `You can send up to ${MAX_INVOICES_PER_SUBMISSION} invoices in one upload.`);
  }

  const used = new Set<string>();
  let totalPages = 0;
  const planned = list.map((raw, index) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const pageCount = Number(item.pageCount);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new HttpError(422, `Invoice ${index + 1} has no pages.`);
    }
    if (pageCount > MAX_PAGES_PER_INVOICE) {
      throw new HttpError(422, `Invoice ${index + 1} has more than ${MAX_PAGES_PER_INVOICE} pages.`);
    }
    totalPages += pageCount;

    const fallback = `Invoice_${String(index + 1).padStart(3, "0")}`;
    const name = sanitizeFileName(str(item.name), fallback);
    const slug = toFileSlug(name, fallback);
    let candidate = slug;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${slug}_${n}`;
    used.add(candidate.toLowerCase());

    return { position: index + 1, name, fileName: `${candidate}.pdf`, pageCount };
  });

  if (totalPages > MAX_PAGES_PER_SUBMISSION) {
    throw new HttpError(422, `One upload can hold up to ${MAX_PAGES_PER_SUBMISSION} pages. Split it into two uploads.`);
  }

  const submission = await createSubmissionWithCode({
    clientId: client.id,
    invoiceCount: planned.length,
    pageCount: totalPages,
    ipAddress: clientIp(req),
  });

  const invoices = await db.$transaction(
    planned.map((p) => db.invoice.create({ data: { submissionId: submission.id, ...p } })),
  );

  return ok({
    submissionId: submission.id,
    code: submission.code,
    invoices: invoices.map((i) => ({ id: i.id, position: i.position, pageCount: i.pageCount, fileName: i.fileName })),
  });
});
