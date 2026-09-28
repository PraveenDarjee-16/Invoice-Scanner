import { db } from "@/lib/db";
import { handle, HttpError, ok } from "@/lib/http";
import { requireClientApi } from "@/lib/session";
import { buildInvoicePdf } from "@/lib/submissions";

export const maxDuration = 120;

/** Builds the PDF of one invoice from its uploaded pages. */
export const POST = handle<{ id: string; invoiceId: string }>(async (_req, { params }) => {
  const client = await requireClientApi();
  const { id, invoiceId } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, submissionId: id, submission: { clientId: client.id } },
    select: { id: true, submission: { select: { status: true } } },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  if (invoice.submission.status === "COMPLETED") throw new HttpError(409, "This submission is already complete.");

  const result = await buildInvoicePdf(invoice.id);
  return ok(result);
});
