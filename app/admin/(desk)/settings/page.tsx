import { approveNotifyTarget, dismissNotifyTarget } from "@/app/actions/admin";
import { getAdminStore } from "@/lib/auth";
import { missingBusinessFields } from "@/lib/business";
import { lineConfig, lineLoginEnabled, siteOrigin } from "@/lib/line";
import { publicSiteUrl } from "@/lib/site";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { TotpPanel } from "@/components/admin/TotpPanel";

export default async function SettingsPage() {
  const { settings, admin } = await getAdminStore();
  const cfg = lineConfig(settings);
  const hasMessagingSecret = Boolean(settings.messagingChannelSecret);
  const pending = settings.pendingNotifies ?? [];
  const { secret: _s, loginChannelSecret: _l, messagingToken: _m, messagingChannelSecret: _c, ...safe } = settings;
  void _s;
  void _l;
  void _m;
  void _c;
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>設定</h1>
        </div>
      </div>
      <SettingsForm
        settings={safe}
        hasLoginSecret={Boolean(cfg.loginSecret)}
        hasMessagingToken={Boolean(cfg.messagingToken)}
        hasMessagingSecret={hasMessagingSecret}
        callbackUrl={`${await siteOrigin()}/api/line/callback`}
        webhookUrl={`${publicSiteUrl()}/api/line/webhook`}
        loginReady={lineLoginEnabled(settings)}
        missingBusiness={missingBusinessFields(settings)}
      />
      {pending.length > 0 && (
        <section className="panel" style={{ marginTop: 28 }}>
          <h2>
            待核准的通知對象
            <small>有人傳送「綁定通知」後會出現在這裡。核准後才會收到訂單內容。</small>
          </h2>
          {pending.map((item) => (
            <div key={item.id} className="point-card">
              <div className="mono">{item.id}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 12px" }}>
                {item.kind === "group" ? "群組" : item.kind === "room" ? "聊天室" : "使用者"}
                {item.at ? ` · ${item.at.slice(0, 16).replace("T", " ")}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <form action={approveNotifyTarget}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="btn small solid" type="submit">核准</button>
                </form>
                <form action={dismissNotifyTarget}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="btn small" type="submit">忽略</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}
      <TotpPanel enabled={Boolean(admin?.totpSecret)} />
    </>
  );
}
