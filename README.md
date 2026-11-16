# Radiant

獨立的公司電商網站。與 Car House / atelier-noir（賣車）無關，也不共用 GitHub、Vercel、資料庫或 LINE 帳號。

Next.js 15 + TypeScript。本機沒設資料庫時，資料存在單一 JSON 檔。

## 本機啟動

專案在自己的 GitHub repo 根目錄時：

```bash
npm install
npm run dev        # http://localhost:3100
# 或 npm run build && npm start
```

若你目前是從賣車 repo 裡的 `radiant/` 資料夾執行，先 `cd radiant` 再跑上面的指令。

第一次打開 `/admin` 會要求設定後台密碼。前台頁尾不再顯示員工入口。

## 獨立 GitHub + Vercel（必做）

不要把 Radiant 合併進 `atelier-noir`，也不要在 Vercel 選賣車那個 repo。你帳號裡已有的 `shop`（`peakplus-ai-shop.vercel.app`）也是另一個專案，不要覆蓋。

1. 在 GitHub 新增一個**空的** repository，建議名稱 `radiant`，不要勾選 README / .gitignore / license。
2. 把這個資料夾推上去（在有 `package.json` 的 Radiant 根目錄執行，把網址換成你的新 repo）：

```bash
git init
git add .
git commit -m "Initial Radiant storefront"
git branch -M main
git remote add origin https://github.com/你的帳號/radiant.git
git push -u origin main
```

3. 在 [Supabase](https://supabase.com) **另開一個專案**（不要用賣車的），SQL Editor 貼上並執行 `supabase/schema.sql`。既有專案請再執行 `supabase/migrations/20261113_harden.sql`。
4. 在 [Vercel](https://vercel.com) **另開一個 Project** → Import 剛建的 `radiant` repo。Root Directory 留空（`.`）。不要選 `atelier-noir`。
5. Environment Variables 填入（僅此專案、Production / Preview 分開較好）：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` 或 `SITE_ORIGIN`（正式網域，例如 `https://radiant-indol.vercel.app`）
6. Deploy。打開 `https://你的網域/admin` 設定後台密碼，再到「設定」填 **Radiant 自己的** LINE 官方帳號（不要填賣車業務的 LINE）。

之後推到這個 repo 的 `main` 會自動部署。

## 功能

前台
- 商品列表排序仿蝦皮：綜合排序（精選置頂 + 銷量 + 新品加權）、最新、熱銷、價格（升/降）。售完商品一律排最後。
- 搜尋、分類篩選、商品頁顏色與尺寸（顏色 × 尺寸各自庫存）、購物袋、結帳。
- 結帳以 LINE 登入取得 LINE 名稱與 LINE User ID；未設定 LINE 登入時，改由客戶自行填寫 LINE 名稱與 LINE ID（後台標示「未驗證」）。
- 「我的訂單」：LINE 登入後可看自己所有訂單。

員工後台（`/admin`）
- 商品：上架／下架、名稱、分類、說明、顏色與色票、各色數量與 SKU、款式價、規格細節、售價與原價、精選置頂、多圖上傳與排序。
- 訂單：狀態流轉（待確認／已付款／已出貨／已完成／已取消）。取消會自動把庫存加回。
- 客戶與合併單：同一位 LINE 使用者（以 LINE User ID 辨識；未驗證者以 LINE ID 不分大小寫辨識）的所有訂單歸在同一位客戶下。客戶頁會把待處理訂單合併成一張出貨單（品項加總、應收總額、收件資料），可列印，也可一次標記全部已出貨。訂單列表會標示「同客共 N 張」。
- 設定：LINE 官方帳號（名稱、Basic ID、加好友連結）、LINE 登入 channel、Messaging API 推播、運費與免運門檻、付款說明、頂部公告。

## 藍新金流（信用卡／Apple Pay／超商店到店）

沒設定金鑰時，網站維持原本的「LINE 確認付款」流程，不會出錯。審核通過後在 Vercel 設定下列環境變數並重新部署即可啟用：

| 變數 | 說明 |
| --- | --- |
| `NEWEBPAY_MERCHANT_ID` | 藍新商店代號 |
| `NEWEBPAY_HASH_KEY` | 32 字元，會員中心「商店資料設定」的 API 串接金鑰 |
| `NEWEBPAY_HASH_IV` | 16 字元，同上 |
| `NEWEBPAY_ENV` | 填 `production` 才連正式環境；留空或其他值一律連測試環境（`ccore.newebpay.com`） |
| `NEWEBPAY_METHODS` | 預設 `credit,applepay`。Apple Pay 還沒核准時改成 `credit`；全部關閉填空字串 |
| `NEWEBPAY_CVS` | 預設開啟超商店到店；物流還沒開通時填 `off` |
| `NEXT_PUBLIC_SITE_URL` | 正式網域。藍新回傳網址（`/api/pay/return`、`/api/pay/notify`）以它組成，整串不可超過 50 字元 |
| `CRON_SECRET` | 隨機字串，用來保護每日清理逾時訂單的排程（見下方） |

流程：

- 信用卡／Apple Pay：送出訂單後建立「待付款」訂單並保留庫存 30 分鐘，前往藍新付款頁。藍新背景通知（`/api/pay/notify`，驗證 TradeSha、金額與訂單編號後）才把訂單改成「已付款」；瀏覽器回傳（`/api/pay/return`）用同一套驗證，不會因為偽造表單而入帳。
- 超商店到店：顧客在藍新頁面選 7-ELEVEN／全家／萊爾富門市並填取貨人。超商取貨付款只送 `CVSCOM=2`；先刷卡再取貨則在卡片參數外加 `CVSCOM=1`。門市、取貨人與寄件代碼會出現在後台訂單頁，請到藍新會員專區「物流」列印寄件單，再把訂單改成「已出貨」。取貨付款在顧客取貨付款後，藍新通知會把訂單自動改成「已完成」。
- 運費：宅配 `宅配運費`、超商 `超商店到店運費`（預設 65），商品金額達免運門檻（預設 2,000）都免收；自取不收。三家超商統一收同一個金額。超商訂單金額須在 30–20,000。
- 逾時：未付款或未選門市超過 30 分鐘，下一筆訂單成立時、顧客重新付款時、或每日排程（`/api/cron/expire`，需設定 `CRON_SECRET`；Vercel Hobby 方案只能每天跑一次）就會取消並把庫存加回。逾時後才付款成功的訂單，庫存還在就自動復原，否則標示「請退款」並通知店家。
- 在藍新後台（「商店資料設定」）確認信用卡、Apple Pay 已啟用，物流設定已啟用 7-ELEVEN、全家、萊爾富，並填好退貨門市。測試環境信用卡號 `4000-2211-1111-1111`。

## 連接 LINE

請用 Radiant 專用的 LINE 官方帳號與 Developers channel，不要沿用賣車站。

1. LINE Developers 建立 **LINE Login** channel，Callback URL 填 `https://你的網域/api/line/callback`（設定頁會顯示確切網址）。
2. 在後台「設定」填入 Channel ID 與 Channel secret，並把此 channel 與官方帳號連結，客戶登入時會被引導加入好友。
3. 要推播新訂單通知：填入 Messaging API 的 channel access token 與「店家通知對象」的 User ID，按「發送 LINE 測試訊息」確認。客戶需已加入官方帳號好友才收得到訂單確認訊息。

也可用環境變數 `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`LINE_MESSAGING_TOKEN`（後台填的值優先）。正式環境請設定 `SITE_ORIGIN`。

## 資料

沒有設定 Supabase 時，資料存在 `data/store.json`、圖片存在 `data/uploads/`（皆不進版控），適合本機開發。

設定 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 後，自動改用 Supabase：資料放在 `radiant_store` 資料表（單列 jsonb，寫入以版本號做樂觀鎖），圖片放在 `radiant-uploads` 公開儲存桶。部署到 Vercel 必須這樣做。

預覽環境若使用同一組 Supabase，會與正式站共用資料，建議預覽另開一個 Supabase 專案。

整份資料是一列 jsonb，適合中小規模；訂單累積到數萬筆時，請改成逐表儲存。
