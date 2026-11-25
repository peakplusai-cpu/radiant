import { createDecipheriv, createCipheriv, createHash } from "crypto";
import { expect, test } from "@playwright/test";

test("browse, choose a size, and keep the cart in sync through checkout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /測試珍珠上衣/ })).toBeVisible();
  await page.getByRole("link", { name: /上衣（/ }).click();
  await expect(page.getByRole("link", { name: /測試珍珠上衣/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /已售完銀蔥上衣/ })).toBeVisible();

  const dot = page.locator(".swatches .dot").first();
  await expect(dot).toBeVisible();
  const background = await dot.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).not.toBe("rgb(217, 217, 217)");

  await page.getByRole("link", { name: /測試珍珠上衣/ }).click();
  await expect(page.getByText("顏色", { exact: true })).toBeVisible();
  await expect(page.getByText("數量", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "M" }).click();
  await page.getByRole("button", { name: "加入購物袋" }).click();
  await expect(page.locator(".bag-count")).toHaveText("(1)");

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "訂單摘要" })).toBeVisible();
  await page.getByRole("button", { name: "增加" }).click();
  await page.getByRole("button", { name: "增加" }).click();
  await expect(page.locator(".line .qty span")).toHaveText("3");
  await expect(page.locator(".bag-count")).toHaveText("(3)");

  await page.getByRole("link", { name: "前往結帳" }).click();
  await expect(page.getByRole("heading", { name: "結帳前請先用 LINE 登入" })).toHaveCount(0);
  await expect(page.getByLabel("姓名")).toBeVisible();
  await page.getByRole("button", { name: /前往付款/ }).click();
  await expect(page.getByText("請填寫收件人姓名")).toBeVisible();

  await page.getByLabel("姓名").fill("測試客人");
  await page.getByLabel("聯絡電話").fill("0912345678");
  await page.getByLabel("電子郵件").fill("guest@example.com");
  await page.getByLabel("收件地址").fill("台北市大安區復興南路一段1號");

  const gateway = page.waitForRequest((req) => req.url().startsWith("https://ccore.newebpay.com/MPG/mpg_gateway") && req.method() === "POST");
  await page.route("https://ccore.newebpay.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>newebpay-mock</title>" }));
  await page.getByRole("button", { name: /前往付款/ }).click();
  const posted = await gateway;
  const params = new URLSearchParams(posted.postData() ?? "");
  expect(params.get("MerchantID")).toBe("MS000TEST");
  expect(params.get("Version")).toBe("2.0");
  expect(params.get("TradeInfo")).toMatch(/^[0-9a-f]+$/);
  const sha = createHash("sha256").update(`HashKey=${KEY}&${params.get("TradeInfo")}&HashIV=${IV}`).digest("hex").toUpperCase();
  expect(params.get("TradeSha")).toBe(sha);
  const raw = Buffer.from(params.get("TradeInfo") ?? "", "hex");
  const decipher = createDecipheriv("aes-256-cbc", KEY, IV);
  const plain = Buffer.concat([decipher.update(raw), decipher.final()]).toString("utf8");
  const trade = new URLSearchParams(plain);
  expect(trade.get("RespondType")).toBe("JSON");
  expect(trade.get("Version")).toBe("2.0");
  expect(trade.get("Amt")).toBe("3240");
  expect(trade.get("Email")).toBe("guest@example.com");
  expect(trade.get("ItemDesc")).toContain("Radiant 訂單");
  expect(trade.get("CREDIT")).toBe("1");
  expect(trade.get("APPLEPAY")).toBe("1");
  expect(trade.get("ANDROIDPAY")).toBe("1");
  expect(trade.get("LINEPAY")).toBe("1");
  expect(trade.get("VACC")).toBe("1");
  expect(trade.get("CVS")).toBe("1");
  expect(trade.get("ExpireDate")).toMatch(/^\d{8}$/);
  expect(trade.get("ReturnURL")).toBe("https://radiant-indol.vercel.app/api/pay/return");
  expect(trade.get("NotifyURL")).toBe("https://radiant-indol.vercel.app/api/pay/notify");
  expect(trade.get("ClientBackURL")).toBe("https://radiant-indol.vercel.app/orders");
  expect(trade.get("CustomerURL")).toBe("https://radiant-indol.vercel.app/api/pay/return");
  expect(trade.get("MerchantOrderNo")).toMatch(/^RD\d{10}_1$/);
  expect(posted.postData() ?? "").not.toContain(KEY);
  expect(posted.postData() ?? "").not.toContain(IV);
  await expect(page).toHaveTitle("newebpay-mock");
});

test("unauthenticated admin responses do not contain store data", async ({ request }) => {
  for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/settings"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location).toContain("/admin/login");
    const body = await response.text();
    expect(body, path).not.toContain("LEAKPROBE");
    expect(body, path).not.toContain("測試珍珠上衣");
    expect(body, path).not.toContain("RDLEAK");
    expect(body.length, path).toBeLessThan(80);
  }

  const login = await request.get("/admin/login");
  expect(login.status()).toBe(200);
  expect(await login.text()).not.toContain("LEAKPROBE");

  const forged = await request.get("/admin/orders", {
    maxRedirects: 0,
    headers: { cookie: "radiant_admin=9999999999999.abc.deadbeef" },
  });
  expect(forged.status()).toBe(307);
  expect(await forged.text()).not.toContain("LEAKPROBE");
});

const KEY = "e2eHashKeyThirtyTwoCharsLong0123";
const IV = "e2eHashIV0123456";

function signedForm(body: unknown) {
  const cipher = createCipheriv("aes-256-cbc", KEY, IV);
  const tradeInfo = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]).toString("hex");
  const tradeSha = createHash("sha256").update(`HashKey=${KEY}&${tradeInfo}&HashIV=${IV}`).digest("hex").toUpperCase();
  return { Status: "SUCCESS", MerchantID: "MS000TEST", TradeInfo: tradeInfo, TradeSha: tradeSha, Version: "2.0" };
}

test("NewebPay notices must be signed, and a signed one marks the order paid", async ({ request, page }) => {
  const result = { MerchantID: "MS000TEST", Amt: 1150, TradeNo: "E2E0001", MerchantOrderNo: "RDPAYTEST_1", PaymentType: "CREDIT", PayTime: "2026-11-16 22:00:00" };

  const forged = await request.post("/api/pay/notify", { form: { ...signedForm({ Status: "SUCCESS", Result: result }), TradeSha: "0".repeat(64) } });
  expect(forged.status()).toBe(400);

  const early = await request.post("/api/pay/return", { form: signedForm({ Status: "SUCCESS", Result: result }), maxRedirects: 0 });
  expect(early.status()).toBe(303);
  expect(early.headers().location).toContain("pay=returned");

  await page.goto("/order/RDPAYTEST?t=paytok");
  await expect(page.getByRole("heading", { name: "請完成付款" })).toBeVisible();
  await expect(page.getByRole("button", { name: /前往付款/ })).toBeVisible();

  const wrongAmount = await request.post("/api/pay/notify", { form: signedForm({ Status: "SUCCESS", Result: { ...result, Amt: 1 } }) });
  expect(wrongAmount.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: /前往付款/ })).toBeVisible();

  const notify = await request.post("/api/pay/notify", { form: signedForm({ Status: "SUCCESS", Result: result }) });
  expect(notify.status()).toBe(200);
  expect(await notify.text()).toBe("OK");

  await page.reload();
  await expect(page.getByRole("heading", { name: "訂單已送出" })).toBeVisible();
  await expect(page.getByRole("button", { name: /前往付款/ })).toHaveCount(0);
  await expect(page.locator(".status-pill")).toHaveText("已付款");
});

test("returning from NewebPay with a signed form lands on the order page", async ({ request, page }) => {
  const store = { StoreCode: "131386", StoreName: "光輝", StoreType: "全家", StoreAddr: "台北市信義區", CVSCOMName: "取貨測試", CVSCOMPhone: "0912000002", LgsNo: "F000111" };
  const form = signedForm({ Status: "SUCCESS", Result: { MerchantID: "MS000TEST", Amt: 1145, TradeNo: "E2E0002", MerchantOrderNo: "RDCODTEST_1", PaymentType: "CVSCOM", ...store } });
  const response = await request.post("/api/pay/return", { form, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers().location).pathname).toBe("/order/RDCODTEST");
  expect(response.headers().location).toContain("pay=returned");

  const bad = await request.post("/api/pay/return", { form: { ...form, TradeSha: "0".repeat(64) }, maxRedirects: 0 });
  expect(bad.status()).toBe(303);
  expect(bad.headers().location).not.toContain("RDCODTEST");

  await page.goto("/order/RDCODTEST?t=codtok");
  await expect(page.getByRole("heading", { name: "請選擇取貨門市" })).toBeVisible();
  await expect(page.getByText("全家 光輝")).toHaveCount(0);

  const notify = await request.post("/api/pay/notify", { form });
  expect(notify.status()).toBe(200);
  await page.reload();
  await expect(page.getByText("全家 光輝")).toBeVisible();
  await expect(page.getByText("取貨測試").first()).toBeVisible();
  await expect(page.getByText("寄件代碼")).toHaveCount(0);
  await expect(page.locator(".status-pill")).toHaveText("待出貨（取貨付款）");
});

test("admin promotion reaches the storefront and an expired one is rejected", async ({ page, request, baseURL }) => {
  await page.goto("/admin/login");
  await page.getByLabel("密碼").fill("e2e-password");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const taipei = (offsetMs: number) => new Date(Date.now() + offsetMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await page.goto("/admin/promotions/new");
  await page.locator('input[name="name"]').fill("週年慶");
  await page.locator('input[name="banner"]').fill("全館 8 折");
  await page.locator('input[name="value"]').fill("20");
  await page.locator('input[name="startsAt"]').fill(taipei(-60 * 60 * 1000));
  await page.locator('input[name="endsAt"]').fill(taipei(2 * 60 * 60 * 1000));
  await page.locator('input[name="requiresClaim"]').check();
  await page.getByRole("button", { name: "儲存活動" }).click();
  await expect(page.getByRole("heading", { name: "優惠活動" })).toBeVisible();
  await expect(page.getByText("進行中")).toBeVisible();

  await page.goto("/");
  const banner = page.locator(".promo-banner");
  await expect(banner).toContainText("全館 8 折");
  await expect(banner.getByRole("timer")).toContainText(/\d{2}:\d{2}:\d{2}/);
  const promoId = await banner.getAttribute("data-promo-id");
  expect(promoId).toBeTruthy();

  await page.getByRole("link", { name: /測試珍珠上衣/ }).click();
  await expect(page.locator(".price-line")).toContainText("NT$ 864");
  await expect(page.locator(".price-line s")).toBeVisible();
  await page.getByRole("button", { name: "領取折扣" }).click();
  await expect(page.getByRole("button", { name: "已領取" })).toBeVisible();
  const guest = await page.evaluate(() => localStorage.getItem("radiant.promo.guest"));
  expect(guest).toMatch(/^[A-Za-z0-9_-]{16,80}$/);

  await page.getByRole("radio", { name: "L" }).click();
  await page.getByRole("button", { name: "加入購物袋" }).click();
  await page.goto("/cart");
  await expect(page.getByText("折扣 · 週年慶")).toBeVisible();
  await expect(page.getByText("-NT$ 216")).toBeVisible();
  await expect(page.locator(".sum-row.total")).toContainText("NT$ 934");

  await page.getByRole("link", { name: "前往結帳" }).click();
  await expect(page.getByRole("button", { name: /前往付款 · NT\$ 934/ })).toBeVisible();

  await page.goto(`/admin/promotions/${promoId}`);
  await page.locator('input[name="startsAt"]').fill(taipei(-2 * 60 * 60 * 1000));
  await page.locator('input[name="endsAt"]').fill(taipei(-60 * 60 * 1000));
  await page.getByRole("button", { name: "儲存活動" }).click();
  await expect(page.getByText("活動已儲存")).toBeVisible();
  await expect(page.getByText("已結束")).toBeVisible();

  const rejected = await request.post("/api/checkout", {
    headers: { origin: baseURL ?? "http://127.0.0.1:3100" },
    data: {
      items: [{ productId: "prd_top", variantId: "var_coffee_L", qty: 1 }],
      recipient: "測試客人",
      phone: "0912000111",
      email: "promo@example.com",
      address: "台北市大安區復興南路一段1號",
      fulfillment: "delivery",
      payment: "online",
      pickupPointId: "",
      idempotencyKey: "promoexpired1",
      guestToken: guest,
      shownPromoIds: [promoId],
    },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error).toContain("已結束");

  await page.goto("/p/prd_top");
  await expect(page.locator(".price-line")).toContainText("NT$ 1,080");
  await expect(page.locator(".price-line")).not.toContainText("NT$ 864");
  await expect(page.locator(".promo-banner")).toHaveCount(0);
});

test("legal pages describe guest checkout and NewebPay without the draft banner", async ({ page }) => {
  for (const path of ["/privacy", "/terms", "/returns"]) {
    await page.goto(path);
    await expect(page.getByText("供店主審閱")).toHaveCount(0);
    await expect(page.getByText("本店不在網站上刷卡")).toHaveCount(0);
    await expect(page.getByText("結帳與查詢訂單都需要登入")).toHaveCount(0);
    await expect(page.getByText("藍新金流").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "經營者資訊" })).toHaveCount(0);
  }
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "您的權利" })).toBeVisible();
  await expect(page.getByText("個人資料保護法")).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByText("結帳不需要登入")).toBeVisible();
  await expect(page.getByText("30 分鐘內完成付款")).toBeVisible();
  await expect(page.getByText("宅配運費為新台幣 70 元")).toBeVisible();
  await page.goto("/returns");
  await expect(page.getByRole("heading", { name: "七天鑑賞期" })).toBeVisible();
  await expect(page.getByText("當初的付款方式")).toBeVisible();
  const home = await page.goto("/");
  expect(home?.ok()).toBeTruthy();
  expect(await page.content()).not.toContain("TOKENPROBE9f3a");
  expect(await page.content()).not.toContain("SECRETPROBE9f3a");
});

test("admin settings explains LINE alerts and does not reveal stored secrets", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("密碼").fill("e2e-password");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByText("上線前請填寫經營者資訊")).toBeVisible();
  await expect(page.getByText("https://radiant-indol.vercel.app/api/line/webhook")).toBeVisible();
  await expect(page.getByRole("button", { name: "發送 LINE 測試訊息" })).toBeVisible();
  await expect(page.locator('input[name="messagingToken"]')).toHaveValue("");
  await expect(page.locator('input[name="messagingChannelSecret"]')).toHaveValue("");
  await expect(page.locator('input[name="loginChannelSecret"]')).toHaveValue("");
  const html = await page.content();
  expect(html).not.toContain("TOKENPROBE9f3a");
  expect(html).not.toContain("SECRETPROBE9f3a");
});

test("pay start refuses cross-site requests and unknown orders", async ({ request, baseURL }) => {
  const noOrigin = await request.post("/api/pay/start", { data: { code: "RDPAYTEST", token: "paytok" } });
  expect(noOrigin.status()).toBe(403);
  const unknown = await request.post("/api/pay/start", { headers: { origin: baseURL ?? "" }, data: { code: "RDNOPE", token: "x" } });
  expect(unknown.status()).toBe(404);
  const wrongToken = await request.post("/api/pay/start", { headers: { origin: baseURL ?? "" }, data: { code: "RDCODTEST", token: "wrong" } });
  expect(wrongToken.status()).toBe(404);
});
