import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const artifacts = path.join(process.cwd(), "tests", "visual", "artifacts");

async function captureDashboard(page: import("@playwright/test").Page, fileName: string) {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    const panel = main?.parentElement;
    const shell = panel?.parentElement;
    if (!main || !panel || !shell) return;
    main.style.overflow = "visible";
    panel.style.overflow = "visible";
    panel.style.height = "auto";
    shell.style.overflow = "visible";
    shell.style.height = "auto";
    document.documentElement.style.height = "auto";
    document.documentElement.style.overflow = "visible";
    document.body.style.height = "auto";
    document.body.style.overflow = "visible";
  });
  await page.screenshot({ path: path.join(artifacts, fileName), fullPage: true });
}

test.beforeAll(() => {
  fs.mkdirSync(artifacts, { recursive: true });
});

test("dashboard matches the admin shell and responds to the main controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");

  await expect(page.getByText("בואו נמשיך להצמיח את העסק.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Storely" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /כל הערוצים/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /מכירות ברוטו/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "הזמנות אחרונות" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "מלאי נמוך" })).toBeVisible();

  const sidebar = page.locator("nav");
  await expect(sidebar).toHaveCSS("width", "240px");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(26, 26, 26)");

  await captureDashboard(page, "dashboard-1440.png");

  await page.setViewportSize({ width: 1280, height: 800 });
  await captureDashboard(page, "dashboard-1280.png");

  await page.getByRole("button", { name: /כל הערוצים/ }).click();
  await page.getByRole("button", { name: "היום", exact: true }).click();
  await expect(page.getByRole("button", { name: /היום · כל הערוצים/ })).toBeVisible();

  await page.getByRole("button", { name: /^הזמנות/ }).click();
  await expect(page.getByRole("heading", { name: "הזמנות", exact: true })).toBeVisible();

  await page.getByPlaceholder("שאלו את העוזר, או כתבו מה תרצו לעשות").fill("הזמנות");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page).toHaveURL(/\/admin\/orders/);
  await expect(page.getByRole("status")).toContainText("פתחתי את ההזמנות");
  await expect(page.getByRole("heading", { name: "הזמנות", exact: true })).toBeVisible();

  await page.goto("/admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("nav")).toBeHidden();
  await page.getByRole("button", { name: "תפריט" }).click();
  const home = page.getByRole("link", { name: "בית", exact: true });
  await expect(home).toBeVisible();
  await home.click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({ path: path.join(artifacts, "dashboard-390.png"), fullPage: false });
});
