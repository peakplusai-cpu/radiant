import { notFound } from "next/navigation";
import { getAdminStore } from "@/lib/auth";
import { effectiveCategories } from "@/lib/categories";
import { PromotionForm } from "@/components/admin/PromotionForm";

export default async function EditPromotion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getAdminStore();
  const promo = store.promotions.find((item) => item.id === id);
  if (!promo) notFound();
  const categories = [...new Set(store.products.flatMap((product) => effectiveCategories(product)))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const claims = store.promoClaims.filter((claim) => claim.promoId === promo.id).length;
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Promotion</span>
          <h1>{promo.name}</h1>
        </div>
      </div>
      <PromotionForm
        promo={promo}
        products={store.products.map((product) => ({ id: product.id, name: product.name }))}
        categories={categories}
        claims={claims}
      />
    </>
  );
}
