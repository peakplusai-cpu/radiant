"use client";

import { useState } from "react";
import { startPayment } from "@/lib/pay-client";

export function PayButton({ code, token, label }: { code: string; token?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setError("");
    const failed = await startPayment(code, token);
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button type="button" className="btn solid" onClick={go} disabled={busy}>
        {busy ? "前往藍新金流…" : label}
      </button>
      {error && (
        <div className="notice error" style={{ marginTop: 12 }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
