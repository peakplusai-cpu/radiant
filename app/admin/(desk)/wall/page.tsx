import { getStore } from "@/lib/store";
import { WallForm } from "@/components/admin/WallForm";

export default async function WallAdminPage() {
  const { wallPhotos, products } = await getStore();
  const options = [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Gallery</span>
          <h1>動態牆</h1>
        </div>
      </div>
      <WallForm photos={wallPhotos} products={options} />
    </>
  );
}
