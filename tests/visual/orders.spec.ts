import { expect, test } from "@playwright/test";
import fs from "node:fs";

test.beforeAll(() => {
  fs.mkdirSync("tests/visual/artifacts", { recursive: true });
});

test("orders module matches the prototype interactions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/orders?tab=unfulfilled");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "הזמנות" })).toBeVisible();
  await expect(page.getByText("הזמנות שנשלחו")).toBeVisible();
  await expect(page.getByText("#1047")).toBeVisible();
  await expect(page.getByText("#1043")).toHaveCount(0);
  await page.screenshot({ path: "tests/visual/artifacts/orders-list.png" });

  await page.getByPlaceholder("חיפוש וסינון").fill("אין-לקוח-כזה");
  await expect(page.getByText("לא נמצאו הזמנות")).toBeVisible();
  await page.getByRole("button", { name: "ניקוי מסננים" }).click();
  await expect(page.getByText("#1047")).toBeVisible();

  await page.getByText("#1047").click();
  await expect(page.getByText("אפשר לעטוף כמתנה? זה ליום הולדת של אמא שלי.")).toBeVisible();
  await page.screenshot({ path: "tests/visual/artifacts/order-detail.png" });
  await expect(page.getByText("SHANA10 (10%)")).toBeVisible();
  await expect(page.getByText("נועה כהן").first()).toBeVisible();

  await page.getByRole("button", { name: "סימון כנשלח" }).click();
  await page.getByRole("button", { name: "סימון כנשלח" }).last().click();
  await expect(page.getByText("יש להזין מספר מעקב")).toBeVisible();
  await page.getByLabel("מספר מעקב").fill("CH1047");
  await page.getByRole("button", { name: "סימון כנשלח" }).last().click();
  await expect(page.getByText("שליחויות צ׳יטה · מספר מעקב CH1047")).toBeVisible();
  await expect(page.getByText("ההזמנה סומנה כנשלחה")).toBeVisible();

  await page.getByRole("button", { name: "החזר כספי" }).click();
  await page.locator('input[type="number"]').first().fill("1");
  await page.getByRole("dialog").getByRole("button", { name: /החזר/ }).click();
  await expect(page.getByText("הוחזר חלקית").first()).toBeVisible();

  await page.getByPlaceholder("הוספת הערה פנימית…").fill("נארז למתנה");
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("נארז למתנה")).toBeVisible();
  await expect(page.getByText("מאיה ברק").first()).toBeVisible();

  await page.getByRole("link", { name: "עגלות נטושות" }).click();
  await expect(page.getByRole("heading", { name: "עגלות נטושות" })).toBeVisible();
  await expect(page.getByText("#66890091004067")).toBeVisible();
  await expect(page.getByText("שירה אדלר").first()).toBeVisible();

  await page.getByText("#66890091004067").click();
  await expect(page.getByRole("heading", { name: "#66890091004067" })).toBeVisible();
  await expect(page.getByText("שלחו ללקוח את הקישור הזה כדי לשחזר את העגלה")).toBeVisible();
  await page.screenshot({ path: "tests/visual/artifacts/abandoned-detail.png" });
  await page.getByPlaceholder("הוספת הערה לעגלה הזו").fill("להתקשר מחר");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("ההערה נשמרה")).toBeVisible();
  await page.getByRole("link", { name: "שירה אדלר" }).click();
  await expect(page.getByText("ללקוח הזה אין עדיין פרופיל, כי לא השלים הזמנה")).toBeVisible();

  await page.goto("/admin/orders/drafts");
  await expect(page.getByText("המסך הזה יעוצב בשלב 4")).toBeVisible();
});
