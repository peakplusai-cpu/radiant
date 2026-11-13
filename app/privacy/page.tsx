import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 3600;
export const metadata: Metadata = { title: "隱私權政策" };

export default async function PrivacyPage() {
  await dynamicWithoutDatabase();
  return (
    <LegalPage title="隱私權政策">
      <p>Radiant（以下稱本店）販售服飾，並以 LINE 與您確認訂單。本頁說明我們向您收集哪些資料、用來做什麼，以及您可以如何詢問。</p>
      <h2>我們收集的資料</h2>
      <ul>
        <li>結帳時您填寫的收件人姓名、電話、地址或自取地點，以及訂單備註。</li>
        <li>若您使用 LINE 登入：LINE 提供的使用者識別碼與顯示名稱。我們不用它登入其他服務。</li>
        <li>訂單內容：商品、顏色、尺寸、數量、金額與訂單狀態。</li>
        <li>員工後台的登入紀錄只用於防止密碼被重複嘗試，不會公開。</li>
      </ul>
      <h2>使用目的</h2>
      <p>這些資料只用來成立訂單、備貨、出貨或通知自取、處理退換貨，以及在 LINE 回覆您。我們不會把名單出售，也不會用它寄送與訂單無關的廣告，除非您已加入官方帳號並依 LINE 的規則收到訊息。</p>
      <h2>保存方式與期間</h2>
      <p>訂單存在本店的資料庫（Supabase，伺服器位於供應商機房）。完成或取消後，我們會保留交易紀錄一段合理期間，以便對帳、處理客訴與依法留存。您可以透過官方 LINE 要求查詢或更正您的收件資料。</p>
      <h2>委託處理</h2>
      <p>網站代管使用 Vercel，資料庫使用 Supabase，訊息使用 LINE。這些廠商只在提供服務所需範圍內處理資料。員工後台密碼與金鑰不會出現在瀏覽器可以看到的程式裡。</p>
      <h2>聯絡</h2>
      <p>隱私相關問題請由網站上的官方 LINE 與我們聯絡，並註明訂單編號。</p>
    </LegalPage>
  );
}
