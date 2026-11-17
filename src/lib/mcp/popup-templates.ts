export type PopupTemplate = {
  name: string;
  description: string;
  design: Record<string, unknown>;
};

const luxury = {
  layout: "modal",
  width: 900,
  radius: 28,
  padding: 0,
  gap: 0,
  background: "#F3D9C6",
  overlay: 46,
  submitLabel: "הרשמה",
  submitBackground: "#3A2826",
  submitColor: "#F3D9C6",
  successTitle: "נרשמתם",
  successText: "הקוד מחכה לכם למטה.",
  couponCode: "",
  mobile: { layout: "modal", width: 390, radius: 20, padding: 0, gap: 0, media: "stack", columns: "stack" },
};

function split(copy: { title: string; text: string; button: string }) {
  return {
    ...luxury,
    submitLabel: copy.button,
    blocks: [
      {
        id: "split",
        type: "row",
        columns: [
          {
            id: "visual",
            width: 48,
            blocks: [
              { id: "products", type: "image", src: "", alt: "מוצרים", width: 100, radius: 0, style: { fit: "contain", aspect: "4/5", height: 520 } },
            ],
          },
          {
            id: "copy",
            width: 52,
            blocks: [
              { id: "logo", type: "logo", src: "", width: 92 },
              { id: "offer", type: "heading", text: copy.title, size: 36, weight: "bold", align: "right", color: "#3A2826", style: { fontFamily: "playfair", fontSize: 40, lineHeight: 1.15, letterSpacing: 0.4 } },
              { id: "body", type: "text", text: copy.text, size: 15, align: "right", color: "#3A2826" },
              { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true },
              { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור ועדכונים מהמותג", required: true },
            ],
          },
        ],
        style: { gap: 0, align: "stretch" },
        mobile: { direction: "column", gap: 8 },
      },
    ],
  };
}

export const POPUP_TEMPLATES: PopupTemplate[] = [
  { name: "luxury_editorial", description: "Wide split layout, serif heading, product image beside the form. Replace colors with the brand palette.", design: split({ title: "10% הנחה לנרשמות", text: "השאירו אימייל וקבלו את ההטבה במשלוח הראשון.", button: "לקבלת ההטבה" }) },
  { name: "beauty_premium", description: "Soft editorial popup for beauty brands, with a short line above the heading and a consent checkbox.", design: { ...luxury, padding: 28, gap: 14, blocks: [{ id: "mark", type: "heading", text: "מהדורה שקטה", size: 16, weight: "medium", align: "right", color: "#3A2826", style: { fontFamily: "frank", fontSize: 16 } }, { id: "logo", type: "logo", src: "", width: 88 }, { id: "offer", type: "heading", text: "הטיפוח שמגיע אלייך", size: 34, weight: "bold", align: "right", color: "#3A2826", style: { fontFamily: "frank", fontSize: 36 } }, { id: "body", type: "text", text: "נרשמות מקבלות השקה שקטה והטבה אישית.", size: 15, align: "right", color: "#3A2826" }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "minimal_clean", description: "One column, lots of space, no decorative shapes.", design: { ...luxury, width: 440, background: "#ffffff", blocks: [{ id: "logo", type: "logo", src: "", width: 72 }, { id: "offer", type: "heading", text: "הישארו בעניינים", size: 28, weight: "bold", align: "right", color: "#1a1a1a" }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "product_showcase", description: "Three product images in a row on desktop and a stack on mobile.", design: { ...luxury, blocks: [{ id: "logo", type: "logo", src: "", width: 84 }, { id: "offer", type: "heading", text: "השלישייה של העונה", size: 32, weight: "bold", align: "right", color: "#3A2826", style: { fontFamily: "playfair" } }, { id: "products", type: "row", columns: [{ id: "a", width: 34, blocks: [{ id: "img-a", type: "image", src: "", alt: "", width: 100, radius: 16, style: { fit: "contain", aspect: "1/1" } }] }, { id: "b", width: 33, blocks: [{ id: "img-b", type: "image", src: "", alt: "", width: 100, radius: 16, style: { fit: "contain", aspect: "1/1" } }] }, { id: "c", width: 33, blocks: [{ id: "img-c", type: "image", src: "", alt: "", width: 100, radius: 16, style: { fit: "contain", aspect: "1/1" } }] }], mobile: { direction: "column" } }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "newsletter_signup", description: "Email, name, and an explicit marketing-consent checkbox.", design: { ...luxury, width: 480, blocks: [{ id: "logo", type: "logo", src: "", width: 80 }, { id: "offer", type: "heading", text: "10% הנחה לנרשמות", size: 32, weight: "bold", align: "right", color: "#3A2826" }, { id: "name", type: "field", fieldType: "text", name: "name", label: "שם", placeholder: "השם שלכם", required: false }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "discount_offer", description: "Offer heading and a coupon that is returned only after consent.", design: { ...luxury, couponCode: "WELCOME10", width: 520, blocks: [{ id: "offer-mark", type: "heading", text: "10%", size: 18, weight: "bold", align: "right", color: "#3A2826", style: { fontFamily: "playfair", fontSize: 18 } }, { id: "offer", type: "heading", text: "הנחה לנרשמות החדשות", size: 32, weight: "bold", align: "right", color: "#3A2826" }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל את ההטבה במייל", required: true }] } },
  { name: "seasonal_campaign", description: "Seasonal headline and a short signup form.", design: { ...luxury, blocks: [{ id: "offer", type: "heading", text: "העונה הזו, בשקט", size: 34, weight: "bold", align: "right", color: "#3A2826", style: { fontFamily: "frank" } }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "exit_intent", description: "Compact exit-intent offer. Set the popup trigger to exit separately.", design: { ...luxury, width: 460, blocks: [{ id: "offer", type: "heading", text: "לפני שיוצאים", size: 30, weight: "bold", align: "right", color: "#3A2826" }, { id: "body", type: "text", text: "10% הנחה מחכה למי שנרשמת עכשיו.", size: 15, align: "right", color: "#3A2826" }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] } },
  { name: "full_image", description: "Text and form over a full image. Set the image assetId before saving.", design: { ...luxury, padding: 0, blocks: [{ id: "hero", type: "overlay", src: "", alt: "", style: { height: 560, fit: "cover" }, blocks: [{ id: "logo", type: "logo", src: "", width: 84 }, { id: "offer", type: "heading", text: "10% הנחה", size: 40, weight: "bold", align: "right", color: "#F3D9C6", style: { fontFamily: "playfair", fontSize: 48 } }, { id: "email", type: "field", fieldType: "email", name: "email", label: "אימייל", placeholder: "name@email.com", required: true }, { id: "consent", type: "field", fieldType: "consent", name: "consent", label: "אני מסכימה לקבל דיוור", required: true }] }] } },
  { name: "split_layout", description: "Desktop image on one side and the form on the other. Mobile stacks the image above the form.", design: split({ title: "נרשמות ומקבלות 10%", text: "ההטבה נשלחת רק אחרי הסכמה מפורשת לדיוור.", button: "הרשמה" }) },
];

const STOREFRONT_BLOCKS = new Set(["heading", "text", "image", "logo", "button", "field", "spacer", "row", "overlay"]);

export function popupDesignSchema() {
  return {
    blocks: ["heading", "text", "image", "logo", "button", "field", "spacer", "row", "overlay"],
    nesting: "A row holds up to 4 columns, and each column holds heading, text, image, logo, button, field, or spacer. An overlay holds those same blocks on top of one image. Do not nest a row or an overlay inside another one. Do not use container, columns, stack, badge, divider, icon, or shape. The public site skips a popup whose blocks are only those types.",
    style: {
      heading: ["color", "fontFamily", "fontWeight", "fontSize", "letterSpacing", "align"],
      text: ["color", "fontFamily", "fontWeight", "fontSize", "letterSpacing", "align"],
      button: ["background", "color", "radius", "width"],
      image: ["fit", "radius", "width", "frame", "bleed", "fade", "fadeSide", "focus"],
      overlay: ["height", "fit", "padding", "gap", "align", "justify"],
      frame: ["layout", "width", "radius", "padding", "gap", "background", "overlay", "closeColor", "closeSize", "closePlace"],
    },
    fonts: ["inherit", "heebo", "frank", "playfair"],
    fontWeight: ["regular", "medium", "semibold", "bold"],
    align: ["right", "center", "left"],
    fit: ["cover", "contain"],
    layout: ["modal", "bar", "corner"],
    images: "Use assetId, productId plus imageIndex, or an https URL already stored for this store. style.fit is contain or cover. Do not send an external URL. Other style keys are ignored on the public site, even if the admin preview shows them.",
    responsive: "design.mobile can set layout, width, radius, padding, gap, and columns to stack. The public site does not hide a single block on one device.",
    form: "fieldType email, tel, text, textarea, or consent. A required consent field must be yes before the lead is stored. couponCode is returned only after that consent. Duplicate emails on the same popup are rejected.",
    targeting: "trigger is immediate, delay, scroll, or exit. frequency is always, session, day, or once. device is all, desktop, or mobile. pages are all, home, product, catalog, checkout, and content.",
    publish: "create_popup_from_design always saves a draft. publish_popup is the only publish. Ask before publishing.",
    edits: "update_popup_block changes one block by id. reorder_popup_blocks changes order. restore_popup_revision returns one of the last 20 designs. Active popups refuse design edits.",
  };
}

function collectPopupBlockTypes(value: unknown, found: Set<string>, depth: number) {
  if (!Array.isArray(value) || depth > 6) return;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = typeof row.type === "string" ? row.type : "";
    if (type && !STOREFRONT_BLOCKS.has(type)) found.add(type);
    collectPopupBlockTypes(row.blocks, found, depth + 1);
    if (Array.isArray(row.columns)) {
      for (const column of row.columns) {
        if (column && typeof column === "object") collectPopupBlockTypes((column as Record<string, unknown>).blocks, found, depth + 1);
      }
    }
  }
}

export function storefrontPopupBlockError(args: Record<string, unknown>) {
  const found = new Set<string>();
  const design = args.design && typeof args.design === "object" && !Array.isArray(args.design) ? args.design as Record<string, unknown> : null;
  collectPopupBlockTypes(design?.blocks, found, 0);
  collectPopupBlockTypes(args.blocks, found, 0);
  if (args.block && typeof args.block === "object") collectPopupBlockTypes([args.block], found, 0);
  if (!found.size) return "";
  return `The public site does not show these blocks: ${[...found].join(", ")}. Use only heading, text, image, logo, button, field, spacer, row, and overlay. Read get_popup_design_schema and rebuild the design.`;
}

export function designFromTemplate(args: Record<string, unknown>) {
  const templateName = typeof args.template === "string" ? args.template : "";
  const template = templateName ? POPUP_TEMPLATES.find((item) => item.name === templateName) : undefined;
  if (templateName && !template) return { error: `Unknown template. Use one of: ${POPUP_TEMPLATES.map((item) => item.name).join(", ")}` };
  const overlay = args.design && typeof args.design === "object" && !Array.isArray(args.design) ? args.design as Record<string, unknown> : {};
  const design: Record<string, unknown> = { ...(template?.design ?? {}), ...overlay };
  if (Array.isArray(args.blocks)) design.blocks = args.blocks;
  return { design };
}
