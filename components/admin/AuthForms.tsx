"use client";

import { useActionState } from "react";
import { loginAdmin, setupAdmin } from "@/app/actions/admin";

export function LoginForm({ totpEnabled = false }: { totpEnabled?: boolean }) {
  const [error, action, pending] = useActionState(loginAdmin, "");
  const askCode = totpEnabled || error.includes("驗證碼");
  return (
    <form action={action}>
      <label className="field">
        <span className="label">密碼</span>
        <input className="input" type="password" name="password" required autoFocus autoComplete="current-password" />
      </label>
      {askCode && (
        <label className="field">
          <span className="label">驗證碼</span>
          <input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="6 位數" />
        </label>
      )}
      {error && <div className="notice error" style={{ marginBottom: 20 }} role="alert">{error}</div>}
      <button className="btn solid" style={{ width: "100%" }} disabled={pending}>
        {pending ? "驗證中…" : "登入"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const [error, action, pending] = useActionState(setupAdmin, "");
  return (
    <form action={action}>
      <label className="field">
        <span className="label">設定密碼</span>
        <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" />
        <span className="hint">至少 8 個字元</span>
      </label>
      <label className="field">
        <span className="label">再次輸入</span>
        <input className="input" type="password" name="confirm" required minLength={8} autoComplete="new-password" />
      </label>
      {error && <div className="notice error" style={{ marginBottom: 20 }} role="alert">{error}</div>}
      <button className="btn solid" style={{ width: "100%" }} disabled={pending}>
        {pending ? "建立中…" : "建立並進入後台"}
      </button>
    </form>
  );
}
