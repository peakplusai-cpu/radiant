import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getCatalogStore } from "@/lib/store";

export const revalidate = 120;
export const metadata: Metadata = { title: "服務條款" };

export default async function TermsPage() {
  const { settings } = await getCatalogStore();
  const home = settings.shippingFee.toLocaleString("en-US");
  const cvs = settings.cvsShippingFee.toLocaleString("en-US");
  const free = settings.freeShippingThreshold.toLocaleString("en-US");
  return (
    <LegalPage title="服務條款" settings={settings}>
      <p>在 {settings.shopName} 送出訂單，表示您同意以下方式購買。結帳當下畫面上的金額、運費與庫存，是這筆訂單的依據。</p>
      <h2>商品與價格</h2>
      <p>售價、顏色、尺寸與庫存以結帳當下伺服器計算的結果為準。畫面上的金額只供預覽，我們不會採用您瀏覽器自行計算或自行修改的價格。庫存不足時，訂單不會成立。</p>
      <h2>訪客結帳與如何成立訂單</h2>
      <p>結帳不需要登入。請填寫姓名、台灣手機與電子郵件；宅配再填地址，自取再選地點。已用 LINE 登入時，訂單會一併掛到該 LINE，方便之後在「我的訂單」查看。沒有登入也能完成購買。</p>
      <p>
        線上付款（信用卡、Apple Pay 等）由藍新金流（NewebPay）的付款頁處理。卡號不會經過本店，本店也不會儲存卡號。送出訂單後請在 30 分鐘內完成付款或選好超商門市；逾時訂單會自動取消，庫存與已使用的優惠次數會釋出。信用卡付款成功，或超商取貨選好門市後，訂單才算成立。ATM 或超商代碼若已取得繳費代碼，繳費期限以訂單頁顯示的日期為準。
      </p>
      <h2>運費、超商取貨與自取</h2>
      <p>
        目前宅配運費為新台幣 {home} 元、超商店到店運費為 {cvs} 元。同一筆訂單商品金額滿 {free} 元免運。自取不另收運費。結帳頁顯示的運費就是這筆訂單的運費。
      </p>
      <p>超商店到店支援 7-ELEVEN、全家與萊爾富，單筆訂單金額須在 30 元至 20,000 元之間。取貨時請攜帶證件，取貨人姓名須與您在付款頁填寫的相同。超商取貨付款的訂單若逾期未取，商品會退回本店，我們可能會取消訂單。</p>
      <p>自取不收運費。商品備妥後，請憑訂單編號與結帳時的手機到您選擇的地點取貨。</p>
      <h2>LINE 登入</h2>
      <p>LINE 登入是選用的，不是結帳條件。登入後可以在「我的訂單」看到以此 LINE 帳號下過的訂單。我們以 LINE 的使用者識別碼辨識，不接受顧客自行填寫的 LINE ID 當作已驗證身分。訪客訂單請用訂單編號、手機與電子郵件查詢。</p>
      <h2>責任範圍</h2>
      <p>商品顏色會因螢幕而有差異。尺寸請以商品頁的尺寸選項為準。若頁面暫時無法送出，請稍後再試，不要重複連按，以免建立兩筆訂單；同一組結帳編號只會成立一筆。</p>
    </LegalPage>
  );
}
