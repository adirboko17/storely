import sharp, { type Sharp } from "sharp";

export const COMPOSITE_TEMPLATES = ["luxury_studio", "floating_products", "minimal_clean", "editorial", "gift_collection"] as const;

const MAX_PRODUCTS = 6;
const MAX_DECORATIONS = 24;
const MIN_EDGE = 320;
const MAX_EDGE = 2000;
const MAX_OUTPUT = 4 * 1024 * 1024;

type TemplateName = (typeof COMPOSITE_TEMPLATES)[number];
type Fit = "contain" | "cover";
type Align = "left" | "center" | "right";
type Valign = "top" | "middle" | "bottom";

type Rgb = { r: number; g: number; b: number };

type Background =
  | { type: "solid"; color: Rgb; alpha: number }
  | { type: "transparent" }
  | { type: "gradient"; angle: number; stops: Array<{ color: Rgb; alpha: number; offset: number }> };

type Shadow = { opacity: number; blur: number; x: number; y: number };

type Decoration = {
  type: "rect" | "ellipse" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  color: Rgb;
  opacity: number;
  radius: number;
  stroke: Rgb | null;
  strokeWidth: number;
  rotation: number;
  z: number;
};

type Placement = {
  productId: string;
  imageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  z: number;
  fit: Fit;
  align: Align;
  valign: Valign;
  shadow: Shadow | null;
  radius: number;
  frame: { color: Rgb; width: number } | null;
  crop: { left: number; top: number; width: number; height: number } | null;
};

type CanvasSpec = {
  width: number;
  height: number;
  background: Background;
  placements: Placement[];
  decorations: Decoration[];
};

export type CompositeSpec = {
  save: boolean;
  format: "png" | "webp";
  canvas: CanvasSpec;
  mobile?: CanvasSpec;
};

export type ProductSource = {
  productId: string;
  imageIndex: number;
  title: string;
  bytes: Buffer;
};

export type CompositeWarning = { code: string; productId?: string; message: string };

export type DrawnProduct = {
  productId: string;
  title: string;
  fit: Fit;
  x: number;
  y: number;
  width: number;
  height: number;
  drawnWidth: number;
  drawnHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  backgroundKept: boolean;
};

export type CompositeImage = {
  bytes: Buffer;
  mimeType: "image/png" | "image/webp";
  width: number;
  height: number;
  products: DrawnProduct[];
};

export type CompositeRender = {
  image: CompositeImage;
  mobile?: CompositeImage;
  warnings: CompositeWarning[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCompositeRequest(args: Record<string, unknown>): { ok: true; spec: CompositeSpec } | { ok: false; error: string } {
  if ("sourceUrl" in args || "url" in args || "contentBase64" in args || "imageUrl" in args) {
    return { ok: false, error: "אפשר להשתמש רק בתמונות המוצרים של החנות, לא בכתובת חיצונית" };
  }
  const format = args.format === undefined ? "png" : args.format;
  if (format !== "png" && format !== "webp") return { ok: false, error: "הפורמט יכול להיות png או webp" };
  const save = args.save === undefined ? false : args.save;
  if (typeof save !== "boolean") return { ok: false, error: "save צריך להיות true או false" };

  const template = optionalTemplate(args.template);
  if (!template.ok) return template;
  const order = productOrder(args.productIds, args.products);
  if (!order.ok) return order;
  const canvas = parseCanvas(args, order.products, template.name, true);
  if (!canvas.ok) return canvas;

  let mobile: CanvasSpec | undefined;
  if (args.mobile !== undefined) {
    if (!isRecord(args.mobile)) return { ok: false, error: "הגדרות המובייל צריכות להיות אובייקט" };
    const mobileTemplate = args.mobile.template === undefined ? template : optionalTemplate(args.mobile.template);
    if (!mobileTemplate.ok) return mobileTemplate;
    const mobileOrder = args.mobile.products === undefined && args.mobile.productIds === undefined
      ? { ok: true as const, products: order.products }
      : productOrder(args.mobile.productIds, args.mobile.products);
    if (!mobileOrder.ok) return mobileOrder;
    const parsed = parseCanvas(
      { ...args.mobile, background: args.mobile.background ?? args.background },
      mobileOrder.products,
      mobileTemplate.name,
      false,
    );
    if (!parsed.ok) return parsed;
    mobile = parsed.canvas;
  }

  const ids = new Set([...canvas.canvas.placements, ...(mobile?.placements ?? [])].map((item) => item.productId));
  if (ids.size > MAX_PRODUCTS) return { ok: false, error: `אפשר לשלב עד ${MAX_PRODUCTS} מוצרים` };
  return { ok: true, spec: { save, format, canvas: canvas.canvas, mobile } };
}

export function sourceKeys(spec: CompositeSpec) {
  const seen = new Map<string, { productId: string; imageIndex: number }>();
  for (const place of [...spec.canvas.placements, ...(spec.mobile?.placements ?? [])]) {
    seen.set(`${place.productId}:${place.imageIndex}`, { productId: place.productId, imageIndex: place.imageIndex });
  }
  return [...seen.values()];
}

export async function renderComposite(spec: CompositeSpec, sources: ProductSource[]): Promise<{ ok: true; result: CompositeRender } | { ok: false; error: string }> {
  const warnings: CompositeWarning[] = [];
  const image = await renderCanvas(spec.canvas, spec.format, sources, warnings);
  if (!image.ok) return image;
  let mobile: CompositeImage | undefined;
  if (spec.mobile) {
    const extra = await renderCanvas(spec.mobile, spec.format, sources, warnings);
    if (!extra.ok) return extra;
    mobile = extra.image;
  }
  return { ok: true, result: { image: image.image, mobile, warnings } };
}

export function compositeContent(result: CompositeRender, saved: { assetId: string; publicUrl: string; width: number; height: number; mimeType: string } | null) {
  const summary: Record<string, unknown> = saved
    ? {
        saved: true,
        assetId: saved.assetId,
        publicUrl: saved.publicUrl,
        width: saved.width,
        height: saved.height,
        mimeType: saved.mimeType,
        warnings: result.warnings,
        products: result.image.products,
        note: "הקובץ נשמר במדיה של החנות ולא פורסם. אפשר לשייך את assetId לבלוק תמונה בפופאפ קיים דרך update_popup.",
      }
    : {
        saved: false,
        width: result.image.width,
        height: result.image.height,
        mimeType: result.image.mimeType,
        byteSize: result.image.bytes.byteLength,
        warnings: result.warnings,
        products: result.image.products,
        note: "תצוגה מקדימה בלבד. לא נשמר קובץ ולא פורסם שום דבר.",
      };
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" | "image/webp" }> = [
    { type: "text", text: JSON.stringify(summary, null, 2) },
    { type: "image", data: result.image.bytes.toString("base64"), mimeType: result.image.mimeType },
  ];
  if (result.mobile) {
    summary.mobile = {
      width: result.mobile.width,
      height: result.mobile.height,
      mimeType: result.mobile.mimeType,
      byteSize: result.mobile.bytes.byteLength,
      products: result.mobile.products,
      saved: false,
    };
    content[0] = { type: "text", text: JSON.stringify(summary, null, 2) };
    content.push({ type: "image", data: result.mobile.bytes.toString("base64"), mimeType: result.mobile.mimeType });
  }
  return { content, isError: false as const };
}

function parseCanvas(
  args: Record<string, unknown>,
  products: ProductRef[],
  template: TemplateName | null,
  top: boolean,
): { ok: true; canvas: CanvasSpec } | { ok: false; error: string } {
  const width = args.width === undefined ? 1200 : integer(args.width);
  const height = args.height === undefined ? 800 : integer(args.height);
  if (width === null || height === null || width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE) {
    return { ok: false, error: `רוחב וגובה צריכים להיות בין ${MIN_EDGE} ל־${MAX_EDGE}` };
  }
  const background = parseBackground(args.background, template);
  if (!background.ok) return background;
  const overrides = parseOverrides(args.products);
  if (!overrides.ok) return overrides;
  const slots = template ? layoutSlots(template, products.length, width, height) : [];
  const placements: Placement[] = [];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const over = overrides.items.find((item) => item.productId === product.productId && item.imageIndex === product.imageIndex && !item.used);
    if (over) over.used = true;
    const slot = slots[index];
    const placed = placementFrom(product, over, slot, index, width, height);
    if (!placed.ok) return placed;
    placements.push(placed.placement);
  }
  const unmatched = overrides.items.find((item) => !item.used);
  if (unmatched) return { ok: false, error: top ? "מוצר ברשימת המיקומים לא נכלל במוצרים" : "מוצר בהגדרות המובייל לא מופיע ברשימת המוצרים" };

  let decorations: Decoration[];
  if (args.decorations === undefined) {
    decorations = template ? templateDecorations(template, width, height, slots) : [];
  } else {
    const parsed = parseDecorations(args.decorations, width, height);
    if (!parsed.ok) return parsed;
    decorations = parsed.items;
  }
  return { ok: true, canvas: { width, height, background: background.background, placements, decorations } };
}

type ProductRef = { productId: string; imageIndex: number };

function productOrder(ids: unknown, overlays: unknown): { ok: true; products: ProductRef[] } | { ok: false; error: string } {
  const listed: ProductRef[] = [];
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_PRODUCTS) {
      return { ok: false, error: `אפשר לשלב בין מוצר אחד ל־${MAX_PRODUCTS}` };
    }
    for (const id of ids) {
      if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "מזהה מוצר לא תקין" };
      listed.push({ productId: id, imageIndex: 0 });
    }
  }
  const extra = parseOverrides(overlays);
  if (!extra.ok) return extra;
  if (listed.length === 0) {
    if (extra.items.length === 0) return { ok: false, error: "חסרים מוצרים לקומפוזיציה" };
    return { ok: true, products: extra.items.map((item) => ({ productId: item.productId, imageIndex: item.imageIndex })) };
  }
  for (const item of extra.items) {
    const match = listed.find((row) => row.productId === item.productId && row.imageIndex === 0 && item.imageIndex !== 0);
    if (match && item.imageIndex !== 0) match.imageIndex = item.imageIndex;
  }
  return { ok: true, products: listed };
}

type Override = {
  used: boolean;
  productId: string;
  imageIndex: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  z?: number;
  fit?: Fit;
  align?: Align;
  valign?: Valign;
  scale?: number;
  shadow?: Shadow | null;
  radius?: number;
  frame?: { color: Rgb; width: number } | null;
  crop?: { left: number; top: number; width: number; height: number } | null;
};

function parseOverrides(value: unknown): { ok: true; items: Override[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, items: [] };
  if (!Array.isArray(value) || value.length > MAX_PRODUCTS) return { ok: false, error: `אפשר למקם עד ${MAX_PRODUCTS} מוצרים` };
  const items: Override[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.productId !== "string" || !UUID.test(entry.productId)) {
      return { ok: false, error: "לכל מוצר בקומפוזיציה צריך מזהה תקין" };
    }
    if ("sourceUrl" in entry || "url" in entry || "contentBase64" in entry) {
      return { ok: false, error: "אפשר להשתמש רק בתמונות המוצרים של החנות, לא בכתובת חיצונית" };
    }
    const imageIndex = entry.imageIndex === undefined ? 0 : integer(entry.imageIndex);
    if (imageIndex === null || imageIndex < 0 || imageIndex > 40) return { ok: false, error: "מספר התמונה לא תקין" };
    const x = optionalInt(entry.x, -MAX_EDGE, MAX_EDGE * 2);
    const y = optionalInt(entry.y, -MAX_EDGE, MAX_EDGE * 2);
    const width = optionalInt(entry.width, 16, MAX_EDGE);
    const height = optionalInt(entry.height, 16, MAX_EDGE);
    const rotation = optionalNum(entry.rotation, -180, 180);
    const opacity = optionalNum(entry.opacity, 0, 1);
    const z = optionalInt(entry.z, -100, 100);
    const scale = optionalNum(entry.scale, 0.2, 3);
    const radius = optionalInt(entry.radius, 0, MAX_EDGE);
    if ([x, y, width, height, rotation, opacity, z, scale, radius].some((item) => item === "bad")) {
      return { ok: false, error: "מיקום, גודל, סיבוב או שקיפות של מוצר לא תקינים" };
    }
    const fit = entry.fit === undefined ? undefined : entry.fit;
    if (fit !== undefined && fit !== "contain" && fit !== "cover") return { ok: false, error: "התאמת התמונה יכולה להיות contain או cover" };
    const align = entry.align === undefined ? undefined : entry.align;
    if (align !== undefined && align !== "left" && align !== "center" && align !== "right") return { ok: false, error: "יישור אופקי לא תקין" };
    const valign = entry.valign === undefined ? undefined : entry.valign;
    if (valign !== undefined && valign !== "top" && valign !== "middle" && valign !== "bottom") return { ok: false, error: "יישור אנכי לא תקין" };
    const shadow = parseShadow(entry.shadow, entry);
    if (!shadow.ok) return shadow;
    const frame = parseFrame(entry.frame);
    if (!frame.ok) return frame;
    const crop = parseCrop(entry.crop);
    if (!crop.ok) return crop;
    items.push({
      used: false,
      productId: entry.productId,
      imageIndex,
      x: ready(x),
      y: ready(y),
      width: ready(width),
      height: ready(height),
      rotation: ready(rotation),
      opacity: ready(opacity),
      z: ready(z),
      fit,
      align,
      valign,
      scale: ready(scale),
      shadow: shadow.value,
      radius: ready(radius),
      frame: frame.value,
      crop: crop.value,
    });
  }
  return { ok: true, items };
}

function placementFrom(
  product: ProductRef,
  over: Override | undefined,
  slot: Slot | undefined,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): { ok: true; placement: Placement } | { ok: false; error: string } {
  let width = over?.width ?? slot?.width;
  let height = over?.height ?? slot?.height;
  let x = over?.x ?? slot?.x;
  let y = over?.y ?? slot?.y;
  if (width === undefined || height === undefined || x === undefined || y === undefined) {
    return { ok: false, error: "חסר מיקום או גודל. בחרו תבנית או שלחו x, y, width ו־height לכל מוצר" };
  }
  const scale = over?.scale ?? 1;
  if (scale !== 1) {
    const nextWidth = Math.round(width * scale);
    const nextHeight = Math.round(height * scale);
    x += Math.round((width - nextWidth) / 2);
    y += Math.round((height - nextHeight) / 2);
    width = nextWidth;
    height = nextHeight;
  }
  if (width < 16 || height < 16 || width > canvasWidth || height > canvasHeight) {
    return { ok: false, error: "גודל המוצר חורג מגבולות הקנבס" };
  }
  return {
    ok: true,
    placement: {
      productId: product.productId,
      imageIndex: product.imageIndex,
      x,
      y,
      width,
      height,
      rotation: over?.rotation ?? slot?.rotation ?? 0,
      opacity: over?.opacity ?? 1,
      z: over?.z ?? slot?.z ?? 10 + index,
      fit: over?.fit ?? "contain",
      align: over?.align ?? "center",
      valign: over?.valign ?? "middle",
      shadow: over?.shadow === undefined ? (slot?.shadow ? defaultShadow(width, height) : null) : over.shadow,
      radius: over?.radius ?? 0,
      frame: over?.frame ?? null,
      crop: over?.crop ?? null,
    },
  };
}

function parseShadow(value: unknown, entry: Record<string, unknown>): { ok: true; value: Shadow | null | undefined } | { ok: false; error: string } {
  const opacity = optionalNum(entry.shadowOpacity, 0, 0.85);
  const blur = optionalNum(entry.shadowBlur, 0, 60);
  const x = optionalNum(entry.shadowX, -80, 80);
  const y = optionalNum(entry.shadowY, -80, 80);
  if ([opacity, blur, x, y].some((item) => item === "bad")) return { ok: false, error: "עוצמת הצל לא תקינה" };
  if (value === undefined && opacity === undefined && blur === undefined && x === undefined && y === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === false) return { ok: true, value: null };
  if (value === true || value === undefined || isRecord(value)) {
    const body = isRecord(value) ? value : {};
    const nestedOpacity = optionalNum(body.opacity, 0, 0.85);
    const nestedBlur = optionalNum(body.blur, 0, 60);
    const nestedX = optionalNum(body.x, -80, 80);
    const nestedY = optionalNum(body.y, -80, 80);
    if ([nestedOpacity, nestedBlur, nestedX, nestedY].some((item) => item === "bad")) return { ok: false, error: "עוצמת הצל לא תקינה" };
    return {
      ok: true,
      value: {
        opacity: ready(nestedOpacity) ?? ready(opacity) ?? 0.34,
        blur: ready(nestedBlur) ?? ready(blur) ?? 18,
        x: ready(nestedX) ?? ready(x) ?? 0,
        y: ready(nestedY) ?? ready(y) ?? 16,
      },
    };
  }
  return { ok: false, error: "הצל יכול להיות true, false, או אובייקט עם opacity, blur, x ו־y" };
}

function parseFrame(value: unknown): { ok: true; value: { color: Rgb; width: number } | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) return { ok: false, error: "מסגרת המוצר לא תקינה" };
  const color = typeof value.color === "string" ? parseHex(value.color) : null;
  const width = integer(value.width);
  if (!color || width === null || width < 1 || width > 40) return { ok: false, error: "מסגרת המוצר צריכה צבע ועובי" };
  return { ok: true, value: { color, width } };
}

function parseCrop(value: unknown): { ok: true; value: { left: number; top: number; width: number; height: number } | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) return { ok: false, error: "חיתוך התמונה לא תקין" };
  const left = integer(value.left);
  const top = integer(value.top);
  const width = integer(value.width);
  const height = integer(value.height);
  if (left === null || top === null || width === null || height === null || left < 0 || top < 0 || width < 1 || height < 1) {
    return { ok: false, error: "חיתוך התמונה צריך left, top, width ו־height" };
  }
  return { ok: true, value: { left, top, width, height } };
}

function parseDecorations(value: unknown, canvasWidth: number, canvasHeight: number): { ok: true; items: Decoration[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length > MAX_DECORATIONS) return { ok: false, error: `אפשר עד ${MAX_DECORATIONS} צורות` };
  const items: Decoration[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || (entry.type !== "rect" && entry.type !== "ellipse" && entry.type !== "line")) {
      return { ok: false, error: "צורה יכולה להיות rect, ellipse או line" };
    }
    const color = typeof entry.color === "string" ? parseHex(entry.color) : null;
    const x = integer(entry.x);
    const y = integer(entry.y);
    const width = integer(entry.width);
    const height = integer(entry.height);
    const radius = entry.radius === undefined ? 0 : integer(entry.radius);
    const opacity = entry.opacity === undefined ? 1 : number(entry.opacity);
    const rotation = entry.rotation === undefined ? 0 : number(entry.rotation);
    const z = entry.z === undefined ? 0 : integer(entry.z);
    const strokeWidth = entry.strokeWidth === undefined ? 0 : integer(entry.strokeWidth);
    const stroke = entry.stroke === undefined ? null : typeof entry.stroke === "string" ? parseHex(entry.stroke) : null;
    if (!color || x === null || y === null || width === null || height === null || radius === null || opacity === null || rotation === null || z === null || strokeWidth === null) {
      return { ok: false, error: "לצורה חסרים מיקום, גודל או צבע" };
    }
    if (entry.stroke !== undefined && !stroke) return { ok: false, error: "צבע המסגרת לא תקין" };
    if (width < 1 || height < 1 || width > canvasWidth * 2 || height > canvasHeight * 2 || radius < 0 || opacity < 0 || opacity > 1 || rotation < -180 || rotation > 180 || z < -100 || z > 100 || strokeWidth < 0 || strokeWidth > 40) {
      return { ok: false, error: "מידות הצורה חורגות מהמותר" };
    }
    items.push({ type: entry.type, x, y, width, height, color, opacity, radius, stroke, strokeWidth, rotation, z });
  }
  return { ok: true, items };
}

function parseBackground(value: unknown, template: TemplateName | null): { ok: true; background: Background } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, background: { type: "solid", color: parseHex(template === "luxury_studio" ? "#F4E6DA" : "#FFFFFF") as Rgb, alpha: 1 } };
  }
  if (!isRecord(value) || (value.type !== "solid" && value.type !== "gradient" && value.type !== "transparent")) {
    return { ok: false, error: "הרקע יכול להיות solid, gradient או transparent" };
  }
  if (value.type === "transparent") return { ok: true, background: { type: "transparent" } };
  if (value.type === "solid") {
    const color = typeof value.color === "string" ? parseHex(value.color) : null;
    const alpha = value.alpha === undefined ? 1 : number(value.alpha);
    if (!color || alpha === null || alpha < 0 || alpha > 1) return { ok: false, error: "רקע אחיד צריך צבע hex" };
    return { ok: true, background: { type: "solid", color, alpha } };
  }
  const angle = value.angle === undefined ? 90 : number(value.angle);
  if (angle === null || angle < 0 || angle > 360 || !Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 6) {
    return { ok: false, error: "גרדיאנט צריך זווית ולפחות שני צבעים" };
  }
  const stops: Array<{ color: Rgb; alpha: number; offset: number }> = [];
  for (const stop of value.stops) {
    if (!isRecord(stop) || typeof stop.color !== "string") return { ok: false, error: "צבע בגרדיאנט לא תקין" };
    const color = parseHex(stop.color);
    const offset = number(stop.offset);
    const alpha = stop.alpha === undefined ? 1 : number(stop.alpha);
    if (!color || offset === null || offset < 0 || offset > 1 || alpha === null || alpha < 0 || alpha > 1) {
      return { ok: false, error: "עצירת צבע בגרדיאנט לא תקינה" };
    }
    stops.push({ color, alpha, offset });
  }
  return { ok: true, background: { type: "gradient", angle, stops } };
}

function optionalTemplate(value: unknown): { ok: true; name: TemplateName | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, name: null };
  if (typeof value === "string" && (COMPOSITE_TEMPLATES as readonly string[]).includes(value)) {
    return { ok: true, name: value as TemplateName };
  }
  return { ok: false, error: "התבנית יכולה להיות luxury_studio, floating_products, minimal_clean, editorial או gift_collection" };
}

type Slot = { x: number; y: number; width: number; height: number; rotation: number; shadow: boolean; z: number };

function layoutSlots(template: TemplateName, count: number, canvasWidth: number, canvasHeight: number): Slot[] {
  if (count < 1) return [];
  if (count === 1) {
    const width = Math.round(canvasWidth * 0.42);
    const height = Math.round(canvasHeight * 0.72);
    return [{
      x: Math.round((canvasWidth - width) / 2),
      y: Math.round((canvasHeight - height) / 2),
      width,
      height,
      rotation: template === "floating_products" ? -4 : 0,
      shadow: template !== "minimal_clean",
      z: 10,
    }];
  }
  const margin = Math.round(canvasWidth * 0.06);
  const gap = Math.round(canvasWidth * 0.04);
  if (template === "editorial") {
    const bigWidth = Math.round(canvasWidth * 0.46);
    const bigHeight = Math.round(canvasHeight * 0.78);
    const rest = count - 1;
    const sideWidth = Math.round(canvasWidth * 0.32);
    const sideGap = Math.round(canvasHeight * 0.03);
    const sideHeight = Math.floor((bigHeight - sideGap * (rest - 1)) / rest);
    return [
      { x: margin, y: Math.round(canvasHeight * 0.1), width: bigWidth, height: bigHeight, rotation: -2, shadow: true, z: 10 },
      ...Array.from({ length: rest }, (_, index) => ({
        x: canvasWidth - margin - sideWidth,
        y: Math.round(canvasHeight * 0.1) + index * (sideHeight + sideGap),
        width: sideWidth,
        height: sideHeight,
        rotation: 2,
        shadow: true,
        z: 11 + index,
      })),
    ];
  }
  const itemWidth = Math.floor((canvasWidth - margin * 2 - gap * (count - 1)) / count);
  const itemHeight = Math.round(canvasHeight * (template === "luxury_studio" ? 0.56 : 0.66));
  const y = Math.round(canvasHeight * (template === "luxury_studio" ? 0.2 : 0.16));
  const rotations = template === "floating_products" ? [-6, 4, -3, 5, -4, 2] : template === "gift_collection" ? [-4, 0, 4, -2, 3, 0] : [];
  return Array.from({ length: count }, (_, index) => ({
    x: margin + index * (itemWidth + gap),
    y: y + (template === "floating_products" ? (index % 2) * Math.round(canvasHeight * 0.04) : 0),
    width: itemWidth,
    height: itemHeight,
    rotation: rotations[index] ?? 0,
    shadow: template !== "minimal_clean",
    z: 10 + index,
  }));
}

function templateDecorations(template: TemplateName, canvasWidth: number, canvasHeight: number, slots: Slot[]): Decoration[] {
  if (template === "luxury_studio") {
    return [{
      type: "ellipse",
      x: Math.round(canvasWidth * 0.08),
      y: Math.round(canvasHeight * 0.64),
      width: Math.round(canvasWidth * 0.84),
      height: Math.round(canvasHeight * 0.2),
      color: parseHex("#E4CBB8") as Rgb,
      opacity: 1,
      radius: 0,
      stroke: null,
      strokeWidth: 0,
      rotation: 0,
      z: 1,
    }];
  }
  if (template === "editorial") {
    return [{
      type: "rect",
      x: 0,
      y: 0,
      width: Math.max(8, Math.round(canvasWidth * 0.012)),
      height: canvasHeight,
      color: parseHex("#1A1A1A") as Rgb,
      opacity: 0.85,
      radius: 0,
      stroke: null,
      strokeWidth: 0,
      rotation: 0,
      z: 1,
    }];
  }
  if (template === "gift_collection") {
    return slots.map((slot) => ({
      type: "ellipse" as const,
      x: slot.x - Math.round(slot.width * 0.06),
      y: slot.y + Math.round(slot.height * 0.12),
      width: Math.round(slot.width * 1.12),
      height: Math.round(slot.height * 0.82),
      color: parseHex("#FFFFFF") as Rgb,
      opacity: 0.42,
      radius: 0,
      stroke: null,
      strokeWidth: 0,
      rotation: 0,
      z: 1,
    }));
  }
  return [];
}

function defaultShadow(width: number, height: number): Shadow {
  return { opacity: 0.34, blur: Math.max(10, Math.round(Math.min(width, height) * 0.045)), x: 0, y: Math.max(12, Math.round(height * 0.035)) };
}

async function renderCanvas(
  canvas: CanvasSpec,
  format: "png" | "webp",
  sources: ProductSource[],
  warnings: CompositeWarning[],
): Promise<{ ok: true; image: CompositeImage } | { ok: false; error: string }> {
  const layers: Array<{ z: number; input: Buffer; left: number; top: number }> = [];
  if (canvas.background.type === "gradient") layers.push({ z: -1000, input: gradientSvg(canvas), left: 0, top: 0 });
  for (const decoration of canvas.decorations) {
    layers.push({ z: decoration.z, input: decorationSvg(canvas.width, canvas.height, decoration), left: 0, top: 0 });
  }
  const products: DrawnProduct[] = [];
  for (const place of canvas.placements) {
    const source = sources.find((item) => item.productId === place.productId && item.imageIndex === place.imageIndex);
    if (!source) return { ok: false, error: "חסרה תמונת מקור של מוצר" };
    const drawn = await drawProduct(place, source, warnings);
    if (!drawn.ok) return drawn;
    if (drawn.shadow) layers.push({ z: place.z - 0.5, input: drawn.shadow.buffer, left: drawn.left - drawn.shadow.pad + (place.shadow?.x ?? 0), top: drawn.top - drawn.shadow.pad + (place.shadow?.y ?? 0) });
    layers.push({ z: place.z, input: drawn.buffer, left: drawn.left, top: drawn.top });
    products.push(drawn.product);
  }
  layers.sort((a, b) => a.z - b.z);
  try {
    const base = sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 4,
        background: canvas.background.type === "solid"
          ? { ...canvas.background.color, alpha: canvas.background.alpha }
          : { r: 0, g: 0, b: 0, alpha: 0 },
      },
      limitInputPixels: 20_000_000,
    }).composite(layers.map((layer) => ({ input: layer.input, left: Math.round(layer.left), top: Math.round(layer.top) })));
    const bytes = await encode(base, format);
    if (bytes.byteLength > MAX_OUTPUT) return { ok: false, error: "התמונה גדולה מ־4MB. הקטינו את הקנבס או בחרו webp" };
    const meta = await sharp(bytes).metadata();
    if (meta.width !== canvas.width || meta.height !== canvas.height) return { ok: false, error: "גודל התמונה שנוצרה לא תואם לקנבס" };
    return {
      ok: true,
      image: { bytes, mimeType: format === "png" ? "image/png" : "image/webp", width: canvas.width, height: canvas.height, products },
    };
  } catch {
    return { ok: false, error: "לא ניתן להרכיב את התמונה" };
  }
}

async function drawProduct(place: Placement, source: ProductSource, warnings: CompositeWarning[]) {
  try {
    const oriented = await sharp(source.bytes, { limitInputPixels: 20_000_000, failOn: "error" }).rotate().toBuffer();
    const meta = await sharp(oriented).metadata();
    if (!meta.width || !meta.height) return { ok: false as const, error: `לא ניתן לקרוא את התמונה של ${source.title || "המוצר"}` };
    const meaningfulAlpha = meta.hasAlpha === true && await hasCutout(oriented);
    let srcW = meta.width;
    let srcH = meta.height;
    let pipeline = sharp(oriented);
    if (place.crop) {
      const crop = place.crop;
      if (crop.left + crop.width > srcW || crop.top + crop.height > srcH) {
        return { ok: false as const, error: `החיתוך חורג מגבולות התמונה של ${source.title || "המוצר"}` };
      }
      pipeline = pipeline.extract(crop);
      srcW = crop.width;
      srcH = crop.height;
      warnings.push({ code: "CROP_REQUESTED", productId: place.productId, message: `נחתך אזור שנשלח במפורש מתוך ${source.title || "המוצר"}.` });
    }
    if (!meaningfulAlpha) {
      warnings.push({
        code: "BACKGROUND_KEPT",
        productId: place.productId,
        message: `ל־${source.title || "המוצר"} אין שקיפות נקייה, אז הרקע המקורי נשמר. לא בוצע חיתוך.`,
      });
    }
    if (place.fit === "cover") {
      warnings.push({
        code: "COVER_CROP",
        productId: place.productId,
        message: `${source.title || "המוצר"} הותאם עם cover, וזה עלול לחתוך את האריזה. contain שומר את כולה.`,
      });
    }
    const fitted = place.fit === "cover"
      ? await pipeline.resize(place.width, place.height, { fit: "cover", position: gravity(place.align, place.valign) }).ensureAlpha().png().toBuffer()
      : await contain(pipeline, srcW, srcH, place.width, place.height);
    const fittedMeta = await sharp(fitted).metadata();
    const drawnWidth = fittedMeta.width ?? place.width;
    const drawnHeight = fittedMeta.height ?? place.height;
    let sprite = fitted;
    if (place.opacity < 1) sprite = await sharp(sprite).ensureAlpha().linear([1, 1, 1, place.opacity], [0, 0, 0, 0]).png().toBuffer();
    if (place.radius > 0) sprite = await maskRadius(sprite, drawnWidth, drawnHeight, place.radius);
    if (place.frame) sprite = await addFrame(sprite, drawnWidth, drawnHeight, place.frame, place.radius);
    if (place.rotation !== 0) sprite = await sharp(sprite).rotate(place.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const spriteMeta = await sharp(sprite).metadata();
    const spriteW = spriteMeta.width ?? drawnWidth;
    const spriteH = spriteMeta.height ?? drawnHeight;
    const offsetX = place.align === "left" ? 0 : place.align === "right" ? place.width - drawnWidth : Math.round((place.width - drawnWidth) / 2);
    const offsetY = place.valign === "top" ? 0 : place.valign === "bottom" ? place.height - drawnHeight : Math.round((place.height - drawnHeight) / 2);
    const centerX = place.x + offsetX + drawnWidth / 2;
    const centerY = place.y + offsetY + drawnHeight / 2;
    const left = Math.round(centerX - spriteW / 2);
    const top = Math.round(centerY - spriteH / 2);
    const shadow = place.shadow && place.shadow.opacity > 0 ? await makeShadow(sprite, place.shadow) : null;
    return {
      ok: true as const,
      buffer: sprite,
      left,
      top,
      shadow,
      product: {
        productId: place.productId,
        title: source.title,
        fit: place.fit,
        x: place.x,
        y: place.y,
        width: place.width,
        height: place.height,
        drawnWidth,
        drawnHeight,
        sourceWidth: srcW,
        sourceHeight: srcH,
        backgroundKept: !meaningfulAlpha,
      },
    };
  } catch {
    return { ok: false as const, error: `לא ניתן לעבד את התמונה של ${source.title || "המוצר"}` };
  }
}

async function contain(pipeline: Sharp, srcW: number, srcH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = Math.max(1, Math.min(boxW, Math.round(srcW * scale)));
  const height = Math.max(1, Math.min(boxH, Math.round(srcH * scale)));
  return pipeline.resize(width, height, { fit: "inside" }).ensureAlpha().png().toBuffer();
}

async function hasCutout(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 20_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  if (total < 1) return false;
  let clear = 0;
  const step = Math.max(1, Math.floor(total / 80_000)) * 4;
  let seen = 0;
  for (let i = 3; i < data.length; i += step) {
    seen += 1;
    if (data[i] < 20) clear += 1;
  }
  return seen > 0 && clear / seen >= 0.01;
}

async function maskRadius(image: Buffer, width: number, height: number, radius: number) {
  const rx = Math.min(radius, Math.floor(Math.min(width, height) / 2));
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="#ffffff"/></svg>`);
  return sharp(image).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function addFrame(image: Buffer, width: number, height: number, frame: { color: Rgb; width: number }, radius: number) {
  const stroke = Math.min(frame.width, Math.floor(Math.min(width, height) / 2));
  const rx = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)) - stroke / 2);
  const color = hex(frame.color);
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" rx="${rx}" ry="${rx}" fill="none" stroke="${color}" stroke-width="${stroke}"/></svg>`);
  return sharp(image).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

async function makeShadow(image: Buffer, shadow: Shadow) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(data.length);
  const alpha = Math.round(shadow.opacity * 255);
  for (let i = 0; i < data.length; i += 4) {
    pixels[i] = 32;
    pixels[i + 1] = 22;
    pixels[i + 2] = 20;
    pixels[i + 3] = Math.round((data[i + 3] / 255) * alpha);
  }
  const pad = Math.ceil(Math.max(shadow.blur, 0) * 2);
  let pipeline = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (pad > 0) {
    pipeline = pipeline.extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  if (shadow.blur >= 0.3) pipeline = pipeline.blur(shadow.blur);
  return { buffer: await pipeline.png().toBuffer(), pad };
}

function gradientSvg(canvas: CanvasSpec) {
  const background = canvas.background;
  if (background.type !== "gradient") return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"/>`);
  const rad = (background.angle * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  const stops = background.stops
    .map((stop) => `<stop offset="${Math.round(stop.offset * 100)}%" stop-color="${hex(stop.color)}" stop-opacity="${stop.alpha}"/>`)
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><defs><linearGradient id="g" x1="${50 - x * 50}%" y1="${50 - y * 50}%" x2="${50 + x * 50}%" y2="${50 + y * 50}%">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
}

function decorationSvg(canvasWidth: number, canvasHeight: number, item: Decoration) {
  const color = hex(item.color);
  const stroke = item.stroke ? hex(item.stroke) : "none";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const transform = item.rotation ? ` transform="rotate(${item.rotation} ${cx} ${cy})"` : "";
  let shape = "";
  if (item.type === "ellipse") {
    shape = `<ellipse cx="${cx}" cy="${cy}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${color}" fill-opacity="${item.opacity}" stroke="${stroke}" stroke-width="${item.strokeWidth}"/>`;
  } else if (item.type === "line") {
    shape = `<line x1="${item.x}" y1="${item.y}" x2="${item.x + item.width}" y2="${item.y + item.height}" stroke="${color}" stroke-opacity="${item.opacity}" stroke-width="${Math.max(item.strokeWidth, 1)}"/>`;
  } else {
    shape = `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${item.radius}" ry="${item.radius}" fill="${color}" fill-opacity="${item.opacity}" stroke="${stroke}" stroke-width="${item.strokeWidth}"/>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><g${transform}>${shape}</g></svg>`);
}

async function encode(canvas: Sharp, format: "png" | "webp") {
  if (format === "webp") return canvas.webp({ quality: 92, alphaQuality: 100, effort: 4 }).toBuffer();
  return canvas.png({ compressionLevel: 8 }).toBuffer();
}

function gravity(align: Align, valign: Valign) {
  if (valign === "top" && align === "left") return "northwest";
  if (valign === "top" && align === "right") return "northeast";
  if (valign === "bottom" && align === "left") return "southwest";
  if (valign === "bottom" && align === "right") return "southeast";
  if (valign === "top") return "north";
  if (valign === "bottom") return "south";
  if (align === "left") return "west";
  if (align === "right") return "east";
  return "centre";
}

function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split("").map((part) => part + part).join("") : match[1];
  const n = Number.parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hex(color: Rgb) {
  return `#${[color.r, color.g, color.b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function integer(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function ready(value: number | "bad" | undefined) {
  return typeof value === "number" ? value : undefined;
}

function optionalInt(value: unknown, min: number, max: number) {
  if (value === undefined) return undefined;
  const parsed = integer(value);
  if (parsed === null || parsed < min || parsed > max) return "bad" as const;
  return parsed;
}

function optionalNum(value: unknown, min: number, max: number) {
  if (value === undefined) return undefined;
  const parsed = number(value);
  if (parsed === null || parsed < min || parsed > max) return "bad" as const;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
