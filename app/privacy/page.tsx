import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getCatalogStore } from "@/lib/store";
import { businessLines } from "@/lib/business";

export const revalidate = 120;
export const metadata: Metadata = { title: "隱私權政策" };

export default async function PrivacyPage() {
  const { settings } = await getCatalogStore();
  const contact = businessLines(settings)
    .filter((line) => line.label === "電話" || line.label === "Email")
    .map((line) => `${line.label} ${line.value}`);
  return (
    <LegalPage title="隱私權政策" settings={settings}>
      <p>
        {settings.shopName}（以下稱本店）販售服飾。您可以不登入就結帳。LINE 登入是選用的，只用來在「我的訂單」查看您以此 LINE 帳號下過的訂單。付款由藍新金流（NewebPay）處理。本頁說明我們向您蒐集哪些資料、用來做什麼，以及您可以如何行使權利。
      </p>
      <h2>我們蒐集的資料</h2>
      <ul>
        <li>結帳時您填寫的收件人姓名、電話、電子郵件。</li>
        <li>宅配地址，或超商取貨門市，或自取地點。</li>
        <li>訂單內容：商品、顏色、尺寸、數量、金額、運費、付款與出貨狀態。</li>
        <li>若您選擇用 LINE 登入或加入官方帳號：LINE 提供的使用者識別碼與顯示名稱。我們不用它登入其他服務，也沒有登入時不會蒐集。</li>
        <li>員工後台為了防止密碼被重複嘗試而留下的登入紀錄，不會公開。</li>
      </ul>
      <h2>使用目的</h2>
      <p>
        這些資料只用來成立與履行訂單、保留庫存、出貨或通知自取、處理退換貨與客服，以及在您已加入官方帳號時透過 LINE 回覆訂單。我們不會出售名單，也不會用它寄送與訂單無關的廣告。
      </p>
      <h2>付款資料</h2>
      <p>
        信用卡、Apple Pay 與其他線上付款都在藍新金流的頁面完成。卡號、有效期限與安全碼只會交給藍新金流，本店的伺服器不會收到，也不會儲存完整卡號。我們只保存藍新金流回傳的交易結果，例如交易序號、付款工具、金額與時間，用來對帳與處理退款。
      </p>
      <h2>保存期間</h2>
      <p>
        訂單存在本店的資料庫（Supabase）。交易相關紀錄會保存至契約履行、退換貨、客訴與依法申報所需期間；稅務憑證通常至少保存五年，或依法令要求之較長期間。期間屆滿或目的消失後，我們會刪除或去識別化。未完成付款而取消的訂單，不再用於行銷。
      </p>
      <h2>委託處理與第三者</h2>
      <p>我們只在提供服務所需範圍內，把資料交給下列單位：</p>
      <ul>
        <li>藍新金流（NewebPay）：付款、退款，以及您選擇超商取貨時的物流。</li>
        <li>Supabase：資料庫。</li>
        <li>Vercel：網站代管。</li>
        <li>宅配或超商物流：出貨時提供收件人姓名、電話與地址或門市。</li>
        <li>LINE：僅在您登入或加入官方帳號時，用於身分辨識與訂單訊息。</li>
      </ul>
      <h2>Cookie 與本機儲存</h2>
      <p>本店不使用廣告追蹤 cookie。我們使用的是完成交易所需的儲存：</p>
      <ul>
        <li>HttpOnly cookie：LINE 登入狀態（若您有登入）、訂單查詢憑證。員工後台另有獨立的登入 cookie，只在後台使用。</li>
        <li>瀏覽器本機儲存：購物袋內容，以及領取優惠時的訪客識別碼。清除瀏覽器資料後，購物袋會一併清空。</li>
      </ul>
      <h2>您的權利</h2>
      <p>
        依個人資料保護法，您可以就本店保有的您的個人資料，請求查詢、閱覽、製給複製本、補充或更正、停止蒐集處理或利用，以及刪除。訂單與會計憑證如依法必須保存，我們會在法令允許的範圍內處理，並向您說明。行使權利時請提供訂單編號，以便核對身分。
      </p>
      <h2>聯絡</h2>
      <p>
        {contact.length > 0
          ? `請用${contact.join("或")}與我們聯絡，並註明訂單編號。`
          : "請用本頁的經營者資訊，或網站上的 LINE 官方帳號與我們聯絡，並註明訂單編號。若尚未公布電話或電子郵件，請改由 LINE 官方帳號聯絡。"}
      </p>
    </LegalPage>
  );
}
