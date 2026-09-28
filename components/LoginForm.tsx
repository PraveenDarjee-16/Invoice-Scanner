"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, postJson } from "@/lib/api";
import { isValidEmail, isValidIndianPhone, isValidUsername, normalizePhone } from "@/lib/validation";
import { Spinner } from "./Icon";
import { useToast } from "./Providers";

type Errors = Partial<Record<"username" | "phone" | "email", string>>;

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    const name = username.trim();
    if (name.length < 2) e.username = "Enter your name (at least 2 characters).";
    else if (!isValidUsername(name)) e.username = "Use letters, digits, spaces, dots, hyphens or underscores.";
    if (!isValidIndianPhone(normalizePhone(phone))) e.phone = "Enter a 10 digit Indian mobile number starting with 6, 7, 8 or 9.";
    if (email.trim() && !isValidEmail(email.trim())) e.email = "Enter a valid email address, or leave it blank.";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const res = await postJson<{ redirect: string }>("/api/auth/login", {
        username: username.trim(),
        phone: normalizePhone(phone),
        email: email.trim(),
      });
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields as Errors);
      toast(err instanceof Error ? err.message : "Sign in failed. Please try again.", "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          Your name
        </label>
        <input id="username" className={`input ${errors.username ? "input-invalid" : ""}`} autoComplete="name" maxLength={60} placeholder="Rahul Sharma" value={username} onChange={(e) => setUsername(e.target.value)} />
        <p className="field-error" role="alert">
          {errors.username}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="phone">
          Mobile number
        </label>
        <div className="flex">
          <span className="grid min-h-11 place-items-center rounded-l-xl border border-r-0 border-line bg-paper px-3 text-sm font-semibold text-ink">+91</span>
          <input
            id="phone"
            className={`input rounded-l-none ${errors.phone ? "input-invalid" : ""}`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D+/g, "").slice(0, 10))}
          />
        </div>
        <p className="field-error" role="alert">
          {errors.phone}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="email" type="email" className={`input ${errors.email ? "input-invalid" : ""}`} autoComplete="email" maxLength={120} placeholder="rahul@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="field-error" role="alert">
          {errors.email}
        </p>
      </div>

      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy && <Spinner className="size-5" />}
        {busy ? "Signing in..." : "Continue"}
      </button>
      <p className="text-center text-xs text-muted">Use the same name and number every time so your uploads stay together. No OTP, no messages.</p>
    </form>
  );
}
