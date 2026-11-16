import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductBuy } from "@/components/ProductBuy";
import { PromoBanners } from "@/components/PromoBanner";
import { getCatalogStore } from "@/lib/store";
import { displayDeal, pricingSnapshot, scopedBanner } from "@/lib/promos";
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
  const store = await getCatalogStore();
  const product = store.products.find((p) => p.id === id && p.status === "listed");
  if (!product) notFound();
  const now = Date.now();
  const promos = pricingSnapshot(store.promotions, now);
  const shipping = {
    shippingFee: store.settings.shippingFee,
    cvsShippingFee: store.settings.cvsShippingFee,
    freeShippingThreshold: store.settings.freeShippingThreshold,
  };
  const own = scopedBanner(promos, "product", product.id, now);
  const deal = displayDeal(product, promos, shipping, now);
  const dealPromo = deal ? promos.find((promo) => promo.id === deal.promoId) : undefined;
  const banners = [own, dealPromo && dealPromo.id !== own?.id ? dealPromo : null].filter((promo): promo is NonNullable<typeof promo> => Boolean(promo));

  return (
    <>
      <Header />
      <PromoBanners promos={banners} serverNow={now} />
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
        <ProductBuy product={product} promos={promos} serverNow={now} shipping={shipping} />
      </main>
      <Footer />
    </>
  );
}
