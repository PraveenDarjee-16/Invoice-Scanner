/**
 * Creates the first admin account.
 *   npm run admin:create
 * Reads ADMIN_USERNAME / ADMIN_PASSWORD from the environment or from .env.
 * Existing admins are left untouched unless ADMIN_RESET_PASSWORD=true.
 * On Vercel this runs during the build; without ADMIN_PASSWORD it exits quietly.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file (for example on Vercel) - use real environment variables */
}

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const reset = process.env.ADMIN_RESET_PASSWORD === "true";

  if (!username || !password) {
    console.log("[admin] ADMIN_USERNAME / ADMIN_PASSWORD not set - skipping admin creation.");
    return;
  }
  if (!/^[A-Za-z0-9._-]{3,60}$/.test(username)) {
    throw new Error("ADMIN_USERNAME must be 3-60 letters, digits, dots, hyphens or underscores.");
  }
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters.");

  const db = new PrismaClient();
  try {
    const existing = await db.admin.findUnique({ where: { username } });
    if (existing && !reset) {
      console.log(`[admin] "${username}" already exists - nothing changed.`);
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    if (existing) {
      await db.admin.update({ where: { username }, data: { passwordHash } });
      console.log(`[admin] Password for "${username}" was reset.`);
    } else {
      await db.admin.create({ data: { username, passwordHash } });
      console.log(`[admin] Admin "${username}" created.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[admin]", err instanceof Error ? err.message : err);
  process.exit(1);
});
