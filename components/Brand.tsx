import Link from "next/link";
import { Icon } from "./Icon";

export function Brand({ href = "/", tag }: { href?: string; tag?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-white no-underline">
      <span className="grid size-8 place-items-center rounded-lg bg-white/12">
        <Icon name="scan" className="size-5" />
      </span>
      <span className="font-bold tracking-tight">Invoice Scanner</span>
      {tag && <span className="text-sm font-medium text-white/65">{tag}</span>}
    </Link>
  );
}
