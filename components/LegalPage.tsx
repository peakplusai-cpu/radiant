import Link from "next/link";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="page narrow legal">
        <div className="title-block">
          <span className="eyebrow">Radiant</span>
          <h1>{title}</h1>
        </div>
        <div className="notice" style={{ marginBottom: 28 }}>
          以下內容依本店目前的經營方式撰寫，供店主審閱。正式對外使用前，請依實際運費、退貨地址與聯絡方式修改。本店不在網站上刷卡，訂單由 LINE 確認。
        </div>
        <article className="legal-copy">{children}</article>
        <p style={{ marginTop: 36 }}>
          <Link href="/" className="link">回到商品</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
