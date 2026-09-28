"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../Icon";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "grid", exact: true },
  { href: "/admin/clients", label: "Clients", icon: "users" },
  { href: "/admin/submissions", label: "Submissions", icon: "files" },
  { href: "/admin/content", label: "Website content", icon: "edit" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold no-underline transition-colors ${
              active ? "bg-accent text-white" : "text-ink hover:bg-white"
            }`}
          >
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
