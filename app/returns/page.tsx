import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 3600;
export const metadata: Metadata = { title: "退換貨政策" };

export default async function ReturnsPage() {
  await dynamicWithoutDatabase();
  return (
    <LegalPage title="退換貨政策">
      <p>服飾屬於通訊交易。以下是本店目前的處理方式，請店主依實際退貨地址與是否接受換尺寸調整後再公告。</p>
      <h2>七天鑑賞</h2>
      <p>依消費者保護法，您可以在收到商品的次日起七天內，透過官方 LINE 提出退貨，不需要說明理由。請保持吊牌完整、沒有穿過、洗過或修改，並附上原包裝。個人衛生疑慮較高、或已明顯使用的商品，我們可能無法接受退貨。</p>
      <h2>尺寸與換貨</h2>
      <p>請在結帳時選擇尺寸。若尺寸不合，請在七天內聯絡我們。同款其他尺寸仍有庫存時，可以改換；沒有庫存時改為退貨。運費是否由本店負擔，會在 LINE 先跟您說清楚再進行。</p>
      <h2>退款</h2>
      <p>我們收到退貨並確認狀態後，會把已付款項退回您當初付款的方式。網站本身沒有金流，所以退款不會出現在這個網站的按鈕上，而會沿用 LINE 裡約定的轉帳或原支付方式。取消尚未出貨的訂單時，庫存會加回該尺寸。</p>
      <h2>怎麼聯絡</h2>
      <p>請用官方 LINE 告訴我們訂單編號、要退或要換的品項。不要只在網站備註欄留言。若商品有瑕疵，請一併附上照片，我們會優先處理。</p>
    </LegalPage>
  );
}
