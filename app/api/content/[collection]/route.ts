import { NextResponse } from "next/server";
import { requireCollection } from "@/lib/cms";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";

/** Public JSON feed of published content, e.g. GET /api/content/projects */
export const GET = handle<{ collection: string }>(async (_req, { params }) => {
  const def = requireCollection((await params).collection);
  const items = await db.contentItem.findMany({
    where: { collection: def.key, published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(
    {
      ok: true,
      collection: def.key,
      items: items.map((i) => ({ id: i.id, slug: i.slug, title: i.title, updatedAt: i.updatedAt, ...(i.data as object) })),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
});
