import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp, handle, HttpError, ok, readJson, str } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { setSession } from "@/lib/session";
import { isValidEmail, isValidIndianPhone, isValidUsername, normalizePhone } from "@/lib/validation";

/** Client sign-in. Unknown username + mobile pairs are created on first use (no registration page, no OTP). */
export const POST = handle(async (req) => {
  const body = await readJson(req);
  const username = str(body.username).replace(/\s+/g, " ");
  const phone = normalizePhone(str(body.phone));
  const email = str(body.email);

  const fields: Record<string, string> = {};
  if (username.length < 2) fields.username = "Enter your name (at least 2 characters).";
  else if (!isValidUsername(username)) fields.username = "Use 2-60 letters, digits, spaces, dots, hyphens or underscores.";
  if (!phone) fields.phone = "Enter your mobile number.";
  else if (!isValidIndianPhone(phone)) fields.phone = "Enter a 10 digit Indian mobile number starting with 6, 7, 8 or 9.";
  if (email && !isValidEmail(email)) fields.email = "Enter a valid email address, or leave it blank.";
  if (Object.keys(fields).length > 0) throw new HttpError(422, "Check the highlighted fields.", fields);

  await rateLimit(`client-login:${clientIp(req)}`, 30, 600);

  const usernameKey = username.toLowerCase();
  const existing = await db.client.findUnique({ where: { usernameKey_phone: { usernameKey, phone } } });
  if (existing?.disabled) {
    throw new HttpError(403, "This account has been disabled. Please contact the office.");
  }

  let client;
  try {
    client = existing
      ? await db.client.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), ...(email ? { email } : {}) },
        })
      : await db.client.create({ data: { username, usernameKey, phone, email: email || null } });
  } catch (err) {
    // Two first-time requests at once: the other one won, so load that record.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      client = await db.client.findUnique({ where: { usernameKey_phone: { usernameKey, phone } } });
    } else throw err;
  }
  if (!client) throw new HttpError(500, "We could not sign you in right now. Please try again.");

  await setSession("client", client.id);
  return ok({ isNew: !existing, redirect: "/dashboard" });
});
