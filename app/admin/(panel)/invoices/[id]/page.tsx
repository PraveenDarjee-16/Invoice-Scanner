import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      pdfFile: true,
      submission: { select: { id: true, code: true, invoiceCount: true, client: { select: { username: true } } } },
      pages: { orderBy: { position: "asc" }, include: { file: { select: { id: true, size: true } } } },
    },
  });
  if (!inv) notFound();
  const onlyOne = inv.submission.invoiceCount <= 1;

  return (
    <div className="space-y-5">
      <Link href={`/admin/submissions/${inv.submission.id}`} className="inline-flex items-center gap-1 text-sm font-medium">
        <Icon name="arrowLeft" className="size-4" />
        Back to {inv.submission.code}
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{inv.name}</h1>
            <p className="text-sm text-muted">
              {inv.fileName} · {inv.pageCount} pages · from {inv.submission.client.username}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inv.pdfFile && (
              <>
                <a className="btn btn-ghost" href={`/api/files/${inv.pdfFile.id}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="eye" />
                  Open PDF
                </a>
                <a className="btn btn-primary" href={`/api/files/${inv.pdfFile.id}?download=1`}>
                  <Icon name="download" />
                  Download PDF ({formatBytes(inv.pdfFile.size)})
                </a>
              </>
            )}
            <DeleteButton
              url={`/api/admin/invoices/${inv.id}`}
              label="Delete invoice"
              confirmTitle={`Delete ${inv.name}?`}
              confirmMessage={onlyOne ? "This is the only invoice, so the whole submission will be deleted." : "Its pages and PDF are removed and the submission ZIP is rebuilt without it."}
              successMessage="Invoice deleted."
              redirectTo={onlyOne ? "/admin/submissions" : `/admin/submissions/${inv.submission.id}`}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Pages</h2>
        {inv.pages.length === 0 ? (
          <p className="empty mt-3">No page images are stored for this invoice.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inv.pages.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-line">
                <a href={`/api/files/${p.file.id}`} target="_blank" rel="noopener noreferrer" className="block bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.file.id}`} alt={`Page ${p.position}`} loading="lazy" className="aspect-[3/4] w-full object-contain" />
                </a>
                <div className="flex items-center justify-between px-2.5 py-2 text-xs">
                  <span className="font-semibold text-ink">Page {p.position}</span>
                  <a href={`/api/files/${p.file.id}?download=1`} className="font-semibold">
                    Download · {formatBytes(p.file.size)}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
