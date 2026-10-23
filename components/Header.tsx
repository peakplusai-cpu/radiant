import Link from "next/link";
import { getStore } from "@/lib/store";
import { CartBadge } from "./CartBadge";

export async function Header() {
  const { settings } = await getStore();
  return (
    <>
      {settings.announcement && <div className="announce">{settings.announcement}</div>}
      <header className="masthead">
        <div className="masthead-inner">
          <nav className="mast-nav" aria-label="主選單">
            <Link href="/" className="hide-sm">商品</Link>
            <Link href="/orders">我的訂單</Link>
          </nav>
          <Link href="/" className="wordmark" aria-label={settings.shopName}>
            <img src="/logo-mark.png" alt="" className="wordmark-mark" width={36} height={36} />
            <span>{settings.shopName}</span>
          </Link>
          <div className="mast-tools">
            <Link href="/cart">
              購物袋
              <CartBadge />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
