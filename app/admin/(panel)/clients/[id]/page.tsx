import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientStatusButton } from "@/components/admin/ClientStatusButton";
import { DeleteButton } from "@/components/DeleteButton";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatBytes, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Client" };

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { submissions: { orderBy: { createdAt: "desc" }, include: { zipFile: { select: { id: true, size: true } } } } },
  });
  if (!client) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm font-medium">
        <Icon name="arrowLeft" className="size-4" />
        All clients
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{client.username}</h1>
            {client.disabled && <span className="pill pill-failed mt-1">Disabled</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <ClientStatusButton clientId={client.id} disabled={client.disabled} />
            <DeleteButton
              url={`/api/admin/clients/${client.id}`}
              label="Delete client"
              confirmTitle={`Delete ${client.username}?`}
              confirmMessage="This permanently deletes the client and every submission, invoice, page and file they uploaded."
              successMessage="Client deleted."
              redirectTo="/admin/clients"
            />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Phone</dt><dd className="font-semibold text-ink">+91 {client.phone}</dd></div>
          <div><dt className="text-muted">Email</dt><dd className="font-semibold text-ink">{client.email ?? "Not given"}</dd></div>
          <div><dt className="text-muted">First seen</dt><dd className="font-semibold text-ink">{formatDateTime(client.firstSeenAt)}</dd></div>
          <div><dt className="text-muted">Last seen</dt><dd className="font-semibold text-ink">{formatDateTime(client.lastSeenAt)}</dd></div>
        </dl>
      </section>

      <section className="card !p-2 sm:!p-5">
        <h2 className="card-title px-2 pt-2 sm:p-0">Submission history</h2>
        {client.submissions.length === 0 ? (
          <p className="empty mt-3">This client has not sent anything yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Invoices</th>
                  <th>Pages</th>
                  <th>Status</th>
                  <th>ZIP</th>
                </tr>
              </thead>
              <tbody>
                {client.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/submissions/${s.id}`}>
                        <span className="code">{s.code}</span>
                      </Link>
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
      </section>
    </div>
  );
}
