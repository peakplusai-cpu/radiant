"use client";

import { useEffect, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart-client";

export function CartBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(readCart().reduce((s, i) => s + i.q, 0));
    update();
    return onCartChange(update);
  }, []);
  return <span className="bag-count">{count > 0 ? `(${count})` : ""}</span>;
}
