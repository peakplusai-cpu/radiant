import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductBuy } from "@/components/ProductBuy";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = (await getStore()).products.find((p) => p.id === id && p.status === "listed");
  return { title: product?.name ?? "商品" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = (await getStore()).products.find((p) => p.id === id && p.status === "listed");
  if (!product) notFound();

  return (
    <>
      <Header />
      <main className="page">
        <nav className="crumbs" aria-label="路徑">
          <Link href="/">商品</Link>
          {product.category && (
            <>
              {" / "}
              <Link href={`/?cat=${encodeURIComponent(product.category)}`}>{product.category}</Link>
            </>
          )}
        </nav>
        <ProductBuy product={product} />
      </main>
      <Footer />
    </>
  );
}
