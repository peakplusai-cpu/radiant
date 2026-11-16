"use client";

import { useEffect, useRef, useState } from "react";

/** Counts with the server clock, so a fast or slow device clock cannot stretch a sale. */
export function useServerNow(serverNow: number): number {
  const offset = useRef(serverNow - Date.now());
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    let stop = false;
    fetch("/api/promos/clock", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { now?: number }) => {
        if (stop || typeof data.now !== "number") return;
        offset.current = data.now - Date.now();
        setNow(data.now);
      })
      .catch(() => undefined);
    const id = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  return now;
}
