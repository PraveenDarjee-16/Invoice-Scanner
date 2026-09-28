import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Brand } from "@/components/Brand";
import { getAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="min-h-dvh">
      <header className="bg-ink px-4 py-3">
        <div className="mx-auto max-w-5xl">
          <Brand tag="Admin" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-12">
        <div className="card">
          <h1 className="card-title text-xl">Admin sign in</h1>
          <p className="mb-5 text-sm text-muted">Authorised staff only.</p>
          <AdminLoginForm />
        </div>
      </main>
    </div>
  );
}
