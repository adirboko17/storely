import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type PopupAlign = "right" | "center" | "left";
export type PopupLayout = "modal" | "bar" | "corner";
export type PopupTrigger = "immediate" | "delay" | "scroll" | "exit";
export type PopupFrequency = "always" | "session" | "day" | "once";
export type PopupDevice = "all" | "desktop" | "mobile";
export type PopupStatus = "draft" | "active" | "paused";
export type PopupFieldType = "text" | "email" | "tel" | "textarea";
export type PopupClosePlace = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PopupSpan = "full" | "half";
export type PopupMedia = "none" | "right" | "left";

export type PopupBlock =
  | { id: string; type: "heading"; text: string; color: string; size: number; align: PopupAlign; weight: "regular" | "bold"; span: PopupSpan }
  | { id: string; type: "text"; text: string; color: string; size: number; align: PopupAlign; span: PopupSpan }
  | { id: string; type: "image"; src: string; alt: string; radius: number; width: number; span: PopupSpan }
  | { id: string; type: "logo"; src: string; width: number; span: PopupSpan }
  | { id: string; type: "button"; label: string; href: string; background: string; color: string; radius: number; span: PopupSpan }
  | { id: string; type: "field"; fieldType: PopupFieldType; label: string; name: string; placeholder: string; required: boolean; span: PopupSpan }
  | { id: string; type: "spacer"; height: number; span: PopupSpan }
  | { id: string; type: "row"; span: PopupSpan; columns: PopupColumn[] };

export type PopupLeaf = Exclude<PopupBlock, { type: "row" }>;

export type PopupColumn = { id: string; width: number; blocks: PopupLeaf[] };

const MIN_COLUMN = 15;

export type PopupMobile = {
  layout: "same" | PopupLayout;
  width: number;
  radius: number;
  padding: number;
  gap: number;
  media: "same" | "stack" | "hide";
  columns: "same" | "stack";
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

function align(value: unknown): PopupAlign {
  return value === "center" || value === "left" ? value : "right";
}

function blockSpan(value: unknown): PopupSpan {
  return value === "half" ? "half" : "full";
}

export function defaultMobile(): PopupMobile {
  return { layout: "same", width: 0, radius: -1, padding: -1, gap: -1, media: "stack", columns: "stack" };
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

function cleanBlock(value: unknown, index: number): PopupBlock | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 80) : `block-${index}`;
  if (row.type === "row") {
    const columns = Array.isArray(row.columns) ? row.columns.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const column = entry as Record<string, unknown>;
      const blocks = Array.isArray(column.blocks) ? column.blocks.flatMap((child, childIndex) => {
        const next = cleanBlock(child, childIndex);
        return next && next.type !== "row" ? [next] : [];
      }).slice(0, 8) : [];
      const columnId = typeof column.id === "string" && column.id.trim() ? column.id.slice(0, 80) : `column-${index}`;
      return [{ id: columnId, width: clamp(column.width, MIN_COLUMN, 100, 0), blocks }];
    }).slice(0, 4) : [];
    if (!columns.length) return null;
    return { id, type: "row", span: "full", columns: fitColumnWidths(columns) };
  }
  if (row.type === "heading") {
    return {
      id,
      type: "heading",
      text: text(row.text, 160),
      color: hex(row.color, "#1a1a1a"),
      size: clamp(row.size, 16, 48, 28),
      align: align(row.align),
      weight: row.weight === "regular" ? "regular" : "bold",
      span: blockSpan(row.span),
    };
  }
  if (row.type === "text") {
    return { id, type: "text", text: text(row.text, 800), color: hex(row.color, "#4a4a4a"), size: clamp(row.size, 12, 24, 15), align: align(row.align), span: blockSpan(row.span) };
  }
  if (row.type === "image") {
    return { id, type: "image", src: cleanImage(row.src), alt: text(row.alt, 120), radius: clamp(row.radius, 0, 40, 12), width: clamp(row.width, 30, 100, 100), span: blockSpan(row.span) };
  }
  if (row.type === "logo") {
    return { id, type: "logo", src: cleanImage(row.src), width: clamp(row.width, 48, 220, 112), span: blockSpan(row.span) };
  }
  if (row.type === "button") {
    return {
      id,
      type: "button",
      label: text(row.label, 40) || "לחצו כאן",
      href: cleanHref(row.href),
      background: hex(row.background, "#1a1a1a"),
      color: hex(row.color, "#ffffff"),
      radius: row.radius === 999 ? 999 : clamp(row.radius, 0, 28, 12),
      span: blockSpan(row.span),
    };
  }
  if (row.type === "field") {
    const fieldType: PopupFieldType = row.fieldType === "email" || row.fieldType === "tel" || row.fieldType === "textarea" ? row.fieldType : "text";
    const fallback = fieldType === "email" ? "email" : fieldType === "tel" ? "phone" : fieldType === "textarea" ? "note" : "name";
    return {
      id,
      type: "field",
      fieldType,
      label: text(row.label, 60),
      name: fieldName(row.name, fallback),
      placeholder: text(row.placeholder, 80),
      required: row.required !== false,
      span: blockSpan(row.span),
    };
  }
  if (row.type === "spacer") return { id, type: "spacer", height: clamp(row.height, 4, 80, 16), span: blockSpan(row.span) };
  return null;
}

export type FieldPreset = "email" | "phone" | "name" | "note" | "custom";

const FIELD_PRESETS: Record<FieldPreset, { label: string; fieldType: PopupFieldType; name: string; placeholder: string }> = {
  email: { label: "אימייל", fieldType: "email", name: "email", placeholder: "name@email.com" },
  phone: { label: "טלפון", fieldType: "tel", name: "phone", placeholder: "050-0000000" },
  name: { label: "שם", fieldType: "text", name: "name", placeholder: "השם שלכם" },
  note: { label: "הודעה", fieldType: "textarea", name: "note", placeholder: "כתבו כאן" },
  custom: { label: "שאלה", fieldType: "text", name: "custom", placeholder: "" },
};

export const FIELD_PRESET_LABELS: Record<FieldPreset, string> = {
  email: "אימייל",
  phone: "טלפון",
  name: "שם",
  note: "הודעה",
  custom: "שאלה חופשית",
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
    required: preset !== "custom",
    span: "full",
  };
}

export function blankBlock(type: PopupBlock["type"], blocks: PopupBlock[] = []): PopupBlock {
  const id = crypto.randomUUID();
  if (type === "heading") return { id, type, text: "כותרת", color: "#1a1a1a", size: 28, align: "center", weight: "bold", span: "full" };
  if (type === "text") return { id, type, text: "כאן נכנס המשפט שמופיע מתחת לכותרת.", color: "#4a4a4a", size: 15, align: "center", span: "full" };
  if (type === "image") return { id, type, src: "", alt: "", radius: 12, width: 100, span: "full" };
  if (type === "logo") return { id, type, src: "", width: 112, span: "full" };
  if (type === "button") return { id, type, label: "לחנות", href: "/products", background: "#1a1a1a", color: "#ffffff", radius: 999, span: "full" };
  if (type === "spacer") return { id, type, height: 16, span: "full" };
  if (type === "row") return blankRow();
  return { ...blankField("email", blocks), id };
}

function areaCopy(): PopupLeaf {
  return { id: crypto.randomUUID(), type: "text", text: "אזור חדש. כאן אפשר טקסט, תמונה או כל דבר אחר.", color: "#4a4a4a", size: 15, align: "center", span: "full" };
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

export function setColumnWidth(blocks: PopupBlock[], columnId: string, width: number): PopupBlock[] {
  return blocks.map((block) => {
    if (block.type !== "row") return block;
    const index = block.columns.findIndex((column) => column.id === columnId);
    if (index < 0 || block.columns.length < 2) return block;
    const min = MIN_COLUMN;
    const nextWidth = Math.max(min, Math.min(100 - min * (block.columns.length - 1), Math.round(width)));
    const current = fitColumnWidths(block.columns);
    const otherSum = current.reduce((sum, column, columnIndex) => (columnIndex === index ? sum : sum + column.width), 0) || 1;
    const rest = 100 - nextWidth;
    const columns = current.map((column, columnIndex) => (
      columnIndex === index ? { ...column, width: nextWidth } : { ...column, width: Math.max(min, Math.round((column.width / otherSum) * rest)) }
    ));
    const drift = 100 - columns.reduce((sum, column) => sum + column.width, 0);
    const fixAt = columns.findIndex((column, columnIndex) => columnIndex !== index && column.width + drift >= min);
    if (fixAt >= 0) columns[fixAt] = { ...columns[fixAt]!, width: columns[fixAt]!.width + drift };
    return { ...block, columns };
  });
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
  return blocks.flatMap((block) => (block.type === "row" ? block.columns.flatMap((column) => column.blocks) : [block]));
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

export function replacePopupBlock(blocks: PopupBlock[], next: PopupBlock): PopupBlock[] {
  return blocks.map((block) => {
    if (block.id === next.id) return next;
    if (block.type !== "row" || next.type === "row") return block;
    const leaf: PopupLeaf = next;
    return { ...block, columns: block.columns.map((column) => ({ ...column, blocks: column.blocks.map((item) => item.id === leaf.id ? leaf : item) })) };
  });
}

export function removePopupBlock(blocks: PopupBlock[], id: string): PopupBlock[] {
  const next: PopupBlock[] = [];
  for (const block of blocks) {
    if (block.id === id) continue;
    if (block.type !== "row") {
      next.push(block);
      continue;
    }
    const columns = fitColumnWidths(block.columns.filter((column) => column.id !== id).map((column) => ({ ...column, blocks: column.blocks.filter((item) => item.id !== id) })));
    if (columns.length) next.push({ ...block, columns });
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
    blocks: [
      blankBlock("heading"),
      { id: crypto.randomUUID(), type: "text", text: "השאירו אימייל ונשלח הטבה להזמנה הבאה.", color: "#4a4a4a", size: 15, align: "center", span: "full" },
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
  return {
    layout,
    width: clamp(row.width, 0, 480, 0),
    radius: typeof row.radius === "number" ? clamp(row.radius, 0, 40, 0) : -1,
    padding: typeof row.padding === "number" ? clamp(row.padding, 0, 64, 0) : -1,
    gap: typeof row.gap === "number" ? clamp(row.gap, 0, 40, 0) : -1,
    media,
    columns: row.columns === "same" ? "same" : "stack",
  };
}

export function normalizeDesign(value: unknown): PopupDesign {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = defaultDesign();
  const blocks = Array.isArray(row.blocks) ? row.blocks.flatMap((block, index) => {
    const next = cleanBlock(block, index);
    return next ? [next] : [];
  }).slice(0, 24) : base.blocks;
  const layout: PopupLayout = row.layout === "bar" || row.layout === "corner" ? row.layout : "modal";
  return {
    layout,
    width: clamp(row.width, 280, 880, base.width),
    radius: clamp(row.radius, 0, 40, base.radius),
    padding: clamp(row.padding, 0, 64, base.padding),
    gap: clamp(row.gap, 0, 40, base.gap),
    media: row.media === "right" || row.media === "left" ? row.media : "none",
    mediaImage: cleanImage(row.mediaImage),
    background: hex(row.background, base.background),
    backgroundImage: cleanImage(row.backgroundImage),
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
