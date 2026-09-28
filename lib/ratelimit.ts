import { db } from "./db";
import { HttpError } from "./http";

/** Counts one attempt for `key`. Throws 429 once `limit` attempts happen inside `windowSeconds`. */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const row = await db.rateLimit.findUnique({ where: { key } });
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  if (!row || row.resetAt <= now) {
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return;
  }
  if (row.count >= limit) {
    const wait = Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000));
    throw new HttpError(429, `Too many attempts. Please try again in ${wait} seconds.`);
  }
  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
}

export async function resetRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}
