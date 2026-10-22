import Link from "next/link";
import { getStore } from "@/lib/store";

export async function Footer() {
  const { settings } = await getStore();
  const oaLabel = settings.lineOaName || "LINE 官方帳號";
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <div className="wordmark">{settings.shopName}</div>
          {settings.tagline && <p>{settings.tagline}</p>}
        </div>
        <div>
          <h4>Service</h4>
          <ul>
            <li>
              <Link href="/orders">我的訂單</Link>
            </li>
            <li>
              <Link href="/cart">購物袋</Link>
            </li>
            {settings.freeShippingThreshold > 0 && (
              <li>單筆滿 NT$ {settings.freeShippingThreshold.toLocaleString("en-US")} 免運</li>
            )}
          </ul>
        </div>
        <div>
          <h4>LINE</h4>
          <ul>
            {settings.lineOaUrl ? (
              <li>
                <a href={settings.lineOaUrl} target="_blank" rel="noreferrer" className="link">
                  加入 {oaLabel}
                </a>
              </li>
            ) : (
              <li>{oaLabel}</li>
            )}
            {settings.lineOaBasicId && <li>{settings.lineOaBasicId}</li>}
          </ul>
        </div>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} {settings.shopName}</span>
        <Link href="/admin" className="staff-entry">
          員工專用入口
        </Link>
      </div>
    </footer>
  );
}
