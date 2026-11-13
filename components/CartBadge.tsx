"use client";

import { useEffect, useState } from "react";
import { cartCount, onCartChange } from "@/lib/cart-client";

export function CartBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(cartCount());
    update();
    return onCartChange(update);
  }, []);
  return <span className="bag-count">{count > 0 ? `(${count})` : ""}</span>;
}
