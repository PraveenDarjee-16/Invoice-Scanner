import { handle, ok } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";
import { deleteInvoice } from "@/lib/submissions";

export const maxDuration = 120;

export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  await requireAdminApi();
  const { id } = await params;
  const result = await deleteInvoice(id);
  return ok(result);
});
