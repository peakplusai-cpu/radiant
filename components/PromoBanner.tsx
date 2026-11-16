"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { promoBadge, promoStatus } from "@/lib/promos";
import { claimPromo, hasClaim, refreshClaims, subscribeClaims } from "@/lib/promo-client";
import type { Promotion } from "@/lib/types";
import { useServerNow } from "./useServerNow";

function remainLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
  return days > 0 ? `${days} 天 ${clock}` : clock;
}

function useClaimed(promoId: string): boolean {
  return useSyncExternalStore(subscribeClaims, () => hasClaim(promoId), () => false);
}

export function PromoBanner({ promo, serverNow }: { promo: Promotion; serverNow: number }) {
  const now = useServerNow(serverNow);
  const status = promoStatus(promo, now);
  const claimed = useClaimed(promo.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshClaims();
  }, []);

  if (status === "disabled") return null;
  const target = status === "upcoming" ? Date.parse(promo.startsAt) : Date.parse(promo.endsAt);
  const left = target - now;
  const ended = status === "ended" || (left <= 0 && status !== "upcoming");
  const usageLeft = promo.usageLimit > 0 ? Math.max(0, promo.usageLimit - promo.used) : null;
  const text = promo.banner || promo.name;

  async function claim() {
    if (busy || claimed) return;
    setBusy(true);
    setError("");
    const message = await claimPromo(promo.id);
    setError(message);
    setBusy(false);
  }

  return (
    <section className={`promo-banner${status === "upcoming" ? " upcoming" : ""}${ended ? " ended" : ""}`} data-promo-id={promo.id} aria-label={promo.name}>
      <div className="promo-copy">
        <strong>{ended ? "此活動已結束" : text}</strong>
        <span className="promo-meta">
          <span className="deal-badge">{promoBadge(promo)}</span>
          {promo.requiresClaim ? "需領取" : "自動套用"}
          {usageLeft !== null && <span>剩餘 {usageLeft} 組</span>}
        </span>
      </div>
      {!ended && (
        <div className="promo-count" role="timer" aria-live="off" aria-label={status === "upcoming" ? "距離開始" : "距離結束"}>
          <small>{status === "upcoming" ? "距離開始" : "距離結束"}</small>
          <b>{remainLabel(left)}</b>
        </div>
      )}
      {!ended && (
        <button type="button" className="promo-claim" onClick={() => void claim()} disabled={busy || claimed || usageLeft === 0}>
          {claimed ? "已領取" : busy ? "領取中…" : usageLeft === 0 ? "已額滿" : "領取折扣"}
        </button>
      )}
      {error && <span className="promo-error">{error}</span>}
    </section>
  );
}

export function PromoBanners({ promos, serverNow }: { promos: Promotion[]; serverNow: number }) {
  if (!promos.length) return null;
  return (
    <div className="promo-stack">
      {promos.map((promo) => (
        <PromoBanner key={promo.id} promo={promo} serverNow={serverNow} />
      ))}
    </div>
  );
}
