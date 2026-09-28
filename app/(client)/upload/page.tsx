import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { UploadWorkspace } from "@/components/UploadWorkspace";
import { requireClient } from "@/lib/session";

export const metadata: Metadata = { title: "New submission" };

export default async function UploadPage() {
  await requireClient();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New submission</h1>
          <p className="text-sm text-muted">Scan the pages of each invoice, name it, then press Upload All.</p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          <Icon name="arrowLeft" className="size-4" />
          Dashboard
        </Link>
      </div>
      <UploadWorkspace />
    </div>
  );
}
