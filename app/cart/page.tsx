import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartView } from "@/components/CartView";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 120;
export const metadata = { title: "購物袋" };

export default async function CartPage() {
  await dynamicWithoutDatabase();
  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">購物袋</span>
          <h1>購物袋</h1>
        </div>
        <CartView />
      </main>
      <Footer />
    </>
  );
}
