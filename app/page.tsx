import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PhotoWall } from "@/components/PhotoWall";
import { Catalog } from "@/components/Catalog";
import { getCatalogStore } from "@/lib/store";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 120;

export default async function HomePage() {
  await dynamicWithoutDatabase();
  const { products, wallPhotos } = await getCatalogStore();
  const listed = products.filter((product) => product.status === "listed");

  return (
    <>
      <Header />
      <PhotoWall photos={wallPhotos} products={products} />
      <Suspense fallback={<main className="page"><div className="empty">載入商品…</div></main>}>
        <Catalog products={listed} flush={wallPhotos.length > 0} />
      </Suspense>
      <Footer />
    </>
  );
}
