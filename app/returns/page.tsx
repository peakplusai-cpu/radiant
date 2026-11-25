import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { businessLines } from "@/lib/business";
import { getCatalogStore } from "@/lib/store";

export const revalidate = 120;
export const metadata: Metadata = { title: "退換貨政策" };

export default async function ReturnsPage() {
  const { settings } = await getCatalogStore();
  const returnAddress = businessLines(settings).find((line) => line.label === "退貨地址")?.value;
  const contact = businessLines(settings)
    .filter((line) => line.label === "電話" || line.label === "Email")
    .map((line) => `${line.label} ${line.value}`);
  return (
    <LegalPage title="退換貨政策" settings={settings}>
      <p>服飾屬於通訊交易。您可以依消費者保護法行使七日鑑賞期；退款會退回原本的付款方式，由藍新金流處理。</p>
      <h2>七天鑑賞期</h2>
      <p>
        依消費者保護法，您可以在收到商品的次日起七天內申請退貨，不需要說明理由。請保持吊牌完整、沒有穿過、洗過或修改，並附上原包裝。因個人衛生疑慮較高，或已明顯使用的商品，我們可能無法接受退貨。商品有瑕疵時，請一併附上照片，我們會優先處理。
      </p>
      <h2>尺寸與換貨</h2>
      <p>請在結帳時選擇尺寸。若尺寸不合，請在七天內聯絡我們。同款其他尺寸仍有庫存時可以改換；沒有庫存時改為退貨。</p>
      <h2>退款</h2>
      <p>
        我們收到退貨並確認狀態後，會把已付款項退回您當初的付款方式。信用卡、Apple Pay 或其他線上付款的退款，透過藍新金流退回原支付工具，實際入帳時間依發卡機構而定。本店不會請您提供卡號。尚未出貨就取消的訂單，庫存會加回該尺寸。退款不會出現在這個網站的按鈕上，請用下方方式聯絡我們並提供訂單編號。
      </p>
      <h2>怎麼退貨</h2>
      <p>
        {returnAddress
          ? `退貨請寄到：${returnAddress}。`
          : "退貨地址公布於本頁的經營者資訊；若該欄尚無資料，請先聯絡我們取得退貨地址，不要自行寄出。"}
        {contact.length > 0 ? `聯絡方式：${contact.join("、")}。` : "也可以透過網站上的 LINE 官方帳號告訴我們訂單編號與要退或要換的品項。"}
      </p>
    </LegalPage>
  );
}
