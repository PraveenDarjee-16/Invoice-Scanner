import { db } from "@/lib/db";
import { handle, HttpError, ok } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";
import { deleteSubmission } from "@/lib/submissions";

export const maxDuration = 120;

export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  await requireAdminApi();
  const { id } = await params;
  if (!(await db.submission.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Submission not found.");
  await deleteSubmission(id);
  return ok();
});
