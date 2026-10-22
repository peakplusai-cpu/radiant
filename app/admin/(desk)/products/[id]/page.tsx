import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = (await getStore()).products.find((p) => p.id === id);
  if (!product) notFound();
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Edit</span>
          <h1>編輯商品</h1>
        </div>
        {product.status === "listed" && (
          <Link href={`/p/${product.id}`} target="_blank" className="link">
            查看前台頁面 ↗
          </Link>
        )}
      </div>
      <ProductForm product={product} />
    </>
  );
}
