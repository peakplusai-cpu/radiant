import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 3600;
export const metadata: Metadata = { title: "服務條款" };

export default async function TermsPage() {
  await dynamicWithoutDatabase();
  return (
    <LegalPage title="服務條款">
      <p>在 Radiant 送出訂單，表示您同意以下方式購買。若與商品頁或結帳頁的當次顯示不同，以結帳當下畫面與後續 LINE 確認為準。</p>
      <h2>商品與價格</h2>
      <p>售價、顏色、尺寸與庫存以結帳當下伺服器計算的結果為準。畫面上的金額只供預覽，我們不會採用您瀏覽器自行計算或自行修改的價格。庫存不足時，訂單不會成立。</p>
      <h2>如何成立訂單</h2>
      <p>本店沒有在網站上刷卡。送出訂單後狀態為「待確認」。我們會透過 LINE 與您確認品項、付款方式與出貨。在我們於 LINE 確認前，您可以請我們取消。已售完的尺寸無法改為其他尺寸，除非該尺寸仍有庫存。</p>
      <h2>運費與自取</h2>
      <p>新店預設宅配運費為新台幣 70 元，同一筆訂單商品金額滿 2,000 元免運，自取不另收運費。若後台設定不同，結帳頁顯示的運費才是這筆訂單的運費。請店主確認這段數字與後台「運費／免運門檻」一致。</p>
      <h2>帳號</h2>
      <p>啟用 LINE 登入後，結帳與查詢訂單都需要登入。我們以 LINE 的使用者識別碼辨識訂單，不接受顧客自行填寫的 LINE ID 當作已驗證身分。尚未啟用 LINE 登入時，可以只填收件資料下單，該筆訂單會標示為未驗證。</p>
      <h2>責任範圍</h2>
      <p>商品顏色會因螢幕而有差異。尺寸請以商品頁的尺寸選項為準，不要只寫在備註。若頁面暫時無法送出，請稍後再試，不要重複連按，以免建立兩筆訂單；同一組結帳編號只會成立一筆。</p>
    </LegalPage>
  );
}
