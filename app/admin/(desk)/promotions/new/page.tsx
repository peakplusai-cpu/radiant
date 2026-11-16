import { getAdminStore } from "@/lib/auth";
import { effectiveCategories } from "@/lib/categories";
import { PromotionForm } from "@/components/admin/PromotionForm";

export default async function NewPromotion() {
  const { products } = await getAdminStore();
  const categories = [...new Set(products.flatMap((product) => effectiveCategories(product)))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Promotion</span>
          <h1>新增優惠</h1>
        </div>
      </div>
      <PromotionForm products={products.map((product) => ({ id: product.id, name: product.name }))} categories={categories} />
    </>
  );
}
