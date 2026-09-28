import { redirect } from "next/navigation";
import { Announcements } from "@/components/Announcements";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { getClient } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await getClient()) redirect("/dashboard");
  const { expired } = await searchParams;

  return (
    <div className="min-h-dvh">
      <header className="bg-ink px-4 py-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
        <div className="mx-auto max-w-5xl">
          <Brand />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-2 md:items-center md:py-16">
        <section className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Send your invoices as one clean file</h1>
          <p className="max-w-prose text-base leading-relaxed">
            Photograph each invoice page. The scanner straightens and cleans it, builds one PDF per invoice, and packs everything into a single ZIP for the office. Works in your phone browser, nothing to install.
          </p>
          <Announcements />
        </section>

        <section className="card">
          <h2 className="card-title">Sign in</h2>
          <p className="mb-4 text-sm text-muted">New here? Just enter your details, there is no separate registration.</p>
          {expired && (
            <div className="alert alert-warning mb-4" role="status">
              Your session timed out. Sign in to continue.
            </div>
          )}
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
