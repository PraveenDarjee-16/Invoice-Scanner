import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboard() {
  const [clients, submissions, invoices, statusGroups, recentSubmissions, recentClients] = await Promise.all([
    db.client.count(),
    db.submission.count(),
    db.invoice.count(),
    db.submission.groupBy({ by: ["status"], _count: { _all: true } }),
    db.submission.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { client: { select: { id: true, username: true, phone: true } } } }),
    db.client.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { _count: { select: { submissions: true } } } }),
  ]);
  const countFor = (s: "PROCESSING" | "COMPLETED" | "FAILED") => statusGroups.find((g) => g.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ["Clients", clients, "/admin/clients"],
          ["Submissions", submissions, "/admin/submissions"],
          ["Invoices", invoices, "/admin/submissions"],
        ].map(([label, value, href]) => (
          <Link key={label as string} href={href as string} className="card !p-4 no-underline hover:border-accent">
            <p className="text-3xl font-bold text-ink">{value}</p>
            <p className="text-sm text-muted">{label}</p>
          </Link>
        ))}
        <div className="card col-span-2 !p-4 lg:col-span-3">
          <p className="mb-2 text-sm text-muted">Processing status</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(["COMPLETED", "PROCESSING", "FAILED"] as const).map((s) => (
              <Link key={s} href={`/admin/submissions?status=${s}`} className="flex items-center gap-2 no-underline">
                <StatusPill status={s} />
                <span className="font-bold text-ink">{countFor(s)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title !mb-0">Recent submissions</h2>
          <Link href="/admin/submissions" className="text-sm font-semibold">
            View all
          </Link>
        </div>
        {recentSubmissions.length === 0 ? (
          <p className="empty">No submissions yet. Uploads from clients will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Invoices</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/submissions/${s.id}`}>
                        <span className="code">{s.code}</span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/admin/clients/${s.client.id}`}>{s.client.username}</Link>
                    </td>
                    <td className="whitespace-nowrap">
                      {formatDate(s.createdAt)}, {formatTime(s.createdAt)}
                    </td>
                    <td>{s.invoiceCount}</td>
                    <td>
                      <StatusPill status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title !mb-0">Recent clients</h2>
          <Link href="/admin/clients" className="text-sm font-semibold">
            View all
          </Link>
        </div>
        {recentClients.length === 0 ? (
          <p className="empty">No clients yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recentClients.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <Link href={`/admin/clients/${c.id}`} className="font-semibold">
                    {c.username}
                  </Link>
                  <p className="text-sm text-muted">
                    +91 {c.phone} · joined {formatDateTime(c.createdAt)}
                  </p>
                </div>
                <span className="pill pill-neutral">{c._count.submissions} submissions</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
