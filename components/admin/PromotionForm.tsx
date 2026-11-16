"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { savePromotion } from "@/app/actions/admin";
import { formatPrice } from "@/lib/format";
import {
  PROMO_STATUS_LABEL,
  foldLabel,
  isoToTaipeiInput,
  promoBadge,
  promoStatus,
  quotePromos,
  sanitizePromotion,
  taipeiInputToIso,
} from "@/lib/promos";
import type { Promotion } from "@/lib/types";

type Props = {
  promo?: Promotion | null;
  products: { id: string; name: string }[];
  categories: string[];
  claims?: number;
};

function taipeiHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000 + 8 * 3600_000).toISOString().slice(0, 16);
}

export function PromotionForm({ promo, products, categories, claims = 0 }: Props) {
  const [message, action, pending] = useActionState(savePromotion, "");
  const [name, setName] = useState(promo?.name ?? "");
  const [banner, setBanner] = useState(promo?.banner ?? "");
  const [enabled, setEnabled] = useState(promo?.enabled ?? true);
  const [scope, setScope] = useState(promo?.scope ?? "site");
  const [productId, setProductId] = useState(promo?.productId || products[0]?.id || "");
  const [category, setCategory] = useState(promo?.category ?? "");
  const [kind, setKind] = useState(promo?.kind ?? "percent");
  const [value, setValue] = useState(promo ? String(promo.value) : "20");
  const [minSpend, setMinSpend] = useState(promo ? String(promo.minSpend || "") : "");
  const [maxDiscount, setMaxDiscount] = useState(promo ? String(promo.maxDiscount || "") : "");
  const [freeShipping, setFreeShipping] = useState(promo?.freeShipping ?? false);
  const [startsAt, setStartsAt] = useState(promo ? isoToTaipeiInput(promo.startsAt) : taipeiHoursFromNow(-1));
  const [endsAt, setEndsAt] = useState(promo ? isoToTaipeiInput(promo.endsAt) : taipeiHoursFromNow(48));
  const [usageLimit, setUsageLimit] = useState(promo?.usageLimit ? String(promo.usageLimit) : "");
  const [perCustomer, setPerCustomer] = useState(promo?.perCustomer ? String(promo.perCustomer) : "1");
  const [requiresClaim, setRequiresClaim] = useState(promo?.requiresClaim ?? false);
  const [couponCode, setCouponCode] = useState(promo?.couponCode ?? "");
  const [stacking, setStacking] = useState(promo?.stacking ?? "best");
  const [priority, setPriority] = useState(promo ? String(promo.priority) : "0");

  const preview = useMemo(() => {
    const startIso = taipeiInputToIso(startsAt);
    const endIso = taipeiInputToIso(endsAt);
    if (!startIso || !endIso) return { error: "請填開始與結束時間" };
    const parsed = sanitizePromotion(
      {
        name: name || "預覽活動",
        banner,
        enabled,
        scope,
        productId,
        category,
        kind,
        value: Number(value),
        minSpend: Number(minSpend || 0),
        maxDiscount: Number(maxDiscount || 0),
        freeShipping,
        startsAt: startIso,
        endsAt: endIso,
        usageLimit: Number(usageLimit || 0),
        perCustomer: Number(perCustomer || 0),
        requiresClaim,
        couponCode,
        stacking,
        priority: Number(priority || 0),
      },
      { id: promo?.id || "preview", used: promo?.used ?? 0, createdAt: promo?.createdAt || startIso }
    );
    if (!parsed.ok) return { error: parsed.error };
    const draft = { ...parsed.promo, id: parsed.promo.id || "preview" };
    const status = promoStatus(draft, Date.now());
    const sample = quotePromos({
      now: Date.now(),
      lines: [{ productId: draft.productId || "sample", qty: 1, unitPrice: 1000, categories: [draft.category || "上衣"] }],
      fulfillment: "delivery",
      settings: { shippingFee: 70, freeShippingThreshold: 2000, cvsShippingFee: 65 },
      promotions: [draft],
      claimedIds: new Set(draft.requiresClaim ? [draft.id] : []),
      coupon: draft.couponCode,
    });
    return { draft, status, sample };
  }, [name, banner, enabled, scope, productId, category, kind, value, minSpend, maxDiscount, freeShipping, startsAt, endsAt, usageLimit, perCustomer, requiresClaim, couponCode, stacking, priority, promo]);

  return (
    <div className="form-grid">
      <form action={action}>
        {promo && <input type="hidden" name="id" value={promo.id} />}
        <section className="panel">
          <h2>活動內容</h2>
          <label className="field">
            <span className="label">活動名稱</span>
            <input className="input" name="name" required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">橫幅文字</span>
            <input className="input" name="banner" maxLength={80} value={banner} onChange={(event) => setBanner(event.target.value)} placeholder="例如：全館 8 折，倒數 48 小時" />
            <span className="hint">顯示在首頁、商品頁或分類頁頂端。留空則改顯示名稱。</span>
          </label>
          <label className="toggle">
            <input type="checkbox" name="enabled" value="1" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>{enabled ? "啟用中，前台可套用" : "已停用，前台不會套用"}</span>
          </label>
        </section>

        <section className="panel">
          <h2>範圍與折扣</h2>
          <div className="two">
            <label className="field">
              <span className="label">範圍</span>
              <select className="select" name="scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
                <option value="site">全站</option>
                <option value="product">單一商品</option>
                <option value="category">分類</option>
              </select>
            </label>
            <label className="field">
              <span className="label">類型</span>
              <select className="select" name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="percent">百分比（20 = 八折）</option>
                <option value="amount">固定金額折抵</option>
                <option value="threshold">滿額折（滿一次）</option>
              </select>
            </label>
          </div>
          {scope === "product" && (
            <label className="field">
              <span className="label">商品</span>
              <select className="select" name="productId" value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
          )}
          {scope === "category" && (
            <label className="field">
              <span className="label">分類</span>
              <input className="input" name="category" list="promo-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="上衣" />
              <datalist id="promo-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <span className="hint">需與商品分類相同。名稱含「上衣」的商品也會出現在上衣分類。</span>
            </label>
          )}
          <div className="two">
            <label className="field">
              <span className="label">{kind === "percent" ? "折掉百分比" : "折抵金額"}</span>
              <input className="input" name="value" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
              <span className="hint">{kind === "percent" ? "20 表示商品金額打八折，並四捨五入到整數元。" : "滿額折是達到門檻折一次，不是每滿再折。"}</span>
            </label>
            <label className="field">
              <span className="label">{kind === "threshold" ? "滿額門檻" : "最低消費"}</span>
              <input className="input" name="minSpend" inputMode="numeric" value={minSpend} onChange={(event) => setMinSpend(event.target.value)} placeholder={kind === "threshold" ? "1000" : "空白表示不限"} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              <span className="label">折扣上限</span>
              <input className="input" name="maxDiscount" inputMode="numeric" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} placeholder="空白表示不設上限" />
            </label>
            <label className="field">
              <span className="label">優先序</span>
              <input className="input" name="priority" inputMode="numeric" value={priority} onChange={(event) => setPriority(event.target.value)} />
              <span className="hint">數字大的優先顯示橫幅。結帳仍會自動選對顧客最划算的一檔。</span>
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" name="freeShipping" value="1" checked={freeShipping} onChange={(event) => setFreeShipping(event.target.checked)} />
            <span>達標後免運（可與折扣併用）</span>
          </label>
        </section>

        <section className="panel">
          <h2>時間、次數與領取</h2>
          <div className="two">
            <label className="field">
              <span className="label">開始（台北時間）</span>
              <input className="input" type="datetime-local" name="startsAt" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">結束（台北時間）</span>
              <input className="input" type="datetime-local" name="endsAt" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              <span className="label">總使用次數</span>
              <input className="input" name="usageLimit" inputMode="numeric" value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} placeholder="空白表示不限" />
            </label>
            <label className="field">
              <span className="label">每位顧客上限</span>
              <input className="input" name="perCustomer" inputMode="numeric" value={perCustomer} onChange={(event) => setPerCustomer(event.target.value)} placeholder="空白表示不限" />
              <span className="hint">以手機、Email 或 LINE 帳號任一相同計算。取消或逾時未付款會把次數加回。</span>
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" name="requiresClaim" value="1" checked={requiresClaim} onChange={(event) => setRequiresClaim(event.target.checked)} />
            <span>需先按「領取折扣」才套用（不勾選則結帳自動套用）</span>
          </label>
          <label className="field">
            <span className="label">優惠代碼（選填）</span>
            <input className="input" name="couponCode" maxLength={20} value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="例如 SUMMER20" autoCapitalize="characters" />
            <span className="hint">有填代碼時，顧客必須輸入才會套用。嘗試次數有限制。</span>
          </label>
          <label className="field">
            <span className="label">累加規則</span>
            <select className="select" name="stacking" value={stacking} onChange={(event) => setStacking(event.target.value as typeof stacking)}>
              <option value="best">取最優惠的一檔，不累加（預設）</option>
              <option value="stack">可與其他「可累加」活動併用</option>
            </select>
            <span className="hint">預設只留對顧客最划算的一檔。可累加的活動彼此相加，但不會再疊加「不累加」的活動；若單檔更划算，仍用單檔。</span>
          </label>
          {message && <div className="notice error" style={{ marginBottom: 16 }} role="alert">{message}</div>}
          <button className="btn solid" disabled={pending}>{pending ? "儲存中…" : "儲存活動"}</button>
        </section>
      </form>

      <aside className="panel">
        <h2>預覽</h2>
        {"error" in preview && preview.error ? (
          <p style={{ color: "var(--alert)" }}>{preview.error}</p>
        ) : "status" in preview && preview.status ? (
          <>
            <p><span className={`badge${preview.status === "active" ? " on" : preview.status === "disabled" ? " warn" : preview.status === "ended" ? " mute" : ""}`}>{PROMO_STATUS_LABEL[preview.status]}</span></p>
            <p style={{ fontFamily: "var(--serif-tc)", fontSize: 20 }}>{banner || name || "（橫幅文字）"}</p>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>{preview.draft ? promoBadge(preview.draft) : ""}{kind === "percent" && Number(value) > 0 ? ` · ${foldLabel(Number(value))}` : ""}</p>
            <dl className="kv">
              <dt>範例消費</dt>
              <dd>{formatPrice(1000)}</dd>
              <dt>折抵</dt>
              <dd>{preview.sample && preview.sample.discount > 0 ? `-${formatPrice(preview.sample.discount)}` : "—"}</dd>
              <dt>運費</dt>
              <dd>{preview.sample ? (preview.sample.shipping === 0 ? "免運" : formatPrice(preview.sample.shipping)) : "—"}</dd>
              <dt>應付</dt>
              <dd>{preview.sample ? formatPrice(preview.sample.total) : "—"}</dd>
              {preview.sample && preview.sample.hints[0] && (
                <>
                  <dt>未達門檻</dt>
                  <dd>{preview.sample.hints[0].text}</dd>
                </>
              )}
            </dl>
            <p className="hint">範例以宅配、商品金額 {formatPrice(1000)}、運費 {formatPrice(70)}、滿 {formatPrice(2000)} 免運試算。實際金額以結帳當下的伺服器計算為準。{requiresClaim ? "此活動需領取後才會套用，預覽已假設已領取。" : "此活動會自動套用。"}</p>
          </>
        ) : null}
        {promo && (
          <dl className="kv" style={{ marginTop: 18 }}>
            <dt>已使用</dt>
            <dd>{promo.used}{promo.usageLimit > 0 ? ` / ${promo.usageLimit}` : "（不限）"}</dd>
            <dt>已領取</dt>
            <dd>{claims}</dd>
          </dl>
        )}
      </aside>
    </div>
  );
}
