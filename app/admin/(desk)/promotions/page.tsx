import Link from "next/link";
import { setPromotionEnabled } from "@/app/actions/admin";
import { getAdminStore } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PROMO_STATUS_LABEL, promoStatus, promoSummary } from "@/lib/promos";

export default async function PromotionsAdmin({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { promotions, promoClaims } = await getAdminStore();
  const now = Date.now();
  const list = [...promotions].sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Promotions</span>
          <h1>優惠活動</h1>
        </div>
        <Link href="/admin/promotions/new" className="btn solid">新增活動</Link>
      </div>
      {saved && <div className="notice" style={{ marginBottom: 24 }}>活動已儲存。前台會在快取更新後顯示，通常幾秒內。</div>}
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        折扣由伺服器計算，結帳與藍新金流使用同一個金額。預設只套用最划算的一檔。時間以台北時間為準。
      </p>
      {list.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>活動</th>
              <th>內容</th>
              <th>期間</th>
              <th>狀態</th>
              <th className="right">已使用</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((promo) => {
              const status = promoStatus(promo, now);
              const claims = promoClaims.filter((claim) => claim.promoId === promo.id).length;
              return (
                <tr key={promo.id}>
                  <td>
                    <Link href={`/admin/promotions/${promo.id}`} className="link">{promo.name}</Link>
                    {promo.couponCode && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>代碼 {promo.couponCode}</div>}
                    {promo.requiresClaim && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>需領取{claims ? ` · 已領 ${claims}` : ""}</div>}
                  </td>
                  <td>{promoSummary(promo)}</td>
                  <td style={{ fontSize: 13 }}>
                    {formatDate(promo.startsAt)}
                    <br />
                    {formatDate(promo.endsAt)}
                  </td>
                  <td>
                    <span className={`badge${status === "active" ? " on" : status === "disabled" ? " warn" : status === "ended" ? " mute" : ""}`}>
                      {PROMO_STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="num right">{promo.used}{promo.usageLimit > 0 ? ` / ${promo.usageLimit}` : ""}</td>
                  <td className="right">
                    <form action={setPromotionEnabled}>
                      <input type="hidden" name="id" value={promo.id} />
                      <input type="hidden" name="enabled" value={promo.enabled ? "0" : "1"} />
                      <button type="submit" className="link" style={{ background: "none", border: 0, cursor: "pointer" }}>
                        {promo.enabled ? "停用" : "啟用"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <span className="eyebrow">還沒有活動</span>
          <p>新增全站、分類或單一商品的折扣，前台會顯示橫幅與倒數。</p>
        </div>
      )}
    </>
  );
}
