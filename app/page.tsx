import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PhotoWall } from "@/components/PhotoWall";
import { Catalog } from "@/components/Catalog";
import { PromoBanners } from "@/components/PromoBanner";
import { getCatalogStore } from "@/lib/store";
import { pricingSnapshot, siteBanners } from "@/lib/promos";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 120;

export default async function HomePage() {
  await dynamicWithoutDatabase();
  const store = await getCatalogStore();
  const { products, wallPhotos, settings } = store;
  const now = Date.now();
  const promos = pricingSnapshot(store.promotions, now);
  const listed = products.filter((product) => product.status === "listed");
  const shipping = {
    shippingFee: settings.shippingFee,
    cvsShippingFee: settings.cvsShippingFee,
    freeShippingThreshold: settings.freeShippingThreshold,
  };

  return (
    <>
      <Header />
      <PromoBanners promos={siteBanners(promos, now)} serverNow={now} />
      <PhotoWall photos={wallPhotos} products={products} />
      <Suspense fallback={<main className="page"><div className="empty">載入商品…</div></main>}>
        <Catalog products={listed} flush={wallPhotos.length > 0} promos={promos} serverNow={now} shipping={shipping} />
      </Suspense>
      <Footer />
    </>
  );
}
