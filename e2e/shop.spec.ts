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
  await expect(page.getByRole("heading", { name: "結帳前請先用 LINE 登入" })).toBeVisible();
  await expect(page.getByText("目前購物袋有 3 件商品")).toBeVisible();
  await expect(page.getByLabel("姓名")).toHaveCount(0);
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
