import { redirect } from "next/navigation";
import { adminExists } from "@/lib/auth";
import { SetupForm } from "@/components/admin/AuthForms";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await adminExists()) redirect("/admin/login");
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="wordmark">Radiant</div>
        <div className="sub">FIRST-TIME SETUP</div>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: -14, marginBottom: 28 }}>
          第一次使用，請設定員工後台的登入密碼。
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
