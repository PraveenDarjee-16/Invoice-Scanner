import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, SubmissionStatus } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Pagination } from "@/components/Pagination";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatBytes, formatDateTime, istEndOfDay, istStartOfDay } from "@/lib/format";

export const metadata: Metadata = { title: "Submissions" };
const PER_PAGE = 20;
const STATUSES = ["COMPLETED", "PROCESSING", "FAILED"] as const;
const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; from?: string; to?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const from = isDay(sp.from) ? sp.from! : "";
  const to = isDay(sp.to) ? sp.to! : "";
  const status = STATUSES.includes(sp.status as SubmissionStatus) ? (sp.status as SubmissionStatus) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.SubmissionWhereInput = {
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: istStartOfDay(from) } : {}), ...(to ? { lte: istEndOfDay(to) } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { client: { username: { contains: q, mode: "insensitive" } } },
            { client: { phone: { contains: q } } },
            { invoices: { some: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.submission.count({ where }),
    db.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { client: { select: { id: true, username: true, phone: true } }, zipFile: { select: { id: true, size: true } } },
    }),
  ]);

  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (from) params.from = from;
  if (to) params.to = to;
  if (status) params.status = status;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>

      <form method="get" className="card grid gap-3 !p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} type="search" className="input" placeholder="Reference, client, phone or invoice name" />
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input">
            <option value="">All</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" type="submit">
            <Icon name="search" className="size-4" />
            Filter
          </button>
          {Object.keys(params).length > 0 && (
            <Link href="/admin/submissions" className="btn btn-ghost">Clear</Link>
          )}
        </div>
      </form>

      <div className="card !p-2 sm:!p-4">
        <p className="px-2 pb-2 text-sm text-muted">{total} {total === 1 ? "submission" : "submissions"}</p>
        {rows.length === 0 ? (
          <p className="empty">No submissions match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Client</th>
                  <th>Uploaded</th>
                  <th>Invoices</th>
                  <th>Pages</th>
                  <th>Status</th>
                  <th>ZIP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/admin/submissions/${s.id}`}><span className="code">{s.code}</span></Link></td>
                    <td>
                      <Link href={`/admin/clients/${s.client.id}`} className="font-semibold">{s.client.username}</Link>
                      <p className="text-xs text-muted">+91 {s.client.phone}</p>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                    <td>{s.invoiceCount}</td>
                    <td>{s.pageCount}</td>
                    <td><StatusPill status={s.status} /></td>
                    <td>
                      {s.zipFile ? (
                        <a className="btn btn-ghost btn-sm" href={`/api/files/${s.zipFile.id}`}>
                          <Icon name="download" className="size-4" />
                          {formatBytes(s.zipFile.size)}
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination basePath="/admin/submissions" page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} params={params} />
      </div>
    </div>
  );
}
