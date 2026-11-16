"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Reloads a few times so a notify that lands just after the browser return can update the page. */
export function PaymentWait() {
  const router = useRouter();
  const [left, setLeft] = useState(4);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => {
      router.refresh();
      setLeft((count) => count - 1);
    }, 3000);
    return () => clearTimeout(id);
  }, [left, router]);

  return null;
}
