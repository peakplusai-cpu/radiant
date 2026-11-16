import { NextResponse } from "next/server";
import { expireUnpaidOrders } from "@/lib/orders";
import { safeEqual } from "@/lib/session-token";
import { revalidatePath } from "next/cache";

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("not found", { status: 404 });
  const cancelled = await expireUnpaidOrders();
  if (cancelled > 0) revalidatePath("/", "layout");
  return NextResponse.json({ cancelled });
}
