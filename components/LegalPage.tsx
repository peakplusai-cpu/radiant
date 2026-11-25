import Link from "next/link";
import type { Settings } from "@/lib/types";
import { BusinessInfo } from "./BusinessInfo";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function LegalPage({ title, settings, children }: { title: string; settings: Settings; children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="page narrow legal">
        <div className="title-block">
          <span className="eyebrow">Radiant</span>
          <h1>{title}</h1>
        </div>
        <article className="legal-copy">
          {children}
          <BusinessInfo settings={settings} />
        </article>
        <p style={{ marginTop: 36 }}>
          <Link href="/" className="link">回到商品</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
