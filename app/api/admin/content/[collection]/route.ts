import { Prisma } from "@prisma/client";
import { requireCollection, validateContent } from "@/lib/cms";
import { db } from "@/lib/db";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";

export const POST = handle<{ collection: string }>(async (req, { params }) => {
  await requireAdminApi();
  const def = requireCollection((await params).collection);
  const input = validateContent(def, await readJson(req));
  try {
    const item = await db.contentItem.create({
      data: { collection: def.key, title: input.title, slug: input.slug, published: input.published, sortOrder: input.sortOrder, data: input.data },
    });
    return ok({ id: item.id }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Another entry already uses this URL name.", { slug: "This URL name is already taken." });
    }
    throw err;
  }
});
