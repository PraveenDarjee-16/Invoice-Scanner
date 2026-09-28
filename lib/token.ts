import { SignJWT, jwtVerify } from "jose";

export const CLIENT_COOKIE = "invscan_client";
export const ADMIN_COOKIE = "invscan_admin";
export const CLIENT_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12 hours

export type SessionKind = "client" | "admin";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is missing or shorter than 32 characters. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(kind: SessionKind, subject: string, maxAgeSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .sign(secretKey());
}

/** Returns the subject (client id / admin id) or null when the token is missing, forged or expired. */
export async function verifyToken(token: string | undefined, kind: SessionKind): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== kind || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
