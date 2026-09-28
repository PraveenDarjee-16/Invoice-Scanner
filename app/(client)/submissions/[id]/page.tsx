import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatBytes, formatDate, formatTime } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata: Metadata = { title: "Submission" };

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const client = await requireClient();
  const { id } = await params;
  const { done } = await searchParams;

  const submission = await db.submission.findFirst({
    where: { id, clientId: client.id },
    include: { zipFile: true, invoices: { orderBy: { position: "asc" }, include: { pdfFile: true } } },
  });
  if (!submission) notFound();

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium">
        <Icon name="arrowLeft" className="size-4" />
        Back to dashboard
      </Link>

      {done && submission.status === "COMPLETED" && (
        <div className="alert alert-ok flex items-start gap-2" role="status">
          <Icon name="check" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Upload complete</p>
            <p>Your invoices have reached the office. Keep the reference below if you need to ask about this batch.</p>
          </div>
        </div>
      )}
      {submission.status === "FAILED" && (
        <div className="alert alert-error" role="alert">
          This submission could not be completed{submission.errorMessage ? `: ${submission.errorMessage}` : "."} Please start a new submission.
        </div>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">
            <span className="code text-base">{submission.code}</span>
          </h1>
          <StatusPill status={submission.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">Date</dt><dd className="font-semibold text-ink">{formatDate(submission.createdAt)}</dd></div>
          <div><dt className="text-muted">Time</dt><dd className="font-semibold text-ink">{formatTime(submission.createdAt)}</dd></div>
          <div><dt className="text-muted">Invoices</dt><dd className="font-semibold text-ink">{submission.invoiceCount}</dd></div>
          <div><dt className="text-muted">Pages</dt><dd className="font-semibold text-ink">{submission.pageCount}</dd></div>
        </dl>
        {submission.zipFile && submission.status === "COMPLETED" && (
          <a href={`/api/files/${submission.zipFile.id}`} className="btn btn-primary mt-5">
            <Icon name="download" />
            Download ZIP ({formatBytes(submission.zipFile.size)})
          </a>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Invoices</h2>
        <ul className="mt-2 divide-y divide-line">
          {submission.invoices.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{inv.name}</p>
                <p className="text-sm text-muted">
                  {inv.fileName} · {inv.pageCount} {inv.pageCount === 1 ? "page" : "pages"}
                  {inv.pdfFile ? ` · ${formatBytes(inv.pdfFile.size)}` : ""}
                </p>
              </div>
              {inv.pdfFile && (
                <div className="flex gap-2">
                  <a className="btn btn-ghost btn-sm" href={`/api/files/${inv.pdfFile.id}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="eye" className="size-4" />
                    Open
                  </a>
                  <a className="btn btn-ghost btn-sm" href={`/api/files/${inv.pdfFile.id}?download=1`}>
                    <Icon name="download" className="size-4" />
                    PDF
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
