import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckoutForm } from "@/components/CheckoutForm";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";
import { enabledPickupPoints } from "@/lib/pickup";
import { paymentOptions } from "@/lib/newebpay";

export const dynamic = "force-dynamic";
export const metadata = { title: "結帳" };

const LINE_ERRORS: Record<string, string> = {
  state: "登入逾時或已失效，請重新嘗試。",
  token: "LINE 驗證失敗，請重新嘗試。",
  profile: "無法取得 LINE 個人資料，請重新嘗試。",
  config: "LINE 登入尚未設定完成。",
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const { line } = await searchParams;
  const { settings } = await getStore();
  const identity = await getLineIdentity();
  const loginOn = lineLoginEnabled(settings);
  const options = paymentOptions();

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">結帳</span>
          <h1>結帳</h1>
        </div>
        {line && LINE_ERRORS[line] && (
          <div className="notice error" style={{ marginBottom: 28 }}>
            {LINE_ERRORS[line]}
          </div>
        )}
        {loginOn && !identity && (
          <p className="notice" style={{ marginBottom: 20 }}>
            結帳不需要登入。若希望之後在「我的訂單」看到 LINE 紀錄，可以先{" "}
            <a href="/api/line/login?next=/checkout" className="link">用 LINE 登入</a>
            。購物袋會保留。
          </p>
        )}
        <CheckoutForm
          identity={identity ? { name: identity.name } : null}
          paymentNote={settings.paymentNote}
          pickupPoints={enabledPickupPoints(settings)}
          options={options}
        />
      </main>
      <Footer />
    </>
  );
}
