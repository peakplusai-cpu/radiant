import { redirect } from "next/navigation";
import { adminExists, isAuthenticated } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { LoginForm } from "@/components/admin/AuthForms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await adminExists())) redirect("/admin/setup");
  if (await isAuthenticated()) redirect("/admin");
  const totpEnabled = Boolean((await getStore()).admin?.totpSecret);
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="brand-logo login-logo">
          <img src="/logo-mark.png" alt="Radiant" width={64} height={64} />
        </div>
        <div className="sub">STAFF ONLY</div>
        <LoginForm totpEnabled={totpEnabled} />
      </div>
    </div>
  );
}
