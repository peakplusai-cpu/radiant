import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderReceipt } from "@/components/OrderReceipt";
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
          <span className="eyebrow">Orders</span>
          <h1>
            My orders<span className="zh">我的訂單</span>
          </h1>
        </div>
        {!identity ? (
          <section className="gate">
            <span className="eyebrow">LINE</span>
            <h2>以 LINE 查看訂單</h2>
            <p>登入後即可看到您以 LINE 帳號下過的所有訂單。</p>
            {lineLoginEnabled(settings) ? (
              <a href="/api/line/login?next=/orders" className="btn line-green">
                使用 LINE 登入
              </a>
            ) : (
              <p style={{ margin: 0 }}>目前尚未開放 LINE 登入查詢，請透過官方 LINE 與我們聯繫。</p>
            )}
          </section>
        ) : mine.length === 0 ? (
          <div className="empty">
            <span className="eyebrow">No orders yet</span>
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
