import { getStore } from "@/lib/store";
import { lineConfig, lineLoginEnabled, siteOrigin } from "@/lib/line";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function SettingsPage() {
  const { settings } = await getStore();
  const cfg = lineConfig(settings);
  const { secret: _s, loginChannelSecret: _l, messagingToken: _m, ...safe } = settings;
  void _s;
  void _l;
  void _m;
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
        callbackUrl={`${await siteOrigin()}/api/line/callback`}
        loginReady={lineLoginEnabled(settings)}
      />
    </>
  );
}
