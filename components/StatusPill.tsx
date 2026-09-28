const LABEL = { PROCESSING: "Processing", COMPLETED: "Completed", FAILED: "Failed" } as const;

export function StatusPill({ status }: { status: keyof typeof LABEL }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{LABEL[status]}</span>;
}
