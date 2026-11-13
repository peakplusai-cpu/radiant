import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckoutForm } from "@/components/CheckoutForm";
import { CartPreserveNote } from "@/components/CartPreserveNote";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";
import { enabledPickupPoints } from "@/lib/pickup";

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
        {loginOn && !identity ? (
          <section className="gate">
            <span className="eyebrow">LINE</span>
            <h2>結帳前請先用 LINE 登入</h2>
            <p>我們用 LINE 確認是您本人下單，並用 LINE 通知付款與出貨。網站沒有刷卡，訂單送出後由我們在 LINE 與您確認。</p>
            <p>購物袋裡的商品會保留，登入後會回到這個結帳頁。</p>
            <CartPreserveNote />
            <a href="/api/line/login?next=/checkout" className="btn line-green">
              使用 LINE 登入
            </a>
          </section>
        ) : (
          <CheckoutForm
            identity={identity ? { name: identity.name } : null}
            paymentNote={settings.paymentNote}
            pickupPoints={enabledPickupPoints(settings)}
            guest={!loginOn}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
