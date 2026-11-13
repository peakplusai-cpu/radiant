import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderReceipt } from "@/components/OrderReceipt";
import { officialLineHref } from "@/lib/line-link";
import { getStore } from "@/lib/store";
import { getLineIdentity } from "@/lib/line";
import { safeEqual } from "@/lib/auth";
import { hasReceiptGrant } from "@/lib/receipt";

export const dynamic = "force-dynamic";
export const metadata = { title: "訂單明細" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;
  const { orders, customers, settings } = await getStore();
  const order = orders.find((o) => o.code === code);
  if (!order) notFound();

  const identity = await getLineIdentity();
  const customer = customers.find((c) => c.id === order.customerId);
  const owner = Boolean(identity && customer?.lineUserId && customer.lineUserId === identity.userId);
  const granted = await hasReceiptGrant(order.code);
  if (!owner && !granted && !(t && safeEqual(t, order.token))) notFound();

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">謝謝</span>
          <h1>訂單已送出</h1>
        </div>
        <OrderReceipt order={order} />
        {settings.paymentNote && <div className="notice" style={{ marginBottom: 20 }}>{settings.paymentNote}</div>}
        {officialLineHref(settings) && (
          <div className="notice" style={{ marginBottom: 20 }}>
            請加入{settings.lineOaName ? `「${settings.lineOaName}」` : "我們的 LINE 官方帳號"}，以便收到訂單通知。{" "}
            <a href={officialLineHref(settings)} target="_blank" rel="noreferrer" className="link">
              加入好友
            </a>
          </div>
        )}
        <div style={{ padding: "16px 0 100px" }}>
          <Link href="/" className="btn">
            繼續逛逛
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
