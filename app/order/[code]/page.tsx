import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderReceipt } from "@/components/OrderReceipt";
import { officialLineHref } from "@/lib/line-link";
import { getStore } from "@/lib/store";
import { canViewOrder } from "@/lib/order-access";
import { PayButton } from "@/components/PayButton";
import { paymentOptions } from "@/lib/newebpay";
import { awaitingCustomer, holdExpired } from "@/lib/payment";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "訂單明細" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string; pay?: string }>;
}) {
  const { code } = await params;
  const { t, pay } = await searchParams;
  const { orders, customers, settings } = await getStore();
  const order = orders.find((o) => o.code === code);
  if (!order) notFound();

  if (!(await canViewOrder(order, customers, t))) notFound();

  const stale = holdExpired(order);
  const waiting = awaitingCustomer(order) && !stale;
  const payReady = waiting && (paymentOptions().card || paymentOptions().cvs);
  const expired = stale || (order.status === "cancelled" && order.paymentMethod !== "line" && !order.paidAt && Boolean(order.holdUntil));

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">{waiting ? "尚未完成" : "謝謝"}</span>
          <h1>{waiting ? (order.paymentMethod === "cod" ? "請選擇取貨門市" : "請完成付款") : expired ? "訂單已逾時取消" : "訂單已送出"}</h1>
        </div>
        {pay === "failed" && (
          <div className="notice error" style={{ marginBottom: 20 }} role="alert">
            付款沒有成功，沒有扣款。您可以再按一次「前往付款」，或改用其他卡片。
          </div>
        )}
        {pay === "check" && (
          <div className="notice error" style={{ marginBottom: 20 }} role="alert">
            付款結果需要人工確認。若您已被扣款，請透過 LINE 聯絡我們並提供訂單編號 {order.code}。
          </div>
        )}
        {pay === "ok" && !waiting && (
          <div className="notice" style={{ marginBottom: 20 }}>
            {order.paymentMethod === "cod" ? "已收到您選擇的取貨門市，商品出貨後會通知您。" : "付款成功，我們會盡快為您出貨。"}
          </div>
        )}
        {waiting && (
          <div className="notice" style={{ marginBottom: 20 }}>
            {order.paymentMethod === "cod"
              ? "訂單已建立，但還沒選擇取貨門市。請在 30 分鐘內完成，逾時訂單會自動取消並釋出庫存。"
              : "訂單已建立，請在 30 分鐘內完成付款，逾時訂單會自動取消並釋出庫存。"}
          </div>
        )}
        {payReady && (
          <PayButton
            code={order.code}
            token={t}
            label={order.paymentMethod === "cod" ? "前往選擇取貨門市" : `前往付款 · ${formatPrice(order.total)}`}
          />
        )}
        {expired && (
          <div className="notice error" style={{ marginBottom: 20 }}>
            這張訂單逾時未完成付款或選擇門市，已自動取消。商品庫存已釋出，歡迎重新下單。
          </div>
        )}
        <OrderReceipt order={order} />
        {order.paymentMethod === "line" && settings.paymentNote && <div className="notice" style={{ marginBottom: 20 }}>{settings.paymentNote}</div>}
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
