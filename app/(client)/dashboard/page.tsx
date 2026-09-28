import type { Metadata } from "next";
import Link from "next/link";
import { Announcements } from "@/components/Announcements";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatBytes, formatDate, formatTime } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const client = await requireClient();
  const submissions = await db.submission.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { zipFile: { select: { id: true, size: true } } },
  });

  const completed = submissions.filter((s) => s.status === "COMPLETED");
  const invoiceTotal = completed.reduce((n, s) => n + s.invoiceCount, 0);
  const pageTotal = completed.reduce((n, s) => n + s.pageCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Signed in as +91 {client.phone}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome, {client.username}</h1>
        </div>
        <Link href="/upload" className="btn btn-primary btn-lg w-full sm:w-auto">
          <Icon name="plus" />
          New submission
        </Link>
      </div>

      <Announcements />

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Submissions", completed.length],
          ["Invoices", invoiceTotal],
          ["Pages", pageTotal],
        ].map(([label, value]) => (
          <div key={label} className="card !p-4">
            <p className="text-2xl font-bold text-ink">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="card-title">Your submissions</h2>
        {submissions.length === 0 ? (
          <div className="empty mt-3">
            <p className="font-semibold text-ink">Nothing sent yet</p>
            <p className="mt-1 text-sm">Your first submission will appear here with its date, invoice count and reference number.</p>
            <Link href="/upload" className="btn btn-primary mt-4">
              <Icon name="camera" />
              Start scanning
            </Link>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <Link href={`/submissions/${s.id}`} className="font-semibold text-ink no-underline hover:underline">
                    <span className="code">{s.code}</span>
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(s.createdAt)} at {formatTime(s.createdAt)} · {s.invoiceCount} {s.invoiceCount === 1 ? "invoice" : "invoices"} · {s.pageCount} {s.pageCount === 1 ? "page" : "pages"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={s.status} />
                  {s.zipFile && s.status === "COMPLETED" && (
                    <a className="btn btn-ghost btn-sm" href={`/api/files/${s.zipFile.id}`}>
                      <Icon name="download" className="size-4" />
                      ZIP ({formatBytes(s.zipFile.size)})
                    </a>
                  )}
                  <Link className="btn btn-ghost btn-sm" href={`/submissions/${s.id}`}>
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
