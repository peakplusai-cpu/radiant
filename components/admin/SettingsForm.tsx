"use client";

import { useActionState, useState } from "react";
import { saveSettings, testPush } from "@/app/actions/admin";
import type { PickupPoint, Settings } from "@/lib/types";

type PointDraft = PickupPoint & { key: string };

let pointN = 0;
const nextPointKey = () => `pk${++pointN}`;

type Props = {
  settings: Omit<Settings, "secret" | "loginChannelSecret" | "messagingToken" | "messagingChannelSecret">;
  hasLoginSecret: boolean;
  hasMessagingToken: boolean;
  hasMessagingSecret: boolean;
  callbackUrl: string;
  webhookUrl: string;
  loginReady: boolean;
  missingBusiness: string[];
};

export function SettingsForm({
  settings,
  hasLoginSecret,
  hasMessagingToken,
  hasMessagingSecret,
  callbackUrl,
  webhookUrl,
  loginReady,
  missingBusiness,
}: Props) {
  const [message, action, pending] = useActionState(saveSettings, "");
  const [testMessage, testAction, testing] = useActionState(testPush, "");
  const [points, setPoints] = useState<PointDraft[]>(() =>
    (settings.pickupPoints ?? []).map((p) => ({ ...p, key: nextPointKey() }))
  );

  function patchPoint(key: string, patch: Partial<PointDraft>) {
    setPoints((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  return (
    <>
      <form action={action}>
        <input
          type="hidden"
          name="pickupPoints"
          value={JSON.stringify(
            points.map((p) => ({ id: p.id, name: p.name, address: p.address, hours: p.hours, note: p.note, enabled: p.enabled }))
          )}
        />
        {missingBusiness.length > 0 && (
          <div className="notice error" style={{ marginBottom: 22 }} role="status">
            上線前請填寫經營者資訊：{missingBusiness.join("、")}。空白欄位不會顯示在頁尾與法規頁面，但正式營業前必須填寫。
          </div>
        )}
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
                  狀態：<b style={{ color: loginReady ? "var(--teal-deep)" : "var(--alert)" }}>{loginReady ? "已啟用。結帳不必登入；登入只用於查看以此 LINE 下過的訂單" : "未設定。結帳以訪客身分填寫資料即可"}</b>
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
                LINE 訂單通知
                <small>新訂單、付款完成，以及付款失敗或逾時取消時通知店家。失敗不會影響結帳或藍新入帳。</small>
              </h2>
              <div className="notice" style={{ marginBottom: 22 }}>
                <p style={{ margin: "0 0 8px" }}>設定步驟：</p>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>在 LINE Developers 的 Messaging API channel 發行 Channel access token（長期），貼到下方。已儲存的權杖不會再顯示。</li>
                  <li>同一組 channel 的 Channel secret 也貼到下方，用來驗證 Webhook 簽章。已儲存的 secret 不會再顯示。</li>
                  <li>
                    把 Webhook URL 設成下方網址並啟用 Use webhook：
                    <div className="mono" style={{ marginTop: 8 }}>{webhookUrl}</div>
                  </li>
                  <li>把官方帳號加為好友，或邀請進員工群組，傳送「綁定通知」。回到本頁下方核准通知對象。也可以手動貼上 User ID（U…）、Group ID（C…）或 Room ID（R…），多個用逗號或換行分隔。</li>
                  <li>按「發送 LINE 測試訊息」確認收得到。</li>
                </ol>
              </div>
              <label className="field">
                <span className="label">Channel access token</span>
                <input className="input" name="messagingToken" type="password" autoComplete="new-password" placeholder={hasMessagingToken ? "已設定，留白表示不變更" : ""} maxLength={400} />
                <span className="hint">只存在伺服器。此頁不會把已儲存的權杖送回瀏覽器。</span>
                {hasMessagingToken && (
                  <label className="toggle" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    <input type="checkbox" name="clearMessagingToken" />
                    <span>清除已儲存的權杖</span>
                  </label>
                )}
              </label>
              <label className="field">
                <span className="label">Channel secret</span>
                <input className="input" name="messagingChannelSecret" type="password" autoComplete="new-password" placeholder={hasMessagingSecret ? "已設定，留白表示不變更" : ""} maxLength={200} />
                <span className="hint">用於驗證 Webhook 的 X-Line-Signature。也可以改放環境變數 LINE_MESSAGING_CHANNEL_SECRET。</span>
                {hasMessagingSecret && (
                  <label className="toggle" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    <input type="checkbox" name="clearMessagingSecret" />
                    <span>清除已儲存的 Channel secret</span>
                  </label>
                )}
              </label>
              <label className="field">
                <span className="label">店家通知對象（可多個）</span>
                <textarea className="textarea" name="notifyTo" defaultValue={settings.notifyTo} placeholder={"Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} maxLength={2000} />
                <span className="hint">User ID、Group ID 或 Room ID，以逗號或換行分隔，最多 20 個。留白則不通知店家。</span>
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
                <span className="label">經營者名稱</span>
                <input className="input" name="businessName" defaultValue={settings.businessName} maxLength={80} autoComplete="organization" />
              </label>
              <label className="field">
                <span className="label">統一編號</span>
                <input className="input" name="taxId" defaultValue={settings.taxId} maxLength={8} inputMode="numeric" />
              </label>
              <label className="field">
                <span className="label">地址</span>
                <input className="input" name="address" defaultValue={settings.address} maxLength={200} autoComplete="street-address" />
              </label>
              <label className="field">
                <span className="label">電話</span>
                <input className="input" name="phone" defaultValue={settings.phone} maxLength={40} autoComplete="tel" />
              </label>
              <label className="field">
                <span className="label">Email</span>
                <input className="input" name="email" defaultValue={settings.email} maxLength={80} autoComplete="email" />
              </label>
              <label className="field">
                <span className="label">退貨地址</span>
                <input className="input" name="returnAddress" defaultValue={settings.returnAddress} maxLength={200} />
                <span className="hint">顯示在頁尾、隱私權政策、服務條款與退換貨政策。沒填的欄位不會出現。</span>
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
                  <span className="label">宅配運費 NT$</span>
                  <input className="input" type="number" min={0} name="shippingFee" defaultValue={settings.shippingFee} />
                </label>
                <label className="field">
                  <span className="label">超商店到店運費 NT$</span>
                  <input className="input" type="number" min={0} name="cvsShippingFee" defaultValue={settings.cvsShippingFee} />
                  <span className="hint">7-ELEVEN、全家、萊爾富統一收這個金額；達免運門檻免收。</span>
                </label>
              </div>
              <div className="two">
                <label className="field">
                  <span className="label">免運門檻 NT$</span>
                  <input className="input" type="number" min={0} name="freeShippingThreshold" defaultValue={settings.freeShippingThreshold} />
                </label>
              </div>
              <label className="field">
                <span className="label">付款說明</span>
                <textarea className="textarea" name="paymentNote" defaultValue={settings.paymentNote} maxLength={600} />
                <span className="hint">只在客戶改選「由我們確認付款」時顯示。藍新金流訂單會顯示固定的付款說明，不受這段文字影響。</span>
              </label>
            </section>

            <section className="panel">
              <h2>
                自取地點
                <small>至少有一個啟用中的地點，結帳頁才會出現自取選項。自取不收運費。</small>
              </h2>
              {points.map((p, i) => (
                <div key={p.key} className="point-card">
                  <div className="point-card-head">
                    <span>地點 {i + 1}</span>
                    <button type="button" className="btn small danger" onClick={() => setPoints((list) => list.filter((x) => x.key !== p.key))}>
                      刪除
                    </button>
                  </div>
                  <label className="field">
                    <span className="label">名稱</span>
                    <input
                      className="input"
                      value={p.name}
                      onChange={(e) => patchPoint(p.key, { name: e.target.value })}
                      placeholder="例如：大安門市、7-ELEVEN 某某門市"
                      maxLength={80}
                    />
                  </label>
                  <label className="field">
                    <span className="label">地址或位置說明</span>
                    <input
                      className="input"
                      value={p.address}
                      onChange={(e) => patchPoint(p.key, { address: e.target.value })}
                      maxLength={200}
                    />
                  </label>
                  <label className="field">
                    <span className="label">可取時段（選填）</span>
                    <input
                      className="input"
                      value={p.hours}
                      onChange={(e) => patchPoint(p.key, { hours: e.target.value })}
                      placeholder="例如：平日 12:00–20:00"
                      maxLength={80}
                    />
                  </label>
                  <label className="field">
                    <span className="label">備註（選填）</span>
                    <input
                      className="input"
                      value={p.note}
                      onChange={(e) => patchPoint(p.key, { note: e.target.value })}
                      maxLength={160}
                    />
                  </label>
                  <label className="toggle" style={{ marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => patchPoint(p.key, { enabled: e.target.checked })}
                    />
                    <span>開放自取</span>
                  </label>
                </div>
              ))}
              {points.length < 20 && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    setPoints((list) => [
                      ...list,
                      { key: nextPointKey(), id: "", name: "", address: "", hours: "", note: "", enabled: true },
                    ])
                  }
                >
                  新增自取點
                </button>
              )}
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
