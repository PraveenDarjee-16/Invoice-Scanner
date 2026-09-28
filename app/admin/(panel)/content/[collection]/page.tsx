import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";
import { Icon } from "@/components/Icon";
import { getCollection } from "@/lib/cms";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Website content" };

export default async function CollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const def = getCollection((await params).collection);
  if (!def) notFound();
  const items = await db.contentItem.findMany({ where: { collection: def.key }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });

  return (
    <div className="space-y-5">
      <Link href="/admin/content" className="inline-flex items-center gap-1 text-sm font-medium">
        <Icon name="arrowLeft" className="size-4" />
        All content
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{def.label}</h1>
          <p className="text-sm text-muted">{def.description}</p>
        </div>
        <Link href={`/admin/content/${def.key}/new`} className="btn btn-primary">
          <Icon name="plus" />
          Add {def.singular.toLowerCase()}
        </Link>
      </div>

      <div className="card !p-2 sm:!p-4">
        {items.length === 0 ? (
          <p className="empty">Nothing here yet. Add the first {def.singular.toLowerCase()}.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{item.title}</p>
                  <p className="text-xs text-muted">
                    /{item.slug} · order {item.sortOrder} · updated {formatDate(item.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`pill ${item.published ? "pill-completed" : "pill-neutral"}`}>{item.published ? "Published" : "Draft"}</span>
                  <Link href={`/admin/content/${def.key}/${item.id}`} className="btn btn-ghost btn-sm">
                    <Icon name="edit" className="size-4" />
                    Edit
                  </Link>
                  <DeleteButton small url={`/api/admin/content/${def.key}/${item.id}`} confirmTitle={`Delete "${item.title}"?`} confirmMessage="This cannot be undone." successMessage="Entry deleted." />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted">
        Public JSON feed of published entries: <span className="code">/api/content/{def.key}</span>
      </p>
    </div>
  );
}
