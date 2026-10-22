import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartView } from "@/components/CartView";

export const metadata = { title: "購物袋" };

export default function CartPage() {
  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="title-block">
          <span className="eyebrow">Shopping bag</span>
          <h1>
            Your bag<span className="zh">購物袋</span>
          </h1>
        </div>
        <CartView />
      </main>
      <Footer />
    </>
  );
}
