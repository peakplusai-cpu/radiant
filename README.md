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

第一次打開 `/admin`（前台最下方「員工專用入口」）會要求設定後台密碼。

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

3. 在 [Supabase](https://supabase.com) **另開一個專案**（不要用賣車的），SQL Editor 貼上並執行 `supabase/schema.sql`。
4. 在 [Vercel](https://vercel.com) **另開一個 Project** → Import 剛建的 `radiant` repo。Root Directory 留空（`.`）。不要選 `atelier-noir`。
5. Environment Variables 填入（僅此專案、Production / Preview 分開較好）：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SITE_ORIGIN`（正式網域，例如 `https://radiant.example.com`）
6. Deploy。打開 `https://你的網域/admin` 設定後台密碼，再到「設定」填 **Radiant 自己的** LINE 官方帳號（不要填賣車業務的 LINE）。

之後推到這個 repo 的 `main` 會自動部署。

## 功能

前台
- 商品列表排序仿蝦皮：綜合排序（精選置頂 + 銷量 + 新品加權）、最新、熱銷、價格（升/降）。售完商品一律排最後。
- 搜尋、分類篩選、商品頁顏色選擇（每色獨立庫存與選配價格）、購物袋、結帳。
- 結帳以 LINE 登入取得 LINE 名稱與 LINE User ID；未設定 LINE 登入時，改由客戶自行填寫 LINE 名稱與 LINE ID（後台標示「未驗證」）。
- 「我的訂單」：LINE 登入後可看自己所有訂單。

員工後台（`/admin`）
- 商品：上架／下架、名稱、分類、說明、顏色與色票、各色數量與 SKU、款式價、規格細節、售價與原價、精選置頂、多圖上傳與排序。
- 訂單：狀態流轉（待確認／已付款／已出貨／已完成／已取消）。取消會自動把庫存加回。
- 客戶與合併單：同一位 LINE 使用者（以 LINE User ID 辨識；未驗證者以 LINE ID 不分大小寫辨識）的所有訂單歸在同一位客戶下。客戶頁會把待處理訂單合併成一張出貨單（品項加總、應收總額、收件資料），可列印，也可一次標記全部已出貨。訂單列表會標示「同客共 N 張」。
- 設定：LINE 官方帳號（名稱、Basic ID、加好友連結）、LINE 登入 channel、Messaging API 推播、運費與免運門檻、付款說明、頂部公告。

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
