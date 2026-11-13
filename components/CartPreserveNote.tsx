"use client";

import { useEffect, useState } from "react";
import { cartCount, onCartChange } from "@/lib/cart-client";

export function CartPreserveNote() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(cartCount());
    update();
    return onCartChange(update);
  }, []);
  if (count < 1) return null;
  return <p>目前購物袋有 {count} 件商品，登入後會一併帶入結帳。</p>;
}
