import { db } from "@/lib/db";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";
import { deleteClient } from "@/lib/submissions";

export const maxDuration = 120;

/** Enable or disable a client. */
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  await requireAdminApi();
  const { id } = await params;
  const body = await readJson(req);
  if (typeof body.disabled !== "boolean") throw new HttpError(422, "Missing 'disabled' value.");
  const result = await db.client.updateMany({ where: { id }, data: { disabled: body.disabled } });
  if (result.count === 0) throw new HttpError(404, "Client not found.");
  return ok();
});

/** Deletes the client together with every submission, invoice, page and stored file. */
export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  await requireAdminApi();
  const { id } = await params;
  if (!(await db.client.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Client not found.");
  await deleteClient(id);
  return ok();
});
