import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProduct() {
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
