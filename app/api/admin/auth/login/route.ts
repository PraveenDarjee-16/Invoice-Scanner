import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientIp, handle, HttpError, ok, readJson, str } from "@/lib/http";
import { rateLimit, resetRateLimit } from "@/lib/ratelimit";
import { setSession } from "@/lib/session";

let dummyHash: string | undefined;

export const POST = handle(async (req) => {
  const body = await readJson(req);
  const username = str(body.username).slice(0, 60);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!username || !password) throw new HttpError(422, "Enter your username and password.");

  const key = `admin-login:${clientIp(req)}:${username.toLowerCase()}`;
  await rateLimit(key, 5, 600);

  const admin = await db.admin.findUnique({ where: { username } });
  // Compare against a dummy hash for unknown users so response time does not reveal which usernames exist.
  const hash = admin?.passwordHash ?? (dummyHash ??= await bcrypt.hash("not-a-real-password", 12));
  const valid = await bcrypt.compare(password, hash);
  if (!admin || !valid) throw new HttpError(401, "Those details do not match an admin account.");

  await resetRateLimit(key);
  await db.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await setSession("admin", admin.id);
  return ok({ redirect: "/admin" });
});
