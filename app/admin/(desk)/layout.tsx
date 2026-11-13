import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAdmin } from "@/app/actions/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="admin-bar">
        <div className="admin-brand">
          <img src="/logo-mark.png" alt="Radiant" className="admin-logo" width={32} height={32} />
          <small>員工</small>
        </div>
        <AdminNav />
        <div className="admin-tools">
          <Link href="/" target="_blank">
            查看前台 ↗
          </Link>
          <form action={logoutAdmin}>
            <button type="submit">登出</button>
          </form>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </>
  );
}
