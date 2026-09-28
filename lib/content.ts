import { db } from "./db";

export type Announcement = { id: string; message: string; level: "info" | "warning" };

/** Published announcements whose date window contains today (Indian time). */
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const items = await db.contentItem.findMany({
    where: { collection: "announcements", published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 10,
  });
  return items
    .map((item) => ({ id: item.id, data: (item.data ?? {}) as Record<string, unknown> }))
    .filter(({ data }) => {
      const from = typeof data.startsOn === "string" ? data.startsOn : "";
      const to = typeof data.endsOn === "string" ? data.endsOn : "";
      return (!from || from <= today) && (!to || to >= today);
    })
    .map(({ id, data }) => ({
      id,
      message: typeof data.message === "string" ? data.message : "",
      level: data.level === "warning" ? ("warning" as const) : ("info" as const),
    }))
    .filter((a) => a.message);
}
