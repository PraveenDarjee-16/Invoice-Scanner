import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentForm } from "@/components/admin/ContentForm";
import { getCollection } from "@/lib/cms";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit content" };

export default async function EditContentPage({ params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  const def = getCollection(collection);
  if (!def) notFound();
  const item = await db.contentItem.findFirst({ where: { id, collection: def.key } });
  if (!item) notFound();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Edit {def.singular.toLowerCase()}</h1>
      <ContentForm
        def={def}
        initial={{ id: item.id, title: item.title, slug: item.slug, published: item.published, sortOrder: item.sortOrder, data: (item.data ?? {}) as Record<string, unknown> }}
      />
    </div>
  );
}
