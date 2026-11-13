"use client";

import { useActionState, useState } from "react";
import { beginTotp, confirmTotp, disableTotp } from "@/app/actions/admin";

export function TotpPanel({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState("");
  const [confirmMessage, confirmAction, confirming] = useActionState(confirmTotp, "");
  const [disableMessage, disableAction, disabling] = useActionState(disableTotp, "");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const result = await beginTotp();
    setPending(result.startsWith("PENDING") ? result : "");
    if (!result.startsWith("PENDING")) setPending(result);
    setBusy(false);
  }

  const lines = pending.startsWith("PENDING") ? pending.split("\n") : [];
  const secret = lines[1] ?? "";
  const uri = lines[2] ?? "";

  return (
    <section className="panel" style={{ marginTop: 28 }}>
      <h2>
        雙因素驗證
        <small>選用。啟用後，員工登入除了密碼還需要驗證器 App 的六位數驗證碼。</small>
      </h2>
      <p style={{ marginTop: 0 }}>目前狀態：{enabled ? "已啟用" : "未啟用"}</p>
      {!enabled && (
        <>
          <button type="button" className="btn" onClick={() => void start()} disabled={busy}>
            {busy ? "產生中…" : "產生驗證金鑰"}
          </button>
          {secret && (
            <div className="notice" style={{ marginTop: 16 }}>
              <p style={{ marginTop: 0 }}>請把這組金鑰加到驗證器 App（Google Authenticator、1Password 等），再輸入驗證碼確認。</p>
              <p className="mono" style={{ wordBreak: "break-all" }}>{secret}</p>
              <p className="mono" style={{ wordBreak: "break-all", fontSize: 12 }}>{uri}</p>
              <form action={confirmAction}>
                <label className="field">
                  <span className="label">驗證碼</span>
                  <input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
                </label>
                {confirmMessage && <div className="notice" style={{ marginBottom: 12 }}>{confirmMessage}</div>}
                <button className="btn solid" disabled={confirming}>{confirming ? "確認中…" : "確認並啟用"}</button>
              </form>
            </div>
          )}
          {pending && !secret && <div className="notice error" style={{ marginTop: 16 }}>{pending}</div>}
        </>
      )}
      {enabled && (
        <form action={disableAction}>
          <label className="field">
            <span className="label">輸入目前密碼以關閉</span>
            <input className="input" type="password" name="password" required autoComplete="current-password" />
          </label>
          {disableMessage && <div className="notice" style={{ marginBottom: 12 }}>{disableMessage}</div>}
          <button className="btn danger" disabled={disabling}>{disabling ? "關閉中…" : "關閉雙因素驗證"}</button>
        </form>
      )}
    </section>
  );
}
