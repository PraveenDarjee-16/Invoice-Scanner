import { db } from "@/lib/db";
import { handle, HttpError, ok } from "@/lib/http";
import { requireClientApi } from "@/lib/session";
import { buildSubmissionZip, markSubmissionFailed } from "@/lib/submissions";

export const maxDuration = 120;

/** Last step: packs every invoice PDF into the ZIP and marks the submission COMPLETED. */
export const POST = handle<{ id: string }>(async (_req, { params }) => {
  const client = await requireClientApi();
  const { id } = await params;

  const submission = await db.submission.findFirst({ where: { id, clientId: client.id } });
  if (!submission) throw new HttpError(404, "Submission not found.");
  if (submission.status === "COMPLETED") return ok({ code: submission.code });

  try {
    await buildSubmissionZip(id);
  } catch (err) {
    await markSubmissionFailed(id, err instanceof Error ? err.message : "ZIP generation failed.");
    if (err instanceof HttpError) throw err;
    throw new HttpError(500, "ZIP generation failed. Please try again.");
  }
  return ok({ code: submission.code });
});
