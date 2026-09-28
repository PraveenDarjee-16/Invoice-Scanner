"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api";
import { Spinner } from "../Icon";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) return setError("Enter your username and password.");
    setBusy(true);
    try {
      const res = await postJson<{ redirect: string }>("/api/admin/auth/login", { username: username.trim(), password });
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="admin-username">
          Admin username
        </label>
        <input id="admin-username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="admin-password">
          Password
        </label>
        <input id="admin-password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy && <Spinner />}
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
