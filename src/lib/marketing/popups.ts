import { getStoreIdentity } from "@/data/live/store-identity";
import { cleanPopupStyle, type PopupIconName, type PopupStyle, type PopupTextFont, type PopupTextWeight } from "@/lib/marketing/popup-style";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type PopupAlign = "right" | "center" | "left";
export type PopupLayout = "modal" | "bar" | "corner";
export type PopupTrigger = "immediate" | "delay" | "scroll" | "exit";
export type PopupFrequency = "always" | "session" | "day" | "once";
export type PopupDevice = "all" | "desktop" | "mobile";
export type PopupStatus = "draft" | "active" | "paused";
export type PopupFieldType = "text" | "email" | "tel" | "textarea" | "checkbox" | "consent";
export type PopupClosePlace = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PopupSpan = "full" | "half";
export type PopupMedia = "none" | "right" | "left";
export type PopupMotion = "rise" | "fade" | "scale" | "slide" | "bloom" | "none";

export const POPUP_MOTIONS: { id: PopupMotion; label: string; detail: string }[] = [
  { id: "rise", label: "עולה", detail: "עולה בעדינות מלמטה" },
  { id: "fade", label: "דהייה", detail: "מופיעה ונעלמת בשקיפות" },
  { id: "scale", label: "נפתחת", detail: "גדלה מעט אל המרכז" },
  { id: "slide", label: "גולשת", detail: "נכנסת מהצד" },
  { id: "bloom", label: "רכה", detail: "נפתחת ועולה יחד" },
  { id: "none", label: "בלי תנועה", detail: "מופיעה מיד" },
];

type PopupBlockBase =
  | { id: string; type: "heading"; text: string; color: string; size: number; align: PopupAlign; font: PopupTextFont; weight: PopupTextWeight; span: PopupSpan }
  | { id: string; type: "text"; text: string; color: string; size: number; align: PopupAlign; font: PopupTextFont; weight: PopupTextWeight; span: PopupSpan }
  | { id: string; type: "image"; src: string; alt: string; radius: number; width: number; fit: "cover" | "contain"; focus: "center" | "top" | "bottom"; frame: number; bleed: boolean; fade: number; fadeSide: number; span: PopupSpan; mobileSrc?: string }
  | { id: string; type: "logo"; src: string; width: number; align: PopupAlign; span: PopupSpan; mobileSrc?: string }
  | { id: string; type: "button"; label: string; href: string; action: "link" | "submit"; background: string; color: string; radius: number; span: PopupSpan }
  | { id: string; type: "field"; fieldType: PopupFieldType; label: string; name: string; placeholder: string; required: boolean; span: PopupSpan }
  | { id: string; type: "spacer"; height: number; span: PopupSpan }
  | { id: string; type: "row"; span: PopupSpan; columns: PopupColumn[] }
  | { id: string; type: "container"; span: PopupSpan; blocks: PopupBlock[] }
  | { id: string; type: "stack"; span: PopupSpan; direction: "row" | "column"; blocks: PopupBlock[] }
  | { id: string; type: "columns"; span: PopupSpan; columns: PopupColumn[] }
  | { id: string; type: "overlay"; span: PopupSpan; src: string; alt: string; mobileSrc?: string; blocks: PopupBlock[] }
  | { id: string; type: "badge"; span: PopupSpan; text: string }
  | { id: string; type: "divider"; span: PopupSpan }
  | { id: string; type: "icon"; span: PopupSpan; name: PopupIconName }
  | { id: string; type: "shape"; span: PopupSpan; kind: "rect" | "ellipse" | "line" };

export type PopupPhoneTune = {
  span?: PopupSpan;
  size?: number;
  color?: string;
  align?: PopupAlign;
  font?: PopupTextFont;
  weight?: PopupTextWeight;
  width?: number;
  radius?: number;
  fit?: "cover" | "contain";
  focus?: "center" | "top" | "bottom";
  frame?: number;
  bleed?: boolean;
  fade?: number;
  fadeSide?: number;
  height?: number;
  background?: string;
};

export type PopupBlock = PopupBlockBase & { style?: PopupStyle; mobile?: PopupStyle; phone?: PopupPhoneTune };

export type PopupLeaf = Exclude<PopupBlockBase, { type: "row" | "container" | "stack" | "columns" | "overlay" }> & { style?: PopupStyle; mobile?: PopupStyle; phone?: PopupPhoneTune };

export type PopupColumn = { id: string; width: number; blocks: PopupBlock[]; mobileOrder?: number; phoneWidth?: number };

const MIN_COLUMN = 15;

export type PopupMobile = {
  layout: "same" | PopupLayout;
  width: number;
  radius: number;
  padding: number;
  gap: number;
  media: "same" | "stack" | "hide";
  columns: "same" | "stack";
  tuned: boolean;
  closeSize: number;
  closePlace: "same" | PopupClosePlace;
  closeColor: string;
  background: string;
  overlay: number;
  submitBackground: string;
  submitColor: string;
  height: number;
  imageFade: number;
  imageWash: string;
  imageWashOpacity: number;
  motion: "same" | PopupMotion;
};

export type PopupDesign = {
  layout: PopupLayout;
  width: number;
  radius: number;
  padding: number;
  gap: number;
  media: PopupMedia;
  mediaImage: string;
  background: string;
  backgroundImage: string;
  height: number;
  imageFade: number;
  imageWash: string;
  imageWashOpacity: number;
  motion: PopupMotion;
  overlay: number;
  closeOnOverlay: boolean;
  closeColor: string;
  closeSize: number;
  closePlace: PopupClosePlace;
  mobile: PopupMobile;
  submitLabel: string;
  submitBackground: string;
  submitColor: string;
  successTitle: string;
  successText: string;
  couponCode: string;
  blocks: PopupBlock[];
};

export type PopupPages = {
  all: boolean;
  home: boolean;
  product: boolean;
  catalog: boolean;
  checkout: boolean;
  content: boolean;
  paths: string[];
};

export type PopupTargeting = {
  pages: PopupPages;
  trigger: PopupTrigger;
  delaySeconds: number;
  scrollPercent: number;
  frequency: PopupFrequency;
  device: PopupDevice;
};

export type StorePopup = {
  id: string;
  name: string;
  status: PopupStatus;
  design: PopupDesign;
  targeting: PopupTargeting;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  leadCount: number;
};

export type PopupLead = {
  id: string;
  pagePath: string;
  fields: Record<string, string>;
  createdAt: string;
};

const field = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";
const area = "mt-1 w-full rounded-[10px] border border-[#c9c9c9] p-2 font-normal";

export const popupFieldClass = field;
export const popupAreaClass = area;

const BLOCK_LABELS: Record<PopupBlock["type"], string> = {
  heading: "כותרת",
  text: "טקסט",
  image: "תמונה",
  logo: "לוגו",
  button: "כפתור",
  field: "שדה",
  spacer: "רווח",
  row: "שורה",
  container: "קבוצה",
  stack: "סידור",
  columns: "עמודות",
  overlay: "תמונה עם תוכן",
  badge: "תגית",
  divider: "קו",
  icon: "אייקון",
  shape: "צורה",
};

export function popupBlockLabel(type: PopupBlock["type"]) {
  return BLOCK_LABELS[type];
}

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

function client() {
  return createSupabaseBrowserClient();
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function hex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, max) : "";
}

function textFont(value: unknown): PopupTextFont {
  return value === "heebo" || value === "frank" ? value : "inherit";
}

function textWeight(value: unknown, fallback: PopupTextWeight): PopupTextWeight {
  if (value === "bold" || value === "semibold" || value === "medium" || value === "regular") return value;
  return fallback;
}

function align(value: unknown): PopupAlign {
  return value === "center" || value === "left" ? value : "right";
}

function logoAlign(value: unknown): PopupAlign {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function imageFit(row: Record<string, unknown>): "cover" | "contain" {
  if (row.fit === "contain" || row.fit === "cover") return row.fit;
  const style = row.style && typeof row.style === "object" ? row.style as Record<string, unknown> : null;
  return style?.fit === "contain" ? "contain" : "cover";
}

function imageFocus(value: unknown): "center" | "top" | "bottom" {
  return value === "top" || value === "bottom" ? value : "center";
}

function blockSpan(value: unknown): PopupSpan {
  return value === "half" ? "half" : "full";
}

export function defaultMobile(): PopupMobile {
  return { layout: "same", width: 0, radius: -1, padding: -1, gap: -1, media: "stack", columns: "stack", tuned: false, closeSize: 0, closePlace: "same", closeColor: "", background: "", overlay: -1, submitBackground: "", submitColor: "", height: -1, imageFade: -1, imageWash: "same", imageWashOpacity: -1, motion: "same" };
}

export function popupMotionOf(value: unknown): PopupMotion {
  return value === "fade" || value === "scale" || value === "slide" || value === "bloom" || value === "none" || value === "rise" ? value : "rise";
}

export function popupLook(design: PopupDesign, device: "desktop" | "mobile") {
  const mobile = device === "mobile";
  const phone = design.mobile;
  const media = !mobile || phone.media === "same" ? design.media : phone.media === "hide" ? "none" : design.media;
  return {
    layout: mobile && phone.layout !== "same" ? phone.layout : design.layout,
    width: mobile && phone.width > 0 ? phone.width : mobile ? Math.min(design.width, 360) : design.width,
    radius: mobile && phone.radius >= 0 ? phone.radius : design.radius,
    padding: mobile && phone.padding >= 0 ? phone.padding : design.padding,
    gap: mobile && phone.gap >= 0 ? phone.gap : design.gap,
    media,
    mediaImage: design.mediaImage,
    stackColumns: mobile && phone.columns === "stack",
    stackMedia: mobile && phone.media === "stack" && design.media !== "none" && Boolean(design.mediaImage),
    background: mobile && phone.background ? phone.background : design.background,
    closeColor: mobile && phone.closeColor ? phone.closeColor : design.closeColor,
    closeSize: mobile && phone.closeSize > 0 ? phone.closeSize : design.closeSize,
    closePlace: mobile && phone.closePlace !== "same" ? phone.closePlace : design.closePlace,
    overlay: mobile && phone.overlay >= 0 ? phone.overlay : design.overlay,
    submitBackground: mobile && phone.submitBackground ? phone.submitBackground : design.submitBackground,
    submitColor: mobile && phone.submitColor ? phone.submitColor : design.submitColor,
    height: mobile && phone.height >= 0 ? phone.height : design.height,
    imageFade: mobile && phone.imageFade >= 0 ? phone.imageFade : design.imageFade,
    imageWash: mobile && phone.imageWash !== "same" ? phone.imageWash : design.imageWash,
    imageWashOpacity: mobile && phone.imageWashOpacity >= 0 ? phone.imageWashOpacity : design.imageWashOpacity,
    motion: mobile && phone.motion !== "same" ? phone.motion : design.motion,
    backgroundImage: design.backgroundImage,
  };
}

function cleanPaths(value: unknown) {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const path = item.trim().split("?")[0]?.split("#")[0] ?? "";
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 120 || /\s/.test(path)) continue;
    if (!paths.includes(path)) paths.push(path);
    if (paths.length >= 20) break;
  }
  return paths;
}

function fieldName(value: unknown, fallback: string) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z][a-z0-9_]{0,31}$/.test(name) ? name : fallback;
}

function cleanHref(value: unknown) {
  const href = text(value, 300).trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (/^tel:\+?[0-9-]{6,20}$/i.test(href)) return href;
  return "";
}

function cleanImage(value: unknown) {
  const src = text(value, 500).trim();
  return /^https:\/\/[^\s"'()<>]+$/i.test(src) ? src : "";
}

function withoutImageBox(style: PopupBlock["style"]) {
  if (!style) return undefined;
  const next = { ...style };
  delete next.radius;
  delete next.height;
  delete next.background;
  return Object.keys(next).length ? next : undefined;
}

function releaseImageFrame(block: PopupBlock): PopupBlock {
  if (block.type !== "image") return block;
  const legacy = block.style?.radius != null || block.style?.height != null || Boolean(block.style?.background) || block.mobile?.radius != null || block.mobile?.height != null || Boolean(block.mobile?.background);
  if (!legacy) return block;
  const style = withoutImageBox(block.style);
  const mobile = withoutImageBox(block.mobile);
  const { style: _style, mobile: _mobile, ...rest } = block;
  return { ...rest, radius: block.radius === 12 ? 0 : block.radius, ...(style ? { style } : {}), ...(mobile ? { mobile } : {}) };
}

function cleanPhone(value: unknown): PopupPhoneTune | undefined {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!row) return undefined;
  const tune: PopupPhoneTune = {};
  if (row.span === "full" || row.span === "half") tune.span = row.span;
  if (typeof row.size === "number") tune.size = clamp(row.size, 12, 48, 15);
  const color = hex(row.color, "");
  if (color) tune.color = color;
  if (row.align === "right" || row.align === "center" || row.align === "left") tune.align = row.align;
  if (row.font === "inherit" || row.font === "heebo" || row.font === "frank") tune.font = row.font;
  if (row.weight === "regular" || row.weight === "medium" || row.weight === "semibold" || row.weight === "bold") tune.weight = row.weight;
  if (typeof row.width === "number") tune.width = clamp(row.width, 10, 220, 100);
  if (typeof row.radius === "number") tune.radius = row.radius === 999 ? 999 : clamp(row.radius, 0, 40, 0);
  if (row.fit === "cover" || row.fit === "contain") tune.fit = row.fit;
  if (row.focus === "center" || row.focus === "top" || row.focus === "bottom") tune.focus = row.focus;
  if (typeof row.frame === "number") tune.frame = clamp(row.frame, 0, 480, 0);
  if (typeof row.bleed === "boolean") tune.bleed = row.bleed;
  if (typeof row.fade === "number") tune.fade = clamp(row.fade, 0, 80, 0);
  if (typeof row.fadeSide === "number") tune.fadeSide = clamp(row.fadeSide, 0, 80, 0);
  if (typeof row.height === "number") tune.height = clamp(row.height, 4, 80, 16);
  const background = hex(row.background, "");
  if (background) tune.background = background;
  return Object.keys(tune).length ? tune : undefined;
}

function styled(block: PopupBlock, row: Record<string, unknown>): PopupBlock {
  const style = cleanPopupStyle(row.style);
  const mobile = cleanPopupStyle(row.mobile);
  const phone = cleanPhone(row.phone);
  return { ...block, ...(style ? { style } : {}), ...(mobile ? { mobile } : {}), ...(phone ? { phone } : {}) };
}

function cleanColumns(value: unknown, index: number, depth: number, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const column = entry as Record<string, unknown>;
    const blocks = Array.isArray(column.blocks) ? column.blocks.flatMap((child, childIndex) => {
      const next = cleanBlock(child, childIndex, depth + 1);
      return next ? [next] : [];
    }).slice(0, 8) : [];
    const columnId = typeof column.id === "string" && column.id.trim() ? column.id.slice(0, 80) : `column-${index}`;
    const mobileOrder = clamp(column.mobileOrder, -5, 20, Number.NaN);
    const phoneWidth = typeof column.phoneWidth === "number" ? clamp(column.phoneWidth, MIN_COLUMN, 100, 0) : 0;
    return [{ id: columnId, width: clamp(column.width, MIN_COLUMN, 100, 0), blocks, ...(Number.isFinite(mobileOrder) ? { mobileOrder } : {}), ...(phoneWidth > 0 ? { phoneWidth } : {}) }];
  }).slice(0, limit);
}

function cleanChildren(value: unknown, depth: number) {
  if (!Array.isArray(value) || depth > 4) return [];
  return value.flatMap((child, index) => {
    const next = cleanBlock(child, index, depth);
    return next ? [next] : [];
  }).slice(0, 8);
}

function cleanBlock(value: unknown, index: number, depth = 0): PopupBlock | null {
  if (!value || typeof value !== "object" || depth > 4) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 80) : `block-${index}`;
  if (row.type === "row" || row.type === "columns") {
    const columns = cleanColumns(row.columns, index, depth, row.type === "columns" ? 3 : 4);
    if (!columns.length) return null;
    return styled({ id, type: row.type, span: "full", columns: fitColumnWidths(columns) }, row);
  }
  if (row.type === "container") {
    return styled({ id, type: "container", span: "full", blocks: cleanChildren(row.blocks, depth + 1) }, row);
  }
  if (row.type === "stack") {
    return styled({ id, type: "stack", span: "full", direction: row.direction === "row" ? "row" : "column", blocks: cleanChildren(row.blocks, depth + 1) }, row);
  }
  if (row.type === "overlay") {
    const mobileSrc = cleanImage(row.mobileSrc);
    return styled({
      id,
      type: "overlay",
      span: "full",
      src: cleanImage(row.src),
      alt: text(row.alt, 120),
      ...(mobileSrc ? { mobileSrc } : {}),
      blocks: cleanChildren(row.blocks, depth + 1),
    }, row);
  }
  if (row.type === "badge") return styled({ id, type: "badge", span: "full", text: text(row.text, 40) || "מבצע" }, row);
  if (row.type === "divider") return styled({ id, type: "divider", span: "full" }, row);
  if (row.type === "icon") {
    const name = row.name === "gift" || row.name === "star" || row.name === "check" || row.name === "mail" || row.name === "heart" || row.name === "leaf" || row.name === "spark" ? row.name : "spark";
    return styled({ id, type: "icon", span: "full", name }, row);
  }
  if (row.type === "shape") {
    const kind = row.kind === "ellipse" || row.kind === "line" ? row.kind : "rect";
    return styled({ id, type: "shape", span: "full", kind }, row);
  }
  if (row.type === "heading") {
    return styled({
      id,
      type: "heading",
      text: text(row.text, 160),
      color: hex(row.color, "#1a1a1a"),
      size: clamp(row.size, 16, 48, 28),
      align: align(row.align),
      font: textFont(row.font),
      weight: row.weight === "regular" ? "medium" : textWeight(row.weight, "bold"),
      span: blockSpan(row.span),
    }, row);
  }
  if (row.type === "text") {
    return styled({ id, type: "text", text: text(row.text, 800), color: hex(row.color, "#4a4a4a"), size: clamp(row.size, 12, 24, 15), align: align(row.align), font: textFont(row.font), weight: textWeight(row.weight, "regular"), span: blockSpan(row.span) }, row);
  }
  if (row.type === "image") {
    const mobileSrc = cleanImage(row.mobileSrc);
    const drafted = styled({ id, type: "image", src: cleanImage(row.src), alt: text(row.alt, 120), radius: clamp(row.radius, 0, 40, 0), width: clamp(row.width, 10, 100, 100), fit: imageFit(row), focus: imageFocus(row.focus), frame: clamp(row.frame, 0, 480, 0), bleed: row.bleed === true, fade: clamp(row.fade, 0, 80, 0), fadeSide: clamp(row.fadeSide, 0, 80, 0), span: blockSpan(row.span), ...(mobileSrc ? { mobileSrc } : {}) }, row);
    return drafted.type === "image" ? releaseImageFrame(drafted) : drafted;
  }
  if (row.type === "logo") {
    const mobileSrc = cleanImage(row.mobileSrc);
    return styled({ id, type: "logo", src: cleanImage(row.src), width: clamp(row.width, 24, 220, 112), align: logoAlign(row.align), span: blockSpan(row.span), ...(mobileSrc ? { mobileSrc } : {}) }, row);
  }
  if (row.type === "button") {
    return styled({
      id,
      type: "button",
      label: text(row.label, 40) || "לחצו כאן",
      href: cleanHref(row.href),
      action: row.action === "submit" ? "submit" : "link",
      background: hex(row.background, "#1a1a1a"),
      color: hex(row.color, "#ffffff"),
      radius: row.radius === 999 ? 999 : clamp(row.radius, 0, 28, 12),
      span: blockSpan(row.span),
    }, row);
  }
  if (row.type === "field") {
    const fieldType: PopupFieldType = row.fieldType === "email" || row.fieldType === "tel" || row.fieldType === "textarea" || row.fieldType === "checkbox" || row.fieldType === "consent" ? row.fieldType : "text";
    const fallback = fieldType === "email" ? "email" : fieldType === "tel" ? "phone" : fieldType === "textarea" ? "note" : fieldType === "checkbox" ? "check" : fieldType === "consent" ? "consent" : "name";
    return styled({
      id,
      type: "field",
      fieldType,
      label: text(row.label, 80),
      name: fieldName(row.name, fallback),
      placeholder: text(row.placeholder, 80),
      required: row.required !== false,
      span: blockSpan(row.span),
    }, row);
  }
  if (row.type === "spacer") return styled({ id, type: "spacer", height: clamp(row.height, 4, 80, 16), span: blockSpan(row.span) }, row);
  return null;
}

export type FieldPreset = "email" | "phone" | "name" | "note" | "custom" | "check";

const FIELD_PRESETS: Record<FieldPreset, { label: string; fieldType: PopupFieldType; name: string; placeholder: string }> = {
  email: { label: "אימייל", fieldType: "email", name: "email", placeholder: "name@email.com" },
  phone: { label: "טלפון", fieldType: "tel", name: "phone", placeholder: "050-0000000" },
  name: { label: "שם", fieldType: "text", name: "name", placeholder: "השם שלכם" },
  note: { label: "הודעה", fieldType: "textarea", name: "note", placeholder: "כתבו כאן" },
  custom: { label: "שאלה", fieldType: "text", name: "custom", placeholder: "" },
  check: { label: "אני מאשר/ת", fieldType: "checkbox", name: "check", placeholder: "" },
};

export const FIELD_PRESET_LABELS: Record<FieldPreset, string> = {
  email: "אימייל",
  phone: "טלפון",
  name: "שם",
  note: "הודעה",
  custom: "שאלה חופשית",
  check: "צ'קבוקס",
};

function uniqueFieldName(base: string, blocks: PopupBlock[]) {
  const used = new Set(leafBlocks(blocks).flatMap((block) => (block.type === "field" ? [block.name] : [])));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function fieldPreset(block: Extract<PopupBlock, { type: "field" }>): FieldPreset {
  if (block.fieldType === "email") return "email";
  if (block.fieldType === "tel") return "phone";
  if (block.fieldType === "textarea") return "note";
  if (block.fieldType === "checkbox" || block.fieldType === "consent") return "check";
  if (block.name === "name" || block.name.startsWith("name_")) return "name";
  return "custom";
}

export function blankField(preset: FieldPreset, blocks: PopupBlock[] = []): Extract<PopupBlock, { type: "field" }> {
  const recipe = FIELD_PRESETS[preset];
  return {
    id: crypto.randomUUID(),
    type: "field",
    fieldType: recipe.fieldType,
    label: recipe.label,
    name: uniqueFieldName(recipe.name, blocks),
    placeholder: recipe.placeholder,
    required: preset !== "custom" && preset !== "check",
    span: "full",
  };
}

export function blankBlock(type: PopupBlock["type"], blocks: PopupBlock[] = []): PopupBlock {
  const id = crypto.randomUUID();
  if (type === "heading") return { id, type, text: "כותרת", color: "#1a1a1a", size: 28, align: "center", font: "inherit", weight: "bold", span: "full" };
  if (type === "text") return { id, type, text: "כאן נכנס המשפט שמופיע מתחת לכותרת.", color: "#4a4a4a", size: 15, align: "center", font: "inherit", weight: "regular", span: "full" };
  if (type === "image") return { id, type, src: "", alt: "", radius: 0, width: 100, fit: "cover", focus: "center", frame: 0, bleed: false, fade: 0, fadeSide: 0, span: "full" };
  if (type === "logo") return { id, type, src: "", width: 112, align: "center", span: "full" };
  if (type === "button") return { id, type, label: "לחנות", href: "/products", action: "link", background: "#1a1a1a", color: "#ffffff", radius: 999, span: "full" };
  if (type === "spacer") return { id, type, height: 16, span: "full" };
  if (type === "row") return blankRow();
  return { ...blankField("email", blocks), id };
}

function areaCopy(): PopupLeaf {
  return { id: crypto.randomUUID(), type: "text", text: "אזור חדש. כאן אפשר טקסט, תמונה או כל דבר אחר.", color: "#4a4a4a", size: 15, align: "center", font: "inherit", weight: "regular", span: "full" };
}

export function blankRow(): Extract<PopupBlock, { type: "row" }> {
  return { id: crypto.randomUUID(), type: "row", span: "full", columns: fitColumnWidths([{ id: crypto.randomUUID(), width: 50, blocks: [areaCopy()] }, { id: crypto.randomUUID(), width: 50, blocks: [areaCopy()] }]) };
}

export function columnGrid(columns: { width: number }[], stack: boolean) {
  if (stack || columns.length < 2) return "minmax(0,1fr)";
  return columns.map((column) => `minmax(0,${Math.max(1, column.width)}fr)`).join(" ");
}

function equalWidths(count: number) {
  const each = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? 100 - each * (count - 1) : each));
}

export function fitColumnWidths(columns: PopupColumn[]): PopupColumn[] {
  if (columns.length <= 1) return columns.map((column) => ({ ...column, width: 100 }));
  const known = columns.map((column) => (column.width > 0 ? column.width : 0));
  const blanks = known.filter((width) => width === 0).length;
  const share = Math.floor(100 / columns.length);
  const seeded = blanks === columns.length ? equalWidths(columns.length) : blanks === 0 ? known : known.map((width) => width || share);
  const seededTotal = seeded.reduce((sum, width) => sum + width, 0) || 1;
  const base = seeded.map((width) => (width / seededTotal) * 100);
  const total = base.reduce((sum, width) => sum + width, 0) || 1;
  const scaled = base.map((width) => Math.max(MIN_COLUMN, Math.round((width / total) * 100)));
  let sum = scaled.reduce((totalWidth, width) => totalWidth + width, 0);
  let guard = 0;
  while (sum !== 100 && guard < 40) {
    const step = sum > 100 ? -1 : 1;
    let pick = scaled.findIndex((width) => (step < 0 ? width > MIN_COLUMN : true));
    if (pick < 0) break;
    scaled.forEach((width, index) => {
      if (step < 0 && width > scaled[pick]!) pick = index;
      if (step > 0 && width < scaled[pick]!) pick = index;
    });
    if (step < 0 && scaled[pick]! <= MIN_COLUMN) break;
    scaled[pick] = scaled[pick]! + step;
    sum += step;
    guard += 1;
  }
  return columns.map((column, index) => ({ ...column, width: scaled[index] ?? column.width }));
}

export function setColumnWidth(blocks: PopupBlock[], columnId: string, width: number, phone = false): PopupBlock[] {
  return blocks.map((block) => {
    if (block.type !== "row") return block;
    const index = block.columns.findIndex((column) => column.id === columnId);
    if (index < 0 || block.columns.length < 2) return block;
    const min = MIN_COLUMN;
    const nextWidth = Math.max(min, Math.min(100 - min * (block.columns.length - 1), Math.round(width)));
    const basis = block.columns.map((column) => ({ ...column, width: phone ? column.phoneWidth || column.width : column.width }));
    const current = fitColumnWidths(basis);
    const otherSum = current.reduce((sum, column, columnIndex) => (columnIndex === index ? sum : sum + column.width), 0) || 1;
    const rest = 100 - nextWidth;
    const columns = current.map((column, columnIndex) => (
      columnIndex === index ? { ...column, width: nextWidth } : { ...column, width: Math.max(min, Math.round((column.width / otherSum) * rest)) }
    ));
    const drift = 100 - columns.reduce((sum, column) => sum + column.width, 0);
    const fixAt = columns.findIndex((column, columnIndex) => columnIndex !== index && column.width + drift >= min);
    if (fixAt >= 0) columns[fixAt] = { ...columns[fixAt]!, width: columns[fixAt]!.width + drift };
    if (!phone) return { ...block, columns };
    return { ...block, columns: block.columns.map((column, columnIndex) => ({ ...column, phoneWidth: columns[columnIndex]?.width ?? column.phoneWidth ?? column.width })) };
  });
}

function detachLeaf(blocks: PopupBlock[], id: string): { blocks: PopupBlock[]; leaf: PopupBlock | null; rootIndex: number } {
  let leaf: PopupBlock | null = null;
  let rootIndex = -1;
  const next: PopupBlock[] = [];
  blocks.forEach((block, index) => {
    if (block.id === id && block.type !== "row" && block.type !== "columns" && block.type !== "container" && block.type !== "stack" && block.type !== "overlay") {
      leaf = block;
      rootIndex = index;
      return;
    }
    if ((block.type === "row" || block.type === "columns") && !leaf) {
      next.push({
        ...block,
        columns: block.columns.map((column) => ({
          ...column,
          blocks: column.blocks.filter((child) => {
            if (child.id !== id || leaf) return true;
            leaf = child;
            return false;
          }),
        })),
      });
      return;
    }
    next.push(block);
  });
  return { blocks: next, leaf, rootIndex };
}

export function insertLeaf(blocks: PopupBlock[], columnId: string, leaf: PopupBlock, index: number): PopupBlock[] {
  if (leaf.type === "row" || leaf.type === "columns" || leaf.type === "container" || leaf.type === "stack" || leaf.type === "overlay") return blocks;
  let placed = false;
  const next = blocks.map((block) => {
    if ((block.type !== "row" && block.type !== "columns") || placed) return block;
    return {
      ...block,
      columns: block.columns.map((column) => {
        if (column.id !== columnId) return column;
        placed = true;
        const items = [...column.blocks];
        items.splice(Math.max(0, Math.min(index, items.length)), 0, leaf);
        return { ...column, blocks: items };
      }),
    };
  });
  return placed ? next : [...blocks, leaf];
}

export function moveLeafInto(blocks: PopupBlock[], id: string, columnId: string, index: number): PopupBlock[] {
  let fromColumn = "";
  let fromIndex = -1;
  for (const block of blocks) {
    if (block.type !== "row" && block.type !== "columns") continue;
    for (const column of block.columns) {
      const at = column.blocks.findIndex((child) => child.id === id);
      if (at >= 0) {
        fromColumn = column.id;
        fromIndex = at;
      }
    }
  }
  const taken = detachLeaf(blocks, id);
  if (!taken.leaf || taken.leaf.type === "row" || taken.leaf.type === "columns" || taken.leaf.type === "container" || taken.leaf.type === "stack" || taken.leaf.type === "overlay") return blocks;
  const dest = fromColumn === columnId && fromIndex >= 0 && fromIndex < index ? index - 1 : index;
  return insertLeaf(taken.blocks, columnId, taken.leaf, dest);
}

export function moveLeafToRoot(blocks: PopupBlock[], id: string, index: number): PopupBlock[] {
  const taken = detachLeaf(blocks, id);
  if (!taken.leaf) return blocks;
  const dest = taken.rootIndex >= 0 && taken.rootIndex < index ? index - 1 : index;
  const list = [...taken.blocks];
  list.splice(Math.max(0, Math.min(dest, list.length)), 0, taken.leaf);
  return list;
}

export function moveColumn(blocks: PopupBlock[], columnId: string, toIndex: number): PopupBlock[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.type !== "row") return block;
    const from = block.columns.findIndex((column) => column.id === columnId);
    if (from < 0) return block;
    const columns = [...block.columns];
    const [item] = columns.splice(from, 1);
    if (!item) return block;
    const dest = Math.max(0, Math.min(toIndex, columns.length));
    if (dest === from) return block;
    changed = true;
    columns.splice(dest, 0, item);
    return { ...block, columns };
  });
  return changed ? next : blocks;
}

export function leafBlocks(blocks: PopupBlock[]): PopupLeaf[] {
  return blocks.flatMap((block) => {
    if (block.type === "row" || block.type === "columns") return block.columns.flatMap((column) => leafBlocks(column.blocks));
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") return leafBlocks(block.blocks);
    return [block];
  });
}

export function popupHasFields(blocks: PopupBlock[]): boolean {
  return leafBlocks(blocks).some((block) => block.type === "field");
}

export function arrangeAreas(blocks: PopupBlock[], side: "right" | "left" | "single"): PopupBlock[] {
  const flat = leafBlocks(blocks);
  if (side === "single") return flat.length ? flat : blocks;
  const content = flat.length ? flat : [areaCopy()];
  const area = { id: crypto.randomUUID(), width: 50, blocks: [areaCopy()] };
  const main = { id: crypto.randomUUID(), width: 50, blocks: content };
  return [{ id: crypto.randomUUID(), type: "row", span: "full", columns: fitColumnWidths(side === "right" ? [area, main] : [main, area]) }];
}

export function addArea(blocks: PopupBlock[], selectedId: string) {
  const columnId = crypto.randomUUID();
  const row = blocks.find((block) => block.type === "row" && (block.id === selectedId || block.columns.some((column) => column.id === selectedId || column.blocks.some((item) => item.id === selectedId))));
  if (!row || row.type !== "row") {
    const next = arrangeAreas(blocks, "right");
    const created = next[0];
    return { blocks: next, columnId: created && created.type === "row" ? created.columns[0].id : columnId };
  }
  if (row.columns.length >= 4) return { blocks, columnId: row.columns[row.columns.length - 1]?.id ?? columnId };
  return {
    columnId,
    blocks: blocks.map((block) => block.id === row.id && block.type === "row" ? { ...block, columns: fitColumnWidths([...block.columns, { id: columnId, width: 0, blocks: [areaCopy()] }]) } : block),
  };
}

function columnFor(blocks: PopupBlock[], selectedId: string) {
  for (const block of blocks) {
    if (block.type !== "row") continue;
    if (block.id === selectedId) return { rowId: block.id, columnId: block.columns[block.columns.length - 1]?.id ?? "" };
    for (const column of block.columns) {
      if (column.id === selectedId || column.blocks.some((item) => item.id === selectedId)) return { rowId: block.id, columnId: column.id };
    }
  }
  return null;
}

export function placeLeaf(blocks: PopupBlock[], selectedId: string, leaf: PopupLeaf) {
  const target = columnFor(blocks, selectedId);
  if (!target?.columnId) return [...blocks, leaf];
  return blocks.map((block) => block.type === "row" && block.id === target.rowId
    ? { ...block, columns: block.columns.map((column) => column.id === target.columnId ? { ...column, blocks: [...column.blocks, leaf] } : column) }
    : block);
}

function visualTune(block: PopupBlock): PopupPhoneTune {
  const tune: PopupPhoneTune = { span: block.span };
  if (block.type === "heading" || block.type === "text") {
    tune.size = block.size;
    tune.color = block.color;
    tune.align = block.align;
    tune.font = block.font;
    tune.weight = block.weight;
  } else if (block.type === "image") {
    tune.width = block.width;
    tune.radius = block.radius;
    tune.fit = block.fit;
    tune.focus = block.focus;
    tune.frame = block.frame;
    tune.bleed = block.bleed;
    tune.fade = block.fade;
    tune.fadeSide = block.fadeSide;
  } else if (block.type === "logo") {
    tune.width = block.width;
    tune.align = block.align;
  } else if (block.type === "button") {
    tune.background = block.background;
    tune.color = block.color;
    tune.radius = block.radius;
  } else if (block.type === "spacer") {
    tune.height = block.height;
  }
  return tune;
}

function applyTune(block: PopupBlock, tune: PopupPhoneTune): PopupBlock {
  const span = tune.span ?? block.span;
  if (block.type === "heading" || block.type === "text") {
    return { ...block, span, size: tune.size ?? block.size, color: tune.color ?? block.color, align: tune.align ?? block.align, font: tune.font ?? block.font, weight: tune.weight ?? block.weight };
  }
  if (block.type === "image") {
    return { ...block, span, width: tune.width ?? block.width, radius: tune.radius ?? block.radius, fit: tune.fit ?? block.fit, focus: tune.focus ?? block.focus, frame: tune.frame ?? block.frame, bleed: tune.bleed ?? block.bleed, fade: tune.fade ?? block.fade, fadeSide: tune.fadeSide ?? block.fadeSide };
  }
  if (block.type === "logo") return { ...block, span, width: tune.width ?? block.width, align: tune.align ?? block.align };
  if (block.type === "button") return { ...block, span, background: tune.background ?? block.background, color: tune.color ?? block.color, radius: tune.radius ?? block.radius };
  if (block.type === "spacer") return { ...block, span, height: tune.height ?? block.height };
  return { ...block, span };
}

function withContent(stored: PopupBlock, next: PopupBlock): PopupBlock {
  if (stored.type === "heading" && next.type === "heading") return { ...stored, text: next.text };
  if (stored.type === "text" && next.type === "text") return { ...stored, text: next.text };
  if (stored.type === "image" && next.type === "image") return { ...stored, src: next.src, alt: next.alt, ...(next.mobileSrc ? { mobileSrc: next.mobileSrc } : {}) };
  if (stored.type === "logo" && next.type === "logo") return { ...stored, src: next.src };
  if (stored.type === "button" && next.type === "button") return { ...stored, label: next.label, href: next.href, action: next.action };
  if (stored.type === "field" && next.type === "field") return { ...stored, fieldType: next.fieldType, label: next.label, name: next.name, placeholder: next.placeholder, required: next.required };
  return stored;
}

function sealBlocks(blocks: PopupBlock[]): PopupBlock[] {
  return blocks.map((block) => {
    if (block.type === "row" || block.type === "columns") {
      return { ...block, columns: block.columns.map((column) => ({ ...column, phoneWidth: column.phoneWidth || column.width, blocks: sealBlocks(column.blocks) })) };
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      const next = { ...block, blocks: sealBlocks(block.blocks) };
      return next.phone ? next : { ...next, phone: visualTune(next) };
    }
    return block.phone ? block : { ...block, phone: visualTune(block) };
  });
}

function clearBlocks(blocks: PopupBlock[]): PopupBlock[] {
  return blocks.map((block) => {
    if (block.type === "row" || block.type === "columns") {
      return { ...block, columns: block.columns.map(({ phoneWidth: _phoneWidth, ...column }) => ({ ...column, blocks: clearBlocks(column.blocks) })) };
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      const { phone: _phone, ...rest } = block;
      return { ...rest, blocks: clearBlocks(block.blocks) };
    }
    const { phone: _phone, ...rest } = block;
    return rest;
  });
}

export function blockOnDevice(block: PopupBlock, device: "desktop" | "mobile"): PopupBlock {
  if (block.type === "row" || block.type === "columns") {
    return {
      ...block,
      columns: block.columns.map((column) => ({
        ...column,
        width: device === "mobile" && column.phoneWidth ? column.phoneWidth : column.width,
        blocks: column.blocks.map((child) => blockOnDevice(child, device)),
      })),
    };
  }
  if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
    return { ...block, blocks: block.blocks.map((child) => blockOnDevice(child, device)) };
  }
  if (device === "desktop" || !block.phone) return block;
  return applyTune(block, block.phone);
}

export function sealPhoneDesign(design: PopupDesign): PopupDesign {
  if (design.mobile.tuned) return design;
  return {
    ...design,
    blocks: sealBlocks(design.blocks),
    mobile: {
      ...design.mobile,
      tuned: true,
      closeSize: design.mobile.closeSize > 0 ? design.mobile.closeSize : design.closeSize,
      closePlace: design.mobile.closePlace !== "same" ? design.mobile.closePlace : design.closePlace,
      closeColor: design.mobile.closeColor || design.closeColor,
      background: design.mobile.background || design.background,
      overlay: design.mobile.overlay >= 0 ? design.mobile.overlay : design.overlay,
      submitBackground: design.mobile.submitBackground || design.submitBackground,
      submitColor: design.mobile.submitColor || design.submitColor,
      height: design.mobile.height >= 0 ? design.mobile.height : design.height,
      imageFade: design.mobile.imageFade >= 0 ? design.mobile.imageFade : design.imageFade,
      imageWash: design.mobile.imageWash !== "same" ? design.mobile.imageWash : design.imageWash,
      imageWashOpacity: design.mobile.imageWashOpacity >= 0 ? design.mobile.imageWashOpacity : design.imageWashOpacity,
    },
  };
}

export function clearPhoneDesign(design: PopupDesign): PopupDesign {
  return {
    ...design,
    blocks: clearBlocks(design.blocks),
    mobile: defaultMobile(),
  };
}

export function writeBlockForDevice(design: PopupDesign, next: PopupBlock, device: "desktop" | "mobile"): PopupDesign {
  const base = device === "mobile" ? sealPhoneDesign(design) : design;
  const blocks = base.blocks.map(function visit(block): PopupBlock {
    if (block.id === next.id) {
      if (block.type !== next.type) return next;
      if (device === "desktop") return { ...next, ...(block.phone ? { phone: block.phone } : {}) };
      return { ...withContent(block, next), phone: visualTune(next) };
    }
    if (block.type === "row" || block.type === "columns") {
      return { ...block, columns: block.columns.map((column) => ({ ...column, blocks: column.blocks.map(visit) })) };
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      return { ...block, blocks: block.blocks.map(visit) };
    }
    return block;
  });
  return { ...base, blocks };
}

export function writeWindowForDevice(design: PopupDesign, patch: Partial<PopupDesign>, device: "desktop" | "mobile"): PopupDesign {
  if (device === "desktop") return { ...design, ...patch };
  const sealed = sealPhoneDesign(design);
  const mobile = { ...sealed.mobile };
  if (patch.background) mobile.background = patch.background;
  if (patch.closeColor) mobile.closeColor = patch.closeColor;
  if (typeof patch.closeSize === "number") mobile.closeSize = patch.closeSize;
  if (patch.closePlace) mobile.closePlace = patch.closePlace;
  if (typeof patch.overlay === "number") mobile.overlay = patch.overlay;
  if (patch.submitBackground) mobile.submitBackground = patch.submitBackground;
  if (patch.submitColor) mobile.submitColor = patch.submitColor;
  if (typeof patch.height === "number") mobile.height = patch.height;
  if (typeof patch.imageFade === "number") mobile.imageFade = patch.imageFade;
  if (patch.imageWash !== undefined) mobile.imageWash = patch.imageWash;
  if (typeof patch.imageWashOpacity === "number") mobile.imageWashOpacity = patch.imageWashOpacity;
  if (patch.motion) mobile.motion = patch.motion;
  const shared: Partial<PopupDesign> = {};
  if (patch.submitLabel !== undefined) shared.submitLabel = patch.submitLabel;
  if (patch.successTitle !== undefined) shared.successTitle = patch.successTitle;
  if (patch.successText !== undefined) shared.successText = patch.successText;
  if (patch.couponCode !== undefined) shared.couponCode = patch.couponCode;
  if (patch.closeOnOverlay !== undefined) shared.closeOnOverlay = patch.closeOnOverlay;
  if (patch.backgroundImage !== undefined) shared.backgroundImage = patch.backgroundImage;
  if (patch.mediaImage !== undefined) shared.mediaImage = patch.mediaImage;
  if (patch.media) shared.media = patch.media;
  return { ...sealed, ...shared, mobile };
}

export function replacePopupBlock(blocks: PopupBlock[], next: PopupBlock): PopupBlock[] {
  return blocks.map((block) => {
    if (block.id === next.id) return next;
    if (block.type === "row" || block.type === "columns") {
      return { ...block, columns: block.columns.map((column) => ({ ...column, blocks: replacePopupBlock(column.blocks, next) })) };
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      return { ...block, blocks: replacePopupBlock(block.blocks, next) };
    }
    return block;
  });
}

export function removePopupBlock(blocks: PopupBlock[], id: string): PopupBlock[] {
  const next: PopupBlock[] = [];
  for (const block of blocks) {
    if (block.id === id) continue;
    if (block.type === "row" || block.type === "columns") {
      const columns = fitColumnWidths(block.columns.filter((column) => column.id !== id).map((column) => ({ ...column, blocks: removePopupBlock(column.blocks, id) })));
      if (columns.length) next.push({ ...block, columns });
      continue;
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      next.push({ ...block, blocks: removePopupBlock(block.blocks, id) });
      continue;
    }
    next.push(block);
  }
  return next;
}

export function defaultDesign(): PopupDesign {
  return {
    layout: "modal",
    width: 420,
    radius: 24,
    padding: 28,
    gap: 12,
    media: "none",
    mediaImage: "",
    background: "#fffaf6",
    backgroundImage: "",
    height: 0,
    imageFade: 0,
    imageWash: "",
    imageWashOpacity: 0,
    motion: "rise",
    overlay: 46,
    closeOnOverlay: true,
    closeColor: "#1a1a1a",
    closeSize: 22,
    closePlace: "top-left",
    mobile: defaultMobile(),
    submitLabel: "שלחו לי",
    submitBackground: "#1a1a1a",
    submitColor: "#ffffff",
    successTitle: "קיבלנו",
    successText: "תודה, נחזור אלייך.",
    couponCode: "",
    blocks: [
      blankBlock("heading"),
      { id: crypto.randomUUID(), type: "text", text: "השאירו אימייל ונשלח הטבה להזמנה הבאה.", color: "#4a4a4a", size: 15, align: "center", font: "inherit", weight: "regular", span: "full" },
      blankBlock("field"),
    ],
  };
}

export function defaultTargeting(): PopupTargeting {
  return {
    pages: { all: false, home: true, product: false, catalog: false, checkout: false, content: false, paths: [] },
    trigger: "delay",
    delaySeconds: 5,
    scrollPercent: 40,
    frequency: "day",
    device: "all",
  };
}

export function blankPopup(): StorePopup {
  return {
    id: crypto.randomUUID(),
    name: "פופאפ חדש",
    status: "draft",
    design: defaultDesign(),
    targeting: defaultTargeting(),
    startsAt: null,
    endsAt: null,
    updatedAt: new Date().toISOString(),
    leadCount: 0,
  };
}

function normalizeMobile(value: unknown): PopupMobile {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = defaultMobile();
  const layout: PopupMobile["layout"] = row.layout === "modal" || row.layout === "bar" || row.layout === "corner" ? row.layout : "same";
  const media: PopupMobile["media"] = row.media === "same" || row.media === "hide" ? row.media : row.media === "stack" ? "stack" : base.media;
  const closePlace: PopupMobile["closePlace"] = row.closePlace === "top-left" || row.closePlace === "top-right" || row.closePlace === "bottom-left" || row.closePlace === "bottom-right" ? row.closePlace : "same";
  return {
    layout,
    width: clamp(row.width, 0, 480, 0),
    radius: typeof row.radius === "number" ? clamp(row.radius, 0, 40, 0) : -1,
    padding: typeof row.padding === "number" ? clamp(row.padding, 0, 64, 0) : -1,
    gap: typeof row.gap === "number" ? clamp(row.gap, 0, 40, 0) : -1,
    media,
    columns: row.columns === "same" ? "same" : "stack",
    tuned: row.tuned === true,
    closeSize: typeof row.closeSize === "number" ? clamp(row.closeSize, 14, 36, 0) : 0,
    closePlace,
    closeColor: hex(row.closeColor, ""),
    background: hex(row.background, ""),
    overlay: typeof row.overlay === "number" ? clamp(row.overlay, 0, 80, 0) : -1,
    submitBackground: hex(row.submitBackground, ""),
    submitColor: hex(row.submitColor, ""),
    height: typeof row.height === "number" ? clamp(row.height, 0, 960, -1) : -1,
    imageFade: typeof row.imageFade === "number" ? clamp(row.imageFade, 0, 100, -1) : -1,
    imageWash: row.imageWash == null || row.imageWash === "same" ? "same" : hex(row.imageWash, ""),
    imageWashOpacity: typeof row.imageWashOpacity === "number" ? clamp(row.imageWashOpacity, 0, 100, -1) : -1,
    motion: row.motion === "fade" || row.motion === "scale" || row.motion === "slide" || row.motion === "bloom" || row.motion === "none" || row.motion === "rise" ? row.motion : "same",
  };
}

export function normalizeDesign(value: unknown): PopupDesign {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = defaultDesign();
  const blocks = Array.isArray(row.blocks) ? row.blocks.flatMap((block, index) => {
    const next = cleanBlock(block, index);
    return next ? [next] : [];
  }).slice(0, 40) : base.blocks;
  const layout: PopupLayout = row.layout === "bar" || row.layout === "corner" ? row.layout : "modal";
  return {
    layout,
    width: clamp(row.width, 280, 1100, base.width),
    radius: clamp(row.radius, 0, 40, base.radius),
    padding: clamp(row.padding, 0, 64, base.padding),
    gap: clamp(row.gap, 0, 40, base.gap),
    media: row.media === "right" || row.media === "left" ? row.media : "none",
    mediaImage: cleanImage(row.mediaImage),
    background: hex(row.background, base.background),
    backgroundImage: cleanImage(row.backgroundImage),
    height: clamp(row.height, 0, 960, 0),
    imageFade: clamp(row.imageFade, 0, 100, 0),
    imageWash: hex(row.imageWash, ""),
    imageWashOpacity: clamp(row.imageWashOpacity, 0, 100, 0),
    motion: popupMotionOf(row.motion),
    overlay: clamp(row.overlay, 0, 80, base.overlay),
    closeOnOverlay: row.closeOnOverlay !== false,
    closeColor: hex(row.closeColor, base.closeColor),
    closeSize: clamp(row.closeSize, 14, 36, base.closeSize),
    closePlace: row.closePlace === "top-right" || row.closePlace === "bottom-left" || row.closePlace === "bottom-right" ? row.closePlace : "top-left",
    mobile: normalizeMobile(row.mobile),
    submitLabel: text(row.submitLabel, 40) || base.submitLabel,
    submitBackground: hex(row.submitBackground, base.submitBackground),
    submitColor: hex(row.submitColor, base.submitColor),
    successTitle: text(row.successTitle, 80) || base.successTitle,
    successText: text(row.successText, 240) || base.successText,
    couponCode: text(row.couponCode, 24).replace(/[^A-Za-z0-9-]/g, "").slice(0, 24),
    blocks: blocks.length ? blocks : base.blocks,
  };
}

export function normalizeTargeting(value: unknown): PopupTargeting {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pages = row.pages && typeof row.pages === "object" ? row.pages as Record<string, unknown> : {};
  const base = defaultTargeting();
  const trigger: PopupTrigger = row.trigger === "immediate" || row.trigger === "scroll" || row.trigger === "exit" ? row.trigger : "delay";
  const frequency: PopupFrequency = row.frequency === "always" || row.frequency === "session" || row.frequency === "once" ? row.frequency : "day";
  const device: PopupDevice = row.device === "desktop" || row.device === "mobile" ? row.device : "all";
  return {
    pages: {
      all: pages.all === true,
      home: pages.home === true,
      product: pages.product === true,
      catalog: pages.catalog === true,
      checkout: pages.checkout === true,
      content: pages.content === true,
      paths: cleanPaths(pages.paths),
    },
    trigger,
    delaySeconds: clamp(row.delaySeconds, 0, 180, base.delaySeconds),
    scrollPercent: clamp(row.scrollPercent, 5, 100, base.scrollPercent),
    frequency,
    device,
  };
}

function isoOrNull(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

type PopupRow = {
  id: string;
  name: string;
  status: string;
  design: unknown;
  targeting: unknown;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

function asPopup(row: PopupRow, leadCount = 0): StorePopup {
  const status: PopupStatus = row.status === "active" || row.status === "paused" ? row.status : "draft";
  return {
    id: row.id,
    name: text(row.name, 80) || "פופאפ",
    status,
    design: normalizeDesign(row.design),
    targeting: normalizeTargeting(row.targeting),
    startsAt: isoOrNull(row.starts_at),
    endsAt: isoOrNull(row.ends_at),
    updatedAt: row.updated_at,
    leadCount,
  };
}

export function validatePopup(popup: StorePopup) {
  if (!popup.name.trim()) throw new Error("חסר שם לפופאפ");
  if (!popup.design.blocks.length) throw new Error("הוסיפו לפחות בלוק אחד");
  const names = popup.design.blocks.flatMap((block) => (block.type === "field" ? [block.name] : []));
  if (new Set(names).size !== names.length) throw new Error("לכל שדה צריך שם שונה");
  const pages = popup.targeting.pages;
  const chosen = pages.all || pages.home || pages.product || pages.catalog || pages.checkout || pages.content || pages.paths.length > 0;
  if (!chosen) throw new Error("בחרו לפחות עמוד אחד");
  if (popup.startsAt && popup.endsAt && new Date(popup.endsAt).getTime() <= new Date(popup.startsAt).getTime()) {
    throw new Error("מועד הסיום צריך להיות אחרי ההתחלה");
  }
}

export function triggerLabel(popup: StorePopup) {
  if (popup.targeting.trigger === "immediate") return "מיד בכניסה";
  if (popup.targeting.trigger === "scroll") return `אחרי גלילה של ${popup.targeting.scrollPercent}%`;
  if (popup.targeting.trigger === "exit") return "כשעוזבים את העמוד";
  return popup.targeting.delaySeconds === 0 ? "מיד בכניסה" : `אחרי ${popup.targeting.delaySeconds} שניות`;
}

export function pagesLabel(popup: StorePopup) {
  const pages = popup.targeting.pages;
  if (pages.all) return "כל העמודים";
  const names: Record<string, string> = { "/events": "אירועים", "/contact": "צור קשר", "/stores": "חנויות", "/podcast": "פודקאסט" };
  const parts = [
    pages.home ? "דף הבית" : "",
    pages.product ? "כל המוצרים" : "",
    pages.catalog ? "החנות" : "",
    pages.checkout ? "תשלום" : "",
    pages.content ? "כל המאמרים" : "",
  ].filter(Boolean);
  let products = 0;
  let articles = 0;
  let events = 0;
  let other = 0;
  for (const path of pages.paths) {
    if (names[path]) {
      parts.push(names[path]);
      continue;
    }
    if (path.startsWith("/product/")) products += 1;
    else if (path.startsWith("/articles/") || path.startsWith("/journal/")) articles += 1;
    else if (path.startsWith("/events/")) events += 1;
    else other += 1;
  }
  if (products) parts.push(products === 1 ? "מוצר אחד" : `${products} מוצרים`);
  if (articles) parts.push(articles === 1 ? "מאמר אחד" : `${articles} מאמרים`);
  if (events) parts.push(events === 1 ? "אירוע אחד" : `${events} אירועים`);
  if (other) parts.push(other === 1 ? "עמוד אחד" : `${other} עמודים`);
  return parts.join(" · ") || "בלי עמוד";
}

export function statusLabel(status: PopupStatus) {
  if (status === "active") return "פעיל";
  if (status === "paused") return "מושהה";
  return "טיוטה";
}

export function frequencyLabel(frequency: PopupFrequency) {
  if (frequency === "always") return "בכל מעבר עמוד";
  if (frequency === "session") return "פעם בסשן";
  if (frequency === "once") return "פעם אחת";
  return "פעם ביום";
}

export async function listPopups(): Promise<StorePopup[]> {
  const supabase = client();
  const id = storeId();
  const { data, error } = await supabase
    .from("store_popups")
    .select("id, name, status, design, targeting, starts_at, ends_at, updated_at")
    .eq("store_id", id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PopupRow[];
  const counts = new Map<string, number>();
  if (rows.length) {
    const leads = await supabase.from("store_popup_leads").select("popup_id").eq("store_id", id);
    if (leads.error) throw new Error(leads.error.message);
    for (const lead of (leads.data ?? []) as Array<{ popup_id: string }>) {
      counts.set(lead.popup_id, (counts.get(lead.popup_id) ?? 0) + 1);
    }
  }
  return rows.map((row) => asPopup(row, counts.get(row.id) ?? 0));
}

export async function getPopup(popupId: string): Promise<StorePopup | null> {
  const rows = await listPopups();
  return rows.find((row) => row.id === popupId) ?? null;
}

export async function savePopup(input: StorePopup) {
  const popup: StorePopup = {
    ...input,
    name: input.name.trim().slice(0, 80),
    design: normalizeDesign(input.design),
    targeting: normalizeTargeting(input.targeting),
    startsAt: isoOrNull(input.startsAt),
    endsAt: isoOrNull(input.endsAt),
  };
  validatePopup(popup);
  const supabase = client();
  const id = storeId();
  const row = {
    id: popup.id,
    store_id: id,
    name: popup.name,
    status: popup.status,
    design: popup.design,
    targeting: popup.targeting,
    starts_at: popup.startsAt,
    ends_at: popup.endsAt,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("store_popups")
    .upsert(row, { onConflict: "id" })
    .select("id, name, status, design, targeting, starts_at, ends_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return asPopup(data as PopupRow, input.leadCount);
}

export async function deletePopup(popupId: string) {
  const supabase = client();
  const { error } = await supabase.from("store_popups").delete().eq("store_id", storeId()).eq("id", popupId);
  if (error) throw new Error(error.message);
}

export async function listPopupLeads(popupId: string): Promise<PopupLead[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from("store_popup_leads")
    .select("id, page_path, fields, created_at")
    .eq("store_id", storeId())
    .eq("popup_id", popupId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; page_path: string; fields: unknown; created_at: string }>).map((row) => {
    const fields: Record<string, string> = {};
    if (row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)) {
      for (const [key, value] of Object.entries(row.fields)) {
        if (typeof value === "string") fields[key] = value;
      }
    }
    return { id: row.id, pagePath: row.page_path, fields, createdAt: row.created_at };
  });
}

export async function uploadPopupImage(file: File) {
  const id = storeId();
  if (!file.type.startsWith("image/")) throw new Error("אפשר להעלות רק תמונה");
  if (file.size > 5 * 1024 * 1024) throw new Error("התמונה גדולה מ-5MB");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const kinds = ["jpg", "png", "webp", "gif", "avif"];
  if (!extension || !kinds.includes(extension)) throw new Error("אפשר לשמור רק תמונות jpg, png, webp, gif או avif");
  const path = `${id}/popups/${crypto.randomUUID()}.${extension}`;
  const supabase = client();
  const { error } = await supabase.storage.from("email-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("העלאת התמונה נכשלה");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/email-media/${path}`;
}
