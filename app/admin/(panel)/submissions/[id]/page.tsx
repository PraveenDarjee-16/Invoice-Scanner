import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatBytes, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Submission" };

export default async function AdminSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db.submission.findUnique({
    where: { id },
    include: {
      client: true,
      zipFile: true,
      invoices: { orderBy: { position: "asc" }, include: { pdfFile: true } },
    },
  });
  if (!s) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/submissions" className="inline-flex items-center gap-1 text-sm font-medium">
        <Icon name="arrowLeft" className="size-4" />
        All submissions
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold"><span className="code text-base">{s.code}</span></h1>
            <StatusPill status={s.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            {s.zipFile && (
              <a href={`/api/files/${s.zipFile.id}`} className="btn btn-primary">
                <Icon name="download" />
                Download ZIP ({formatBytes(s.zipFile.size)})
              </a>
            )}
            <DeleteButton
              url={`/api/admin/submissions/${s.id}`}
              label="Delete submission"
              confirmTitle="Delete this submission?"
              confirmMessage="The invoices, pages, PDFs and ZIP are permanently removed from the database and storage."
              successMessage="Submission deleted."
              redirectTo="/admin/submissions"
            />
          </div>
        </div>
        {s.errorMessage && <p className="alert alert-error mt-3">{s.errorMessage}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-4">
          <div>
            <dt className="text-muted">Client</dt>
            <dd><Link className="font-semibold" href={`/admin/clients/${s.client.id}`}>{s.client.username}</Link></dd>
          </div>
          <div><dt className="text-muted">Phone</dt><dd className="font-semibold text-ink">+91 {s.client.phone}</dd></div>
          <div><dt className="text-muted">Uploaded</dt><dd className="font-semibold text-ink">{formatDateTime(s.createdAt)}</dd></div>
          <div><dt className="text-muted">IP address</dt><dd className="font-semibold text-ink">{s.ipAddress ?? "-"}</dd></div>
          <div><dt className="text-muted">Invoices</dt><dd className="font-semibold text-ink">{s.invoiceCount}</dd></div>
          <div><dt className="text-muted">Pages</dt><dd className="font-semibold text-ink">{s.pageCount}</dd></div>
        </dl>
      </section>

      <section className="card !p-2 sm:!p-5">
        <h2 className="card-title px-2 pt-2 sm:p-0">Invoices</h2>
        {s.invoices.length === 0 ? (
          <p className="empty mt-3">No invoices in this submission.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Name</th><th>File</th><th>Pages</th><th>Size</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {s.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.position}</td>
                    <td><Link href={`/admin/invoices/${inv.id}`} className="font-semibold">{inv.name}</Link></td>
                    <td><span className="code">{inv.fileName}</span></td>
                    <td>{inv.pageCount}</td>
                    <td>{inv.pdfFile ? formatBytes(inv.pdfFile.size) : "-"}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/invoices/${inv.id}`} className="btn btn-ghost btn-sm">
                          <Icon name="eye" className="size-4" />
                          Pages
                        </Link>
                        {inv.pdfFile && (
                          <a href={`/api/files/${inv.pdfFile.id}?download=1`} className="btn btn-ghost btn-sm">
                            <Icon name="download" className="size-4" />
                            PDF
                          </a>
                        )}
                      </div>
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
