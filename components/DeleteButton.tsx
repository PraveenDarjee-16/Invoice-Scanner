"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Icon, Spinner } from "./Icon";
import { useConfirm, useToast } from "./Providers";

type Props = {
  url: string;
  label?: string;
  confirmTitle: string;
  confirmMessage?: string;
  successMessage?: string;
  /** Where to go after deleting. If omitted, the current page is refreshed. */
  redirectTo?: string;
  small?: boolean;
  iconOnly?: boolean;
};

export function DeleteButton({ url, label = "Delete", confirmTitle, confirmMessage, successMessage = "Deleted.", redirectTo, small, iconOnly }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    const yes = await confirm({ title: confirmTitle, message: confirmMessage, confirmLabel: "Delete", danger: true });
    if (!yes) return;
    setBusy(true);
    try {
      await apiFetch(url, { method: "DELETE" });
      toast(successMessage, "ok");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} aria-label={label} title={label} className={`btn btn-danger-ghost ${small ? "btn-sm" : ""}`}>
      {busy ? <Spinner className="size-4" /> : <Icon name="trash" className="size-4" />}
      {!iconOnly && label}
    </button>
  );
}
