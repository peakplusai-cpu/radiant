import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductBuy } from "@/components/ProductBuy";
import { getCatalogStore } from "@/lib/store";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 120;

export async function generateStaticParams() {
  const { products } = await getCatalogStore();
  return products.filter((product) => product.status === "listed").map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await dynamicWithoutDatabase();
  const { id } = await params;
  const product = (await getCatalogStore()).products.find((p) => p.id === id && p.status === "listed");
  return { title: product?.name ?? "商品" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await dynamicWithoutDatabase();
  const { id } = await params;
  const product = (await getCatalogStore()).products.find((p) => p.id === id && p.status === "listed");
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
