import { redirect } from "next/navigation";
import { adminExists, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "@/components/admin/AuthForms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await adminExists())) redirect("/admin/setup");
  if (await isAuthenticated()) redirect("/admin");
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="wordmark">Radiant</div>
        <div className="sub">STAFF ONLY</div>
        <LoginForm />
      </div>
    </div>
  );
}
