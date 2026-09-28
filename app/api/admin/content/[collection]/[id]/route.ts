import { Prisma } from "@prisma/client";
import { requireCollection, validateContent } from "@/lib/cms";
import { db } from "@/lib/db";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";

export const PUT = handle<{ collection: string; id: string }>(async (req, { params }) => {
  await requireAdminApi();
  const { collection, id } = await params;
  const def = requireCollection(collection);
  const input = validateContent(def, await readJson(req));
  try {
    const result = await db.contentItem.updateMany({
      where: { id, collection: def.key },
      data: { title: input.title, slug: input.slug, published: input.published, sortOrder: input.sortOrder, data: input.data },
    });
    if (result.count === 0) throw new HttpError(404, "Entry not found.");
    return ok();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Another entry already uses this URL name.", { slug: "This URL name is already taken." });
    }
    throw err;
  }
});

export const DELETE = handle<{ collection: string; id: string }>(async (_req, { params }) => {
  await requireAdminApi();
  const { collection, id } = await params;
  const def = requireCollection(collection);
  const result = await db.contentItem.deleteMany({ where: { id, collection: def.key } });
  if (result.count === 0) throw new HttpError(404, "Entry not found.");
  return ok();
});
