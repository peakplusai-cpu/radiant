import type { Metadata } from "next";

export const metadata: Metadata = { title: "員工後台", robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell">{children}</div>;
}
