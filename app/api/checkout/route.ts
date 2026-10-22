import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";
import { placeOrder, type CartLine } from "@/lib/orders";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "資料格式不正確" }, { status: 400 });

  const { settings } = await getStore();
  const identity = await getLineIdentity();
  const loginRequired = lineLoginEnabled(settings);

  if (loginRequired && !identity) {
    return NextResponse.json({ error: "請先使用 LINE 登入" }, { status: 401 });
  }

  const recipient = text(body.recipient, 60);
  const phone = text(body.phone, 30);
  const address = text(body.address, 200);
  if (!recipient || !phone || !address) {
    return NextResponse.json({ error: "請完整填寫收件人、電話與地址" }, { status: 400 });
  }

  let lineName = identity?.name ?? "";
  let lineId = text(body.lineId, 60).replace(/^@/, "");
  if (!identity) {
    lineName = text(body.lineName, 60);
    if (!lineName || !lineId) {
      return NextResponse.json({ error: "請填寫 LINE 名稱與 LINE ID" }, { status: 400 });
    }
  }

  const rawLines = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  const lines: CartLine[] = rawLines.slice(0, 50).map((l) => ({
    productId: text(l.productId, 60),
    variantId: text(l.variantId, 60),
    qty: Number(l.qty),
  }));

  const result = await placeOrder({
    lines,
    recipient,
    phone,
    address,
    note: text(body.note, 300),
    identity: {
      lineUserId: identity?.userId ?? "",
      lineName,
      lineId,
      verified: Boolean(identity),
    },
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ code: result.order.code, token: result.order.token });
}
