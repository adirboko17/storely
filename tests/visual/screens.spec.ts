import { expect, test } from "@playwright/test";

test("designed screens render and the sidebar search stays transparent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/admin");
  const search = page.locator("#admin-search");
  await expect(search).toBeVisible();
  const searchStyle = await search.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(searchStyle.background).toBe("rgba(0, 0, 0, 0)");
  expect(searchStyle.color).toBe("rgb(255, 255, 255)");

  const shown = (name: string, exact = false) => page.getByText(name, { exact }).filter({ visible: true });

  await page.getByRole("link", { name: "מוצרים" }).click();
  await expect(page.getByRole("heading", { name: "מוצרים" })).toBeVisible();
  await expect(shown("ספל קרמיקה עבודת יד")).toBeVisible();
  await page.getByPlaceholder("חיפוש וסינון").fill("פמוט");
  await expect(shown("זוג פמוטי פליז")).toBeVisible();
  await expect(shown("ספל קרמיקה עבודת יד")).toHaveCount(0);
  await shown("זוג פמוטי פליז").click();
  await expect(page.getByRole("heading", { name: "זוג פמוטי פליז" })).toBeVisible();
  await expect(page.getByText("תמחור")).toBeVisible();

  await page.goto("/admin/products/collections");
  await expect(page.getByRole("heading", { name: "קטגוריות" })).toBeVisible();
  await expect(page.getByText("מטבח ואירוח")).toBeVisible();
  await shown("כלי שתייה", true).click();
  await expect(shown("ספל קרמיקה עבודת יד")).toBeVisible();

  await page.goto("/admin/products/inventory");
  await expect(page.getByRole("heading", { name: "מלאי" })).toBeVisible();
  await expect(page.getByText("LVN-MUG-01-1")).toBeVisible();

  await page.goto("/admin/products/gift-cards");
  await expect(page.getByRole("heading", { name: "התחילו למכור כרטיסי מתנה" })).toBeVisible();
  await page.getByRole("button", { name: "יצירת כרטיס מתנה" }).click();
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(page.getByText("פעיל")).toBeVisible();

  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "לקוחות" })).toBeVisible();
  await shown("נועה כהן").click();
  await expect(page.getByRole("heading", { name: "נועה כהן" })).toBeVisible();
  await expect(page.getByText("פרטי קשר")).toBeVisible();

  await page.goto("/admin/customers/segments");
  await expect(page.getByRole("heading", { name: "פלחי לקוחות" })).toBeVisible();

  await page.goto("/admin/growth");
  await expect(page.getByRole("heading", { name: "צמיחה" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "שיווק על טייס אוטומטי" })).toBeVisible();
  await page.getByRole("button", { name: "הסתרה" }).click();
  await expect(page.getByRole("heading", { name: "שיווק על טייס אוטומטי" })).toHaveCount(0);
  await page.getByRole("button", { name: "לפרטים" }).click();
  await expect(page.getByRole("heading", { name: "ייחוס" })).toBeVisible();

  await page.goto("/admin/discounts");
  await expect(shown("SHANA10")).toBeVisible();
  await page.getByRole("button", { name: "יצירת הנחה" }).click();
  await page.getByRole("button", { name: /הנחה על ההזמנה/ }).click();
  await expect(page).toHaveURL(/\/admin\/discounts\/new\?type=order/);

  await page.goto("/admin/marketing/integrations");
  await expect(page.getByRole("heading", { name: "אינטגרציות" })).toBeVisible();
  await expect(shown("Meta Pixel")).toBeVisible();

  await page.goto("/admin/marketing/automations");
  await expect(page.getByRole("heading", { name: "אוטומציות", exact: true })).toBeVisible();
  await shown("עגלה נטושה").first().click();
  await expect(shown("שליחת בדיקה")).toBeVisible();

  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "ניתוח נתונים" })).toBeVisible();
  await expect(shown("₪2,480.80").first()).toBeVisible();

  await page.goto("/admin/analytics/reports");
  await page.getByPlaceholder("חיפוש דוחות").fill("מלאי");
  await expect(shown("ערך מלאי לפי מוצר")).toBeVisible();
  await expect(shown("הזמנות לאורך זמן")).toHaveCount(0);

  await page.goto("/admin/analytics/live");
  await expect(page.getByRole("heading", { name: "צפייה חיה" })).toBeVisible();
  await expect(shown("תל אביב-יפו")).toBeVisible();
  await expect(page.getByText("טוען מפה…")).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByRole("img", { name: "תל אביב" })).toBeVisible();
  const landDots = await page.locator("canvas").evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    if (!context) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const alpha = data[index + 3] ?? 0;
      if (alpha > 200 && red < 150 && green > 160 && blue > 170) count += 1;
    }
    return count;
  });
  expect(landDots).toBeGreaterThan(30);
  await page.getByRole("button", { name: "הצגת ערים" }).click();
  await expect(page.getByText("באר שבע", { exact: true })).toBeVisible();

  await page.goto("/admin/content/posts");
  await expect(page.getByRole("heading", { name: "כתבו פוסט בבלוג" })).toBeVisible();

  await page.goto("/admin/design-system");
  await expect(page.getByRole("heading", { name: "מערכת עיצוב · מדף" })).toBeVisible();
  await expect(shown("--focus")).toBeVisible();

  const searchAfter = await page.locator("#admin-search").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(searchAfter).toBe("rgba(0, 0, 0, 0)");
  expect(errors).toEqual([]);
});
