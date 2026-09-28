import { handle, ok } from "@/lib/http";
import { clearSession } from "@/lib/session";

export const POST = handle(async () => {
  await clearSession("admin");
  return ok();
});
