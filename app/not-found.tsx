import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="page">
        <div className="empty" style={{ padding: "160px 0" }}>
          <span className="eyebrow">404</span>
          <p>找不到這個頁面。</p>
          <Link href="/" className="btn">
            回到首頁
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
