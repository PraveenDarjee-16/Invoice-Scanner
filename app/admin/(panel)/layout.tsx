import { AdminNav } from "@/components/admin/AdminNav";
import { Brand } from "@/components/Brand";
import { SignOutButton } from "@/components/SignOutButton";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-ink px-4 py-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Brand href="/admin" tag="Admin" />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-white/80 sm:inline">{admin.username}</span>
            <SignOutButton kind="admin" />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-8">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-20">
            <AdminNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
