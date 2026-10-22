import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <nav className="mast-nav" aria-label="主選單">
            <Link href="/">商品</Link>
          </nav>
          <Link href="/" className="wordmark" aria-label="Radiant">
            Radiant
          </Link>
          <div className="mast-tools">
            <Link href="/cart">購物袋</Link>
          </div>
        </div>
      </header>
      <main className="page">
        <div className="empty" style={{ padding: "160px 0" }}>
          <span className="eyebrow">404</span>
          <p>找不到這個頁面。</p>
          <Link href="/" className="btn">
            回到首頁
          </Link>
        </div>
      </main>
    </>
  );
}
