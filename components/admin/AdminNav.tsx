"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "總覽", exact: true },
  { href: "/admin/products", label: "商品" },
  { href: "/admin/orders", label: "訂單" },
  { href: "/admin/customers", label: "客戶" },
  { href: "/admin/settings", label: "設定" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="後台選單">
      {ITEMS.map((i) => {
        const on = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={on ? "on" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
