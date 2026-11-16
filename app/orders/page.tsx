import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderReceipt } from "@/components/OrderReceipt";
import { OrderLookup } from "@/components/OrderLookup";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的訂單" };

export default async function OrdersPage() {
  const { orders, customers, settings } = await getStore();
  const identity = await getLineIdentity();
  const customer = identity ? customers.find((c) => c.lineUserId === identity.userId) : undefined;
  const mine = customer
    ? orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const total = mine.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">訂單</span>
          <h1>我的訂單</h1>
        </div>
        <OrderLookup />
        {!identity ? (
          <section className="gate">
            <span className="eyebrow">LINE</span>
            <h2>以 LINE 查看訂單（選用）</h2>
            <p>登入後可以看到您以這個 LINE 帳號下過的訂單。訪客訂單請用上方的訂單編號查詢。</p>
            {lineLoginEnabled(settings) ? (
              <a href="/api/line/login?next=/orders" className="btn line-green">
                使用 LINE 登入
              </a>
            ) : (
              <p style={{ margin: 0 }}>目前尚未開放 LINE 登入。請用訂單編號、手機與 Email 查詢。</p>
            )}
          </section>
        ) : mine.length === 0 ? (
          <div className="empty">
            <span className="eyebrow">尚無訂單</span>
            <p>{identity.name} 還沒有訂單。</p>
          </div>
        ) : (
          <>
            <div className="identity">
              <div className="who">
                <small>{mine.length} 張訂單 · 累計 {formatPrice(total)}</small>
                {identity.name}
              </div>
              <a href="/api/line/logout?next=/orders" className="link" style={{ fontSize: 13 }}>
                登出 LINE
              </a>
            </div>
            <div className="order-group">
              {mine.map((o) => (
                <OrderReceipt key={o.id} order={o} />
              ))}
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
