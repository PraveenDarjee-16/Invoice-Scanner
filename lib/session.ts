import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { HttpError } from "./http";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  CLIENT_COOKIE,
  CLIENT_MAX_AGE,
  signToken,
  verifyToken,
  type SessionKind,
} from "./token";

const cookieName = (kind: SessionKind) => (kind === "client" ? CLIENT_COOKIE : ADMIN_COOKIE);

export async function setSession(kind: SessionKind, subject: string) {
  const maxAge = kind === "client" ? CLIENT_MAX_AGE : ADMIN_MAX_AGE;
  const jar = await cookies();
  jar.set(cookieName(kind), await signToken(kind, subject, maxAge), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function clearSession(kind: SessionKind) {
  const jar = await cookies();
  jar.delete(cookieName(kind));
}

/** Current client, or null. Re-checks the database so a disabled client is locked out immediately. */
export const getClient = cache(async () => {
  const jar = await cookies();
  const id = await verifyToken(jar.get(CLIENT_COOKIE)?.value, "client");
  if (!id) return null;
  const client = await db.client.findUnique({ where: { id } });
  return client && !client.disabled ? client : null;
});

export const getAdmin = cache(async () => {
  const jar = await cookies();
  const id = await verifyToken(jar.get(ADMIN_COOKIE)?.value, "admin");
  if (!id) return null;
  return db.admin.findUnique({ where: { id }, select: { id: true, username: true } });
});

/** For pages: redirects to sign-in. */
export async function requireClient() {
  const client = await getClient();
  if (!client) redirect("/?expired=1");
  return client;
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For API routes: throws a 401 that the route wrapper turns into JSON. */
export async function requireClientApi() {
  const client = await getClient();
  if (!client) throw new HttpError(401, "Your session has expired. Please sign in again.");
  return client;
}

export async function requireAdminApi() {
  const admin = await getAdmin();
  if (!admin) throw new HttpError(401, "Admin sign-in required.");
  return admin;
}
