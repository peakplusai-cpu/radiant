"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OrderLookup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.get("code"),
          phone: form.get("phone"),
          email: form.get("email"),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        setError(json.error ?? "找不到符合的訂單");
        setBusy(false);
        return;
      }
      router.push(`/order/${json.code}`);
    } catch {
      setError("網路連線異常，請再試一次");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel" style={{ marginBottom: 28 }} noValidate>
      <h2 style={{ fontFamily: "var(--serif-tc)", fontSize: 20, marginTop: 0 }}>用訂單資料查詢</h2>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>請輸入結帳時的訂單編號、手機與 Email。三項都要相符。</p>
      <label className="field">
        <span className="label">訂單編號</span>
        <input className="input" name="code" required maxLength={20} autoComplete="off" placeholder="RD2511160001" disabled={busy} />
      </label>
      <div className="two">
        <label className="field">
          <span className="label">手機</span>
          <input className="input" name="phone" required inputMode="tel" autoComplete="tel" placeholder="0912345678" disabled={busy} />
        </label>
        <label className="field">
          <span className="label">電子郵件</span>
          <input className="input" name="email" type="email" required autoComplete="email" disabled={busy} />
        </label>
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button type="submit" className="btn solid" disabled={busy}>{busy ? "查詢中…" : "查詢訂單"}</button>
    </form>
  );
}
