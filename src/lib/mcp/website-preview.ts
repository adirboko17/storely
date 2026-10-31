type Shot = {
  device: "desktop" | "mobile";
  width: number;
  height: number;
  bytes: Buffer;
  metrics: {
    scrollWidth: number;
    clientWidth: number;
    viewportHeight: number;
    brokenImages: string[];
    overflowCount: number;
    pageErrors: string[];
  };
};

function publicHost(domains: Array<{ hostname?: string }>) {
  const names = domains.map((domain) => domain.hostname ?? "").filter((host) => host && !host.endsWith(".localhost") && !host.includes("localhost"));
  return names.find((host) => host.startsWith("www.")) ?? names[0] ?? "";
}

function pagePath(value: unknown) {
  const path = typeof value === "string" && value.trim() ? value.trim() : "/";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://")) return "";
  if (!/^\/[A-Za-z0-9/_\-.%]*$/.test(path)) return "";
  return path.slice(0, 180);
}

export function previewHost(structure: { domains?: Array<{ hostname?: string }> }) {
  return publicHost(structure.domains ?? []);
}

export async function captureWebsitePreview(hostname: string, path: string, device: "desktop" | "mobile", width: number) {
  const safePath = pagePath(path);
  if (!hostname) throw new Error("This store has no verified public domain to photograph");
  if (!safePath) throw new Error("The page path must be a relative path starting with /");
  const viewport = device === "mobile"
    ? { width: Math.min(Math.max(width || 390, 320), 480), height: 844 }
    : { width: Math.min(Math.max(width || 1440, 1024), 1600), height: 900 };
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const pageErrors: string[] = [];
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => {
      if (pageErrors.length < 8) pageErrors.push(String(error.message ?? error).slice(0, 180));
    });
    const response = await page.goto(`https://${hostname}${safePath}`, { waitUntil: "networkidle", timeout: 25000 });
    if (!response) throw new Error("The published page did not open");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.complete ? undefined : new Promise((resolve) => {
        img.addEventListener("load", () => resolve(undefined), { once: true });
        img.addEventListener("error", () => resolve(undefined), { once: true });
      })));
    });
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const brokenImages = [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute("src"))
        .slice(0, 12)
        .map((img) => img.currentSrc || img.src);
      const horizontal = root.scrollWidth > root.clientWidth + 1;
      const overflowCount = horizontal
        ? [...document.querySelectorAll("body *")].filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 8 && box.right > window.innerWidth + 1;
        }).length
        : 0;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        viewportHeight: window.innerHeight,
        brokenImages,
        overflowCount,
      };
    });
    const shot: Shot = {
      device,
      width: viewport.width,
      height: viewport.height,
      bytes: await page.screenshot({ type: "png" }),
      metrics: { ...metrics, pageErrors },
    };
    return shot;
  } finally {
    await browser.close();
  }
}

export function websitePreviewContent(hostname: string, path: string, shot: Shot) {
  const notes: string[] = [];
  if (shot.metrics.scrollWidth > shot.metrics.clientWidth + 1) notes.push("horizontal overflow");
  if (shot.metrics.brokenImages.length) notes.push(`${shot.metrics.brokenImages.length} images failed to load`);
  if (shot.metrics.overflowCount > 0) notes.push(`${shot.metrics.overflowCount} elements extend past the viewport`);
  if (shot.metrics.pageErrors.length) notes.push(`${shot.metrics.pageErrors.length} renderer errors`);
  notes.push("Homepage sections are not in the CMS, so a missing custom component cannot be detected from here.");
  const report = {
    version: "published",
    hostname,
    path,
    device: shot.device,
    width: shot.width,
    height: shot.height,
    scrollWidth: shot.metrics.scrollWidth,
    clientWidth: shot.metrics.clientWidth,
    brokenImages: shot.metrics.brokenImages,
    overflowCount: shot.metrics.overflowCount,
    pageErrors: shot.metrics.pageErrors,
    notes,
  };
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(report, null, 2) },
      { type: "image" as const, data: shot.bytes.toString("base64"), mimeType: "image/png" as const },
    ],
    isError: false,
  };
}
