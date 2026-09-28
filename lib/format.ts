const TZ = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatTime = (d: Date | string) => timeFmt.format(new Date(d)).toUpperCase();
export const formatDateTime = (d: Date | string) => `${formatDate(d)}, ${formatTime(d)}`;

/** "2026-09-28" in Indian time. */
export const istDateKey = (d: Date) => keyFmt.format(d);
export const istStartOfDay = (key: string) => new Date(`${key}T00:00:00+05:30`);
export const istEndOfDay = (key: string) => new Date(`${key}T23:59:59.999+05:30`);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024) return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(1)} TB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
