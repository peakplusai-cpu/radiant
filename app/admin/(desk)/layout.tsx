import Link from "next/link";
import { redirect } from "next/navigation";
import { adminExists, isAuthenticated } from "@/lib/auth";
import { logoutAdmin } from "@/app/actions/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  if (!(await adminExists())) redirect("/admin/setup");
  if (!(await isAuthenticated())) redirect("/admin/login");
  return (
    <>
      <header className="admin-bar">
        <div className="admin-brand">
          <span className="wordmark">Radiant</span>
          <small>Staff</small>
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
