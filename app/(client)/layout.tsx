import { Brand } from "@/components/Brand";
import { SignOutButton } from "@/components/SignOutButton";
import { requireClient } from "@/lib/session";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const client = await requireClient();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-ink px-4 py-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Brand href="/dashboard" />
          <div className="flex items-center gap-4">
            <span className="max-w-[9rem] truncate text-sm text-white/80 sm:max-w-xs" title={client.username}>
              {client.username}
            </span>
            <SignOutButton kind="client" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
