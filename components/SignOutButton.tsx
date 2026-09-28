"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Icon } from "./Icon";
import { useToast } from "./Providers";

export function SignOutButton({ kind, className = "" }: { kind: "client" | "admin"; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch(kind === "client" ? "/api/auth/logout" : "/api/admin/auth/logout", { method: "POST" });
      router.push(kind === "client" ? "/" : "/admin/login");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not sign out.", "error");
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className={`inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white disabled:opacity-60 ${className}`}>
      <Icon name="logout" className="size-4" />
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
