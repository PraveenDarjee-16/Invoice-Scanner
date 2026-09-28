import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Pagination } from "@/components/Pagination";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };
const PER_PAGE = 20;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.ClientWhereInput = q
    ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] }
    : {};
  const [total, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: { _count: { select: { submissions: true } } } }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Clients</h1>

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} className="input" type="search" placeholder="Search by name, phone number or email" aria-label="Search clients" />
        <button className="btn btn-primary" type="submit">
          <Icon name="search" className="size-4" />
          Search
        </button>
        {q && (
          <Link href="/admin/clients" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="card !p-2 sm:!p-4">
        {clients.length === 0 ? (
          <p className="empty">{q ? "No clients match your search." : "No clients have signed in yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Submissions</th>
                  <th>Last seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/clients/${c.id}`} className="font-semibold">
                        {c.username}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">+91 {c.phone}</td>
                    <td>{c.email ?? <span className="text-muted">-</span>}</td>
                    <td>{c._count.submissions}</td>
                    <td className="whitespace-nowrap">{formatDateTime(c.lastSeenAt)}</td>
                    <td>{c.disabled ? <span className="pill pill-failed">Disabled</span> : <span className="pill pill-completed">Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination basePath="/admin/clients" page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} params={q ? { q } : {}} />
      </div>
    </div>
  );
}
