import { signPopupPreview } from "@/lib/mcp/popup-preview-token";

type Shot = {
  device: "desktop" | "mobile";
  width: number;
  height: number;
  bytes: Buffer;
  metrics: { scrollWidth: number; clientWidth: number; cardHeight: number; viewportHeight: number };
};

const TARGETS = {
  desktop: { device: "desktop" as const, width: 1440, height: 900 },
  mobile: [
    { device: "mobile" as const, width: 390, height: 844 },
    { device: "mobile" as const, width: 375, height: 667 },
  ],
};

export async function capturePopupPreview(origin: string, popupId: string, device: "desktop" | "mobile" | "both") {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Preview signing is not configured");
  const token = signPopupPreview(popupId, secret);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const shots: Shot[] = [];
  try {
    const targets = device === "desktop" ? [TARGETS.desktop] : device === "mobile" ? TARGETS.mobile : [TARGETS.desktop, ...TARGETS.mobile];
    for (const target of targets) {
      const page = await browser.newPage({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
      const response = await page.goto(
        `${origin}/preview/popup/${popupId}?token=${encodeURIComponent(token)}&device=${target.device}`,
        { waitUntil: "networkidle", timeout: 20000 },
      );
      if (!response || response.status() !== 200) throw new Error("The draft preview did not open");
      await page.waitForSelector("[data-popup-card]", { timeout: 8000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.complete ? undefined : new Promise((resolve) => {
          img.addEventListener("load", () => resolve(undefined), { once: true });
          img.addEventListener("error", () => resolve(undefined), { once: true });
        })));
      });
      const metrics = await page.evaluate(() => {
        const card = document.querySelector("[data-popup-card]");
        const box = card?.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          cardHeight: Math.round(box?.height ?? 0),
          viewportHeight: window.innerHeight,
        };
      });
      shots.push({ ...target, bytes: await page.screenshot({ type: "png" }), metrics });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return shots;
}

export function previewContent(popupId: string, shots: Awaited<ReturnType<typeof capturePopupPreview>>) {
  const warnings = shots.flatMap((shot) => {
    const notes: string[] = [];
    if (shot.metrics.scrollWidth > shot.metrics.clientWidth + 1) notes.push(`${shot.width}px has horizontal overflow`);
    if (shot.metrics.cardHeight > shot.metrics.viewportHeight - 8) notes.push(`${shot.width}px card is taller than the screen`);
    return notes;
  });
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" }> = [
    { type: "text", text: JSON.stringify({ id: popupId, warnings, shots: shots.map((shot) => ({ device: shot.device, width: shot.width, height: shot.height, ...shot.metrics })) }, null, 2) },
  ];
  for (const shot of shots) content.push({ type: "image", data: shot.bytes.toString("base64"), mimeType: "image/png" });
  return { content, isError: false };
}
