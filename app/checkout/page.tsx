import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckoutForm } from "@/components/CheckoutForm";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";

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
          <span className="eyebrow">Checkout</span>
          <h1>
            Checkout<span className="zh">結帳</span>
          </h1>
        </div>
        {line && LINE_ERRORS[line] && (
          <div className="notice error" style={{ marginBottom: 28 }}>
            {LINE_ERRORS[line]}
          </div>
        )}
        {loginOn && !identity ? (
          <section className="gate">
            <span className="eyebrow">LINE</span>
            <h2>請先連接 LINE 帳號</h2>
            <p>結帳需要您的 LINE 名稱與 ID，讓我們辨識身分、合併您的多筆訂單，並透過 LINE 與您聯繫。</p>
            <a href="/api/line/login?next=/checkout" className="btn line-green">
              使用 LINE 登入
            </a>
          </section>
        ) : (
          <CheckoutForm identity={identity ? { name: identity.name } : null} paymentNote={settings.paymentNote} />
        )}
      </main>
      <Footer />
    </>
  );
}
