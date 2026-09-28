import { getActiveAnnouncements } from "@/lib/content";
import { Icon } from "./Icon";

export async function Announcements() {
  const items = await getActiveAnnouncements();
  if (items.length === 0) return null;
  return (
    <div className="space-y-2" aria-label="Announcements">
      {items.map((a) => (
        <div key={a.id} className={`alert flex items-start gap-2 ${a.level === "warning" ? "alert-warning" : "alert-info"}`}>
          <Icon name={a.level === "warning" ? "alert" : "eye"} className="mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-line">{a.message}</p>
        </div>
      ))}
    </div>
  );
}
