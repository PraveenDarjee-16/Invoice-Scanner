import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { Prisma, type Submission } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { istDateKey, istStartOfDay } from "./format";
import { buildPath, storageDelete, storageGetBuffer, storagePut } from "./storage";

/* ------------------------------------------------------------------ */
/* Submission codes: INV-20260928-001                                  */
/* ------------------------------------------------------------------ */
export async function createSubmissionWithCode(data: {
  clientId: string;
  invoiceCount: number;
  pageCount: number;
  ipAddress: string;
}): Promise<Submission> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const key = istDateKey(new Date());
    const todayCount = await db.submission.count({ where: { createdAt: { gte: istStartOfDay(key) } } });
    const code = `INV-${key.replaceAll("-", "")}-${String(todayCount + 1 + attempt).padStart(3, "0")}`;
    try {
      return await db.submission.create({ data: { code, ...data, status: "PROCESSING" } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new HttpError(500, "Could not reserve a reference number. Please try again.");
}

/** submission_2026_09_28_001.zip */
export function zipFileName(s: { code: string; createdAt: Date }): string {
  const day = istDateKey(s.createdAt).replaceAll("-", "_");
  const seq = s.code.split("-").pop() ?? "001";
  return `submission_${day}_${seq}.zip`;
}

/* ------------------------------------------------------------------ */
/* Stored file cleanup                                                 */
/* ------------------------------------------------------------------ */
export async function removeStoredFiles(ids: string[]) {
  if (ids.length === 0) return;
  const files = await db.storedFile.findMany({ where: { id: { in: ids } } });
  if (files.length === 0) return;
  await db.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  await storageDelete(files.map((f) => ({ pathname: f.pathname, url: f.url })));
}

/* ------------------------------------------------------------------ */
/* PDF: one per invoice, built from its page images                    */
/* ------------------------------------------------------------------ */
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 12;

export async function buildInvoicePdf(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { pages: { orderBy: { position: "asc" }, include: { file: true } }, pdfFile: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  if (invoice.pages.length !== invoice.pageCount) {
    throw new HttpError(
      409,
      `Invoice "${invoice.name}" expected ${invoice.pageCount} pages but ${invoice.pages.length} arrived. Please retry the upload.`,
    );
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(invoice.name);
  pdf.setProducer("Invoice Scanner");
  pdf.setCreator("Invoice Scanner");

  for (const page of invoice.pages) {
    const bytes = await storageGetBuffer(page.file.pathname);
    if (!bytes) throw new HttpError(500, `Page ${page.position} of "${invoice.name}" is missing from storage.`);
    const image = await pdf.embedJpg(bytes);
    const sheet = pdf.addPage([A4_W, A4_H]);
    const scale = Math.min((A4_W - MARGIN * 2) / image.width, (A4_H - MARGIN * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    sheet.drawImage(image, { x: (A4_W - width) / 2, y: (A4_H - height) / 2, width, height });
  }

  const out = Buffer.from(await pdf.save());
  const stored = await storagePut(buildPath("submissions", invoice.submissionId, "pdf", invoice.fileName), out, "application/pdf");
  const file = await db.storedFile.create({
    data: {
      kind: "PDF",
      pathname: stored.pathname,
      url: stored.url,
      filename: invoice.fileName,
      contentType: "application/pdf",
      size: out.length,
    },
  });
  await db.invoice.update({ where: { id: invoice.id }, data: { pdfFileId: file.id } });
  if (invoice.pdfFile) await removeStoredFiles([invoice.pdfFile.id]);
  return { size: out.length, pages: invoice.pages.length };
}

/* ------------------------------------------------------------------ */
/* ZIP: every invoice PDF in one archive                               */
/* ------------------------------------------------------------------ */
export async function buildSubmissionZip(submissionId: string) {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { invoices: { orderBy: { position: "asc" }, include: { pdfFile: true } }, zipFile: true },
  });
  if (!submission) throw new HttpError(404, "Submission not found.");
  if (submission.invoices.length === 0) throw new HttpError(422, "This submission has no invoices.");

  const zip = new JSZip();
  let pageTotal = 0;
  for (const invoice of submission.invoices) {
    if (!invoice.pdfFile) throw new HttpError(409, `Invoice "${invoice.name}" has no PDF yet.`);
    const bytes = await storageGetBuffer(invoice.pdfFile.pathname);
    if (!bytes) throw new HttpError(500, `The PDF for "${invoice.name}" is missing from storage.`);
    zip.file(invoice.fileName, bytes, { compression: "STORE" });
    pageTotal += invoice.pageCount;
  }

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const name = zipFileName(submission);
  const stored = await storagePut(buildPath("submissions", submission.id, "zip", name), archive, "application/zip");
  const file = await db.storedFile.create({
    data: {
      kind: "ZIP",
      pathname: stored.pathname,
      url: stored.url,
      filename: name,
      contentType: "application/zip",
      size: archive.length,
    },
  });
  await db.submission.update({
    where: { id: submission.id },
    data: {
      zipFileId: file.id,
      status: "COMPLETED",
      errorMessage: null,
      invoiceCount: submission.invoices.length,
      pageCount: pageTotal,
    },
  });
  if (submission.zipFile) await removeStoredFiles([submission.zipFile.id]);
  return { size: archive.length };
}

export async function markSubmissionFailed(submissionId: string, message: string) {
  try {
    await db.submission.update({
      where: { id: submissionId },
      data: { status: "FAILED", errorMessage: message.slice(0, 300) },
    });
  } catch (err) {
    console.error("[submissions] could not mark failed", err);
  }
}

/* ------------------------------------------------------------------ */
/* Deleting data (database rows + stored objects)                      */
/* ------------------------------------------------------------------ */
async function fileIdsForSubmission(submissionId: string): Promise<string[]> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      zipFileId: true,
      invoices: { select: { pdfFileId: true, pages: { select: { fileId: true } } } },
    },
  });
  if (!submission) return [];
  const ids: string[] = [];
  if (submission.zipFileId) ids.push(submission.zipFileId);
  for (const inv of submission.invoices) {
    if (inv.pdfFileId) ids.push(inv.pdfFileId);
    for (const p of inv.pages) ids.push(p.fileId);
  }
  return ids;
}

export async function deleteSubmission(submissionId: string) {
  const ids = await fileIdsForSubmission(submissionId);
  await db.submission.delete({ where: { id: submissionId } });
  await removeStoredFiles(ids);
}

export async function deleteClient(clientId: string) {
  const subs = await db.submission.findMany({ where: { clientId }, select: { id: true } });
  for (const s of subs) await deleteSubmission(s.id);
  await db.client.delete({ where: { id: clientId } });
}

/** Removes one invoice. Rebuilds the ZIP so it never contains a deleted invoice. */
export async function deleteInvoice(invoiceId: string): Promise<{ submissionDeleted: boolean; submissionId: string }> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { submissionId: true, pdfFileId: true, pages: { select: { fileId: true } }, submission: { select: { status: true } } },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found.");

  const ids = invoice.pages.map((p) => p.fileId);
  if (invoice.pdfFileId) ids.push(invoice.pdfFileId);
  await db.invoice.delete({ where: { id: invoiceId } });
  await removeStoredFiles(ids);

  const remaining = await db.invoice.findMany({ where: { submissionId: invoice.submissionId }, select: { pageCount: true } });
  if (remaining.length === 0) {
    await deleteSubmission(invoice.submissionId);
    return { submissionDeleted: true, submissionId: invoice.submissionId };
  }
  await db.submission.update({
    where: { id: invoice.submissionId },
    data: { invoiceCount: remaining.length, pageCount: remaining.reduce((n, i) => n + i.pageCount, 0) },
  });
  if (invoice.submission.status === "COMPLETED") await buildSubmissionZip(invoice.submissionId);
  return { submissionDeleted: false, submissionId: invoice.submissionId };
}
