import { requireAdmin } from "@/lib/auth";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function NewProduct() {
  await requireAdmin();
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">New</span>
          <h1>新增商品</h1>
        </div>
      </div>
      <ProductForm />
    </>
  );
}
