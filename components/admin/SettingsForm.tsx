"use client";

import { useActionState } from "react";
import { saveSettings, testPush } from "@/app/actions/admin";
import type { Settings } from "@/lib/types";

type Props = {
  settings: Omit<Settings, "secret" | "loginChannelSecret" | "messagingToken">;
  hasLoginSecret: boolean;
  hasMessagingToken: boolean;
  callbackUrl: string;
  loginReady: boolean;
};

export function SettingsForm({ settings, hasLoginSecret, hasMessagingToken, callbackUrl, loginReady }: Props) {
  const [message, action, pending] = useActionState(saveSettings, "");
  const [testMessage, testAction, testing] = useActionState(testPush, "");

  return (
    <>
      <form action={action}>
        <div className="form-grid">
          <div>
            <section className="panel">
              <h2>
                LINE 官方帳號
                <small>顯示在前台頁尾與訂單完成頁，讓客戶加入好友。</small>
              </h2>
              <label className="field">
                <span className="label">官方帳號名稱</span>
                <input className="input" name="lineOaName" defaultValue={settings.lineOaName} maxLength={60} />
              </label>
              <label className="field">
                <span className="label">Basic ID</span>
                <input className="input" name="lineOaBasicId" defaultValue={settings.lineOaBasicId} placeholder="@123abcde" maxLength={60} />
              </label>
              <label className="field">
                <span className="label">加入好友連結</span>
                <input className="input" name="lineOaUrl" defaultValue={settings.lineOaUrl} placeholder="https://lin.ee/xxxxxxx" maxLength={200} />
                <span className="hint">在 LINE Official Account Manager →「增加好友」→ 取得網址。</span>
              </label>
            </section>

            <section className="panel">
              <h2>
                LINE 登入（結帳辨識身分）
                <small>
                  狀態：<b style={{ color: loginReady ? "var(--teal-deep)" : "var(--alert)" }}>{loginReady ? "已啟用，結帳需 LINE 登入" : "未設定，結帳時由客戶自行填寫"}</b>
                </small>
              </h2>
              <label className="field">
                <span className="label">Channel ID</span>
                <input className="input" name="loginChannelId" defaultValue={settings.loginChannelId} maxLength={40} inputMode="numeric" />
              </label>
              <label className="field">
                <span className="label">Channel secret</span>
                <input className="input" name="loginChannelSecret" type="password" autoComplete="off" placeholder={hasLoginSecret ? "已設定，留白表示不變更" : ""} maxLength={80} />
                {hasLoginSecret && (
                  <label className="toggle" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    <input type="checkbox" name="clearLoginSecret" />
                    <span>清除已儲存的 Channel secret</span>
                  </label>
                )}
              </label>
              <div className="notice" style={{ marginBottom: 28 }}>
                請在 LINE Developers 的 LINE Login channel 中，將下列網址加入 Callback URL，並把 channel 與官方帳號連結，客戶登入時才會被引導加入好友：
                <div className="mono" style={{ marginTop: 8 }}>{callbackUrl}</div>
              </div>
            </section>

            <section className="panel">
              <h2>
                LINE 推播通知
                <small>新訂單時通知店家，並回覆客戶訂單確認（客戶需已加入官方帳號好友）。</small>
              </h2>
              <label className="field">
                <span className="label">Messaging API channel access token</span>
                <input className="input" name="messagingToken" type="password" autoComplete="off" placeholder={hasMessagingToken ? "已設定，留白表示不變更" : ""} maxLength={400} />
                {hasMessagingToken && (
                  <label className="toggle" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    <input type="checkbox" name="clearMessagingToken" />
                    <span>清除已儲存的權杖</span>
                  </label>
                )}
              </label>
              <label className="field">
                <span className="label">店家通知對象（User ID 或 Group ID）</span>
                <input className="input" name="notifyTo" defaultValue={settings.notifyTo} placeholder="Uxxxxxxxx…" maxLength={80} />
                <span className="hint">店家員工的 LINE User ID（需已加好友）。留白則不通知店家。</span>
              </label>
            </section>
          </div>

          <div>
            <section className="panel">
              <h2>商店資訊</h2>
              <label className="field">
                <span className="label">商店名稱</span>
                <input className="input" name="shopName" defaultValue={settings.shopName} maxLength={40} />
              </label>
              <label className="field">
                <span className="label">首頁文案</span>
                <textarea className="textarea" name="tagline" defaultValue={settings.tagline} maxLength={120} />
              </label>
              <label className="field">
                <span className="label">頂部公告</span>
                <input className="input" name="announcement" defaultValue={settings.announcement} maxLength={160} />
                <span className="hint">留白則不顯示。</span>
              </label>
            </section>

            <section className="panel">
              <h2>運費與付款</h2>
              <div className="two">
                <label className="field">
                  <span className="label">運費 NT$</span>
                  <input className="input" type="number" min={0} name="shippingFee" defaultValue={settings.shippingFee} />
                </label>
                <label className="field">
                  <span className="label">免運門檻 NT$</span>
                  <input className="input" type="number" min={0} name="freeShippingThreshold" defaultValue={settings.freeShippingThreshold} />
                </label>
              </div>
              <label className="field">
                <span className="label">付款說明</span>
                <textarea className="textarea" name="paymentNote" defaultValue={settings.paymentNote} maxLength={600} />
                <span className="hint">顯示在結帳頁與訂單完成頁，例如匯款帳號或收款方式。</span>
              </label>
            </section>
          </div>
        </div>

        <div className="savebar">
          <button className="btn solid" disabled={pending}>
            {pending ? "儲存中…" : "儲存設定"}
          </button>
          {message && <span style={{ color: "var(--teal-deep)", fontSize: 14 }} role="status">{message}</span>}
        </div>
      </form>

      <form action={testAction} style={{ marginTop: 28, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn small" disabled={testing}>
          {testing ? "發送中…" : "發送 LINE 測試訊息"}
        </button>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>請先儲存設定，再測試推播。</span>
        {testMessage && <span style={{ fontSize: 14 }} role="status">{testMessage}</span>}
      </form>
    </>
  );
}
