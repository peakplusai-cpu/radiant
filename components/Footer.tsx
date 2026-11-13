import Link from "next/link";
import { getCatalogStore } from "@/lib/store";
import { officialLineHref } from "@/lib/line-link";
import { LineButton } from "./LineButton";

export async function Footer() {
  const { settings } = await getCatalogStore();
  const lineHref = officialLineHref(settings);
  const oaLabel = settings.lineOaName || "LINE 官方帳號";
  return (
    <>
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <div className="brand-logo footer-logo" aria-hidden="true">
            <img src="/logo-mark.png" alt="" width={56} height={56} />
          </div>
          {settings.tagline && <p>{settings.tagline}</p>}
        </div>
        <div>
          <h4>服務</h4>
          <ul>
            <li>
              <Link href="/orders">我的訂單</Link>
            </li>
            <li>
              <Link href="/cart">購物袋</Link>
            </li>
            <li>
              <Link href="/returns">退換貨政策</Link>
            </li>
            <li>
              <Link href="/privacy">隱私權政策</Link>
            </li>
            <li>
              <Link href="/terms">服務條款</Link>
            </li>
            {settings.freeShippingThreshold > 0 && (
              <li>單筆滿 NT$ {settings.freeShippingThreshold.toLocaleString("en-US")} 免運</li>
            )}
          </ul>
        </div>
        <div>
          <h4>LINE</h4>
          <ul>
            <li>
              {lineHref ? <LineButton href={lineHref} /> : oaLabel}
            </li>
            {settings.lineOaBasicId && <li>{settings.lineOaBasicId}</li>}
          </ul>
        </div>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} {settings.shopName}</span>
      </div>
    </footer>
      <LineButton href={lineHref} floating />
    </>
  );
}
