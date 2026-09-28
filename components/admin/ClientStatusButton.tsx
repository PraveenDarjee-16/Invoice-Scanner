"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api";
import { Spinner } from "../Icon";
import { useConfirm, useToast } from "../Providers";

export function ClientStatusButton({ clientId, disabled }: { clientId: string; disabled: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!disabled) {
      const yes = await confirm({
        title: "Disable this client?",
        message: "They will be signed out and cannot sign in again until you enable them. Their submissions are kept.",
        confirmLabel: "Disable client",
        danger: true,
      });
      if (!yes) return;
    }
    setBusy(true);
    try {
      await postJson(`/api/admin/clients/${clientId}`, { disabled: !disabled }, "PATCH");
      toast(disabled ? "Client enabled." : "Client disabled.", "ok");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the client.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={toggle} disabled={busy}>
      {busy && <Spinner className="size-4" />}
      {disabled ? "Enable client" : "Disable client"}
    </button>
  );
}
