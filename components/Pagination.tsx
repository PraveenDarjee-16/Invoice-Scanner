import Link from "next/link";

/** Server-rendered pager. `params` are the current filters that must be kept in the links. */
export function Pagination({ basePath, page, totalPages, params }: { basePath: string; page: number; totalPages: number; params: Record<string, string> }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
