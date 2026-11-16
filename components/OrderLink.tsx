"use client";

import { useEffect, useState } from "react";

/** The unguessable link for this browser. Built on the client so the host matches the shopper. */
export function OrderLink({ code, token }: { code: string; token: string }) {
  const path = `/order/${code}?t=${encodeURIComponent(token)}`;
  const [href, setHref] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHref(`${window.location.origin}${path}`);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="notice" style={{ marginBottom: 20 }}>
      <p style={{ marginTop: 0 }}>請保存這組訂單連結。連結無法被猜到，請不要貼到公開的地方。</p>
      <p className="mono" style={{ wordBreak: "break-all", marginBottom: 12 }}>{href}</p>
      <button type="button" className="btn" onClick={copy}>{copied ? "已複製" : "複製連結"}</button>
    </div>
  );
}
