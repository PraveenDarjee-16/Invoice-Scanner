import type { Metadata } from "next";
import Link from "next/link";
import { COLLECTIONS } from "@/lib/cms";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Website content" };

export default async function ContentIndexPage() {
  const counts = await db.contentItem.groupBy({ by: ["collection"], _count: { _all: true } });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Website content</h1>
        <p className="text-sm text-muted">Add, edit and delete website content here. No code changes needed.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {COLLECTIONS.map((c) => (
          <Link key={c.key} href={`/admin/content/${c.key}`} className="card no-underline hover:border-accent">
            <h2 className="card-title">{c.label}</h2>
            <p className="text-sm">{c.description}</p>
            <p className="mt-3 text-sm font-semibold text-ink">{counts.find((x) => x.collection === c.key)?._count._all ?? 0} entries</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
