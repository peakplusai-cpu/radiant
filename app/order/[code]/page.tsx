import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderReceipt } from "@/components/OrderReceipt";
import { OrderLink } from "@/components/OrderLink";
import { PaymentWait } from "@/components/PaymentWait";
import { officialLineHref } from "@/lib/line-link";
import { readSettledStore } from "@/lib/orders";
import { canViewOrder } from "@/lib/order-access";
import { PayButton } from "@/components/PayButton";
import { paymentOptions } from "@/lib/newebpay";
import { DEFAULT_PAYMENT_NOTE, LEGACY_PAYMENT_NOTE } from "@/lib/business";
import { awaitingCustomer, holdExpired, onlineEnabled } from "@/lib/payment";
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
  const { orders, customers, settings } = await readSettledStore();
  const order = orders.find((o) => o.code === code);
  if (!order) notFound();

  if (!(await canViewOrder(order, customers, t))) notFound();

  const options = paymentOptions();
  const stale = holdExpired(order);
  const waiting = awaitingCustomer(order) && !stale;
  const voucher = waiting && Boolean(order.payCodeNo);
  const payReady = waiting && !voucher && (onlineEnabled(options) || options.cvs);
  const expired = stale || (order.status === "cancelled" && order.paymentMethod !== "line" && !order.paidAt && Boolean(order.holdUntil));
  const returned = pay === "returned" || pay === "ok" || pay === "number";
  const headline = expired
    ? "訂單已逾時取消"
    : voucher
      ? "請完成繳費"
      : waiting
        ? order.paymentMethod === "cod"
          ? "請選擇取貨門市"
          : "請完成付款"
        : "訂單已送出";

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">{waiting ? "尚未完成" : "謝謝"}</span>
          <h1>{headline}</h1>
        </div>
        {returned && waiting && <PaymentWait />}
        {pay === "failed" && waiting && (
          <div className="notice error" style={{ marginBottom: 20 }} role="alert">
            付款沒有成功，沒有扣款。您可以再按一次「前往付款」。訂單是否入帳以付款通知為準。
          </div>
        )}
        {pay === "check" && (
          <div className="notice error" style={{ marginBottom: 20 }} role="alert">
            付款結果需要人工確認。若您已被扣款，請透過 LINE 聯絡我們並提供訂單編號 {order.code}。
          </div>
        )}
        {returned && waiting && (
          <div className="notice" style={{ marginBottom: 20 }}>
            已從藍新金流返回。訂單是否入帳或取得繳費代碼，以付款通知為準，請稍候，此頁會自動更新。請勿重複付款。
          </div>
        )}
        {!waiting && order.paidAt && order.paymentMethod === "online" && (
          <div className="notice" style={{ marginBottom: 20 }}>付款成功，我們會盡快為您出貨。</div>
        )}
        {!waiting && order.paymentMethod === "cod" && order.cvs?.storeName && (
          <div className="notice" style={{ marginBottom: 20 }}>已收到您選擇的取貨門市，商品出貨後會通知您。</div>
        )}
        {voucher && (
          <div className="notice" style={{ marginBottom: 20 }}>
            請於 {order.payExpire || "期限內"} 23:59 前完成繳費。逾期訂單會取消並釋出庫存。
          </div>
        )}
        {waiting && !voucher && (
          <div className="notice" style={{ marginBottom: 20 }}>
            {order.paymentMethod === "cod"
              ? "訂單已建立，但還沒選擇取貨門市。請在 30 分鐘內完成，逾時訂單會自動取消並釋出庫存。"
              : "訂單已建立，請在 30 分鐘內完成付款，逾時訂單會自動取消並釋出庫存。"}
          </div>
        )}
        {payReady && (
          <PayButton
            code={order.code}
            token={t || order.token}
            label={order.paymentMethod === "cod" ? "前往選擇取貨門市" : `前往付款 · ${formatPrice(order.total)}`}
          />
        )}
        {expired && (
          <div className="notice error" style={{ marginBottom: 20 }}>
            這張訂單逾時未完成付款或選擇門市，已自動取消。商品庫存已釋出，歡迎重新下單。
          </div>
        )}
        <OrderLink code={order.code} token={order.token} />
        <OrderReceipt order={order} />
        {order.paymentMethod === "line" && settings.paymentNote && settings.paymentNote !== LEGACY_PAYMENT_NOTE && settings.paymentNote !== DEFAULT_PAYMENT_NOTE && (
          <div className="notice" style={{ marginBottom: 20 }}>{settings.paymentNote}</div>
        )}
        {officialLineHref(settings) && (
          <div className="notice" style={{ marginBottom: 20 }}>
            請加入{settings.lineOaName ? `「${settings.lineOaName}」` : "我們的 LINE 官方帳號"}，以便收到訂單通知。{" "}
            <a href={officialLineHref(settings)} target="_blank" rel="noreferrer" className="link">
              加入好友
            </a>
          </div>
        )}
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          換了裝置也可以到 <Link href="/orders" className="link">我的訂單</Link>，用訂單編號、手機與 Email 查詢。
        </p>
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
