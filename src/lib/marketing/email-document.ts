import type { EmailBlock, MarketingEmail } from "@/data/mock/marketing-session";

export type EmailProfile = {
  firstName: string;
  fullName: string;
  email: string;
  storeName: string;
  storeUrl: string;
  checkoutUrl: string;
  accountUrl: string;
  cartItems: string;
  cartTotal: string;
  logoUrl: string;
};

export type EmailDocument = {
  subject: string;
  preview: string;
  html: string;
  text: string;
};

const TOKENS: Record<keyof EmailProfile, string[]> = {
  firstName: ["{first_name}"],
  fullName: ["{full_name}"],
  email: ["{email}"],
  storeName: ["{store_name}"],
  storeUrl: ["{store_url}"],
  checkoutUrl: ["{checkout_url}"],
  accountUrl: ["{account_url}"],
  cartItems: ["{cart_items}"],
  cartTotal: ["{cart_total}"],
  logoUrl: [],
};

export function sampleEmailProfile(storeName: string, logoUrl = ""): EmailProfile {
  const name = storeName.trim() || "החנות";
  return {
    firstName: "דנה",
    fullName: "דנה לוי",
    email: "dana@example.test",
    storeName: name,
    storeUrl: "https://example.test",
    checkoutUrl: "https://example.test/checkout",
    accountUrl: "https://example.test/account",
    cartItems: "מוצר לדוגמה",
    cartTotal: "₪120",
    logoUrl,
  };
}

export function fillEmailTokens(value: string, profile: EmailProfile) {
  let next = value;
  for (const [key, tokens] of Object.entries(TOKENS) as Array<[keyof EmailProfile, string[]]>) {
    for (const token of tokens) next = next.split(token).join(profile[key]);
  }
  return next;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textOf(value: string, profile: EmailProfile) {
  return escapeHtml(fillEmailTokens(value, profile)).replaceAll("\n", "<br>");
}

function alignOf(align: string | undefined) {
  if (align === "center") return "center";
  if (align === "end") return "left";
  return "right";
}

function fontStack(font: string | undefined) {
  const chosen = font?.trim() ? `"${font}",` : "";
  return `${chosen} "Segoe UI", Tahoma, Arial, sans-serif`;
}

function lookCss(block: EmailBlock, color: string, fallbackSize: number, fallbackWeight: number) {
  if (!("font" in block)) return `color:${color};`;
  const decoration = [block.underline ? "underline" : "", block.strike ? "line-through" : ""].filter(Boolean).join(" ");
  return [
    `color:${color}`,
    `font-family:${fontStack(block.font)}`,
    `font-size:${block.size || fallbackSize}px`,
    `font-weight:${block.weight || fallbackWeight}`,
    `font-style:${block.italic ? "italic" : "normal"}`,
    `text-decoration:${decoration || "none"}`,
    "line-height:1.5",
  ].join(";");
}

function hrefOf(value: string, profile: EmailProfile) {
  const href = fillEmailTokens(value, profile).trim();
  if (!href || href.startsWith("javascript:")) return "";
  return escapeHtml(href);
}

function blockHtml(block: EmailBlock, profile: EmailProfile) {
  if (block.type === "image") {
    if (!block.src.trim()) return "";
    const image = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(fillEmailTokens(block.alt || "", profile))}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;">`;
    const href = hrefOf(block.href, profile);
    return `<tr><td>${href ? `<a href="${href}" style="text-decoration:none;">${image}</a>` : image}</td></tr>`;
  }
  if (block.type === "logo") {
    if (!profile.logoUrl.trim()) return "";
    return `<tr><td align="center" style="padding:16px 24px;"><img src="${escapeHtml(profile.logoUrl)}" alt="${escapeHtml(profile.storeName)}" height="48" style="display:block;height:48px;width:auto;max-width:220px;border:0;"></td></tr>`;
  }
  if (block.type === "heading") {
    return `<tr><td align="${alignOf(block.align)}" style="padding:12px 24px;${lookCss(block, block.color || "#1a1a1a", 28, 700)}">${textOf(block.text || "", profile)}</td></tr>`;
  }
  if (block.type === "text") {
    return `<tr><td align="${alignOf(block.align)}" style="padding:8px 24px;${lookCss(block, block.color || "#303030", 16, 400)}">${textOf(block.text || "", profile)}</td></tr>`;
  }
  if (block.type === "button") {
    const href = hrefOf(block.href, profile) || "#";
    const label = textOf(block.label || "", profile);
    return `<tr><td align="${alignOf(block.align)}" style="padding:12px 24px;"><a href="${href}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:${escapeHtml(block.color || "#1a1a1a")};${lookCss(block, block.textColor || "#ffffff", 16, 700)}text-decoration:none;">${label}</a></td></tr>`;
  }
  if (block.type === "columns") {
    const style = lookCss(block, block.color || "#303030", 16, 400);
    return `<tr><td style="padding:8px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stack" width="50%" valign="top" style="padding-left:8px;${style}">${textOf(block.left || "", profile)}</td>
      <td class="stack" width="50%" valign="top" style="padding-right:8px;${style}">${textOf(block.right || "", profile)}</td>
    </tr></table></td></tr>`;
  }
  if (block.type === "spacer") {
    const height = block.size === "s" ? 16 : block.size === "l" ? 56 : 32;
    return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
  }
  return `<tr><td style="padding:12px 24px;"><div style="height:1px;background:${escapeHtml(block.color || "#e6e6e6")};line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;
}

function blockText(block: EmailBlock, profile: EmailProfile) {
  if (block.type === "image") return fillEmailTokens(block.alt || "", profile);
  if (block.type === "logo") return profile.storeName;
  if (block.type === "heading" || block.type === "text") return fillEmailTokens(block.text || "", profile);
  if (block.type === "button") {
    const href = fillEmailTokens(block.href || "", profile);
    return [fillEmailTokens(block.label || "", profile), href].filter(Boolean).join(": ");
  }
  if (block.type === "columns") return [block.left, block.right].map((part) => fillEmailTokens(part || "", profile)).filter(Boolean).join("\n");
  if (block.type === "divider") return "----------";
  return "";
}

export function renderEmailDocument(email: Pick<MarketingEmail, "subject" | "preview" | "blocks">, profile: EmailProfile): EmailDocument {
  const subject = fillEmailTokens(email.subject, profile);
  const preview = fillEmailTokens(email.preview, profile);
  const rows = email.blocks.map((block) => blockHtml(block, profile)).join("");
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#e7e7e7; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e7e7e7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7e7e7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" dir="rtl" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;">
      ${rows || `<tr><td style="padding:32px;text-align:center;color:#8a8a8a;font-family:Arial,sans-serif;">המייל עדיין ריק</td></tr>`}
    </table>
  </td></tr>
</table>
</body>
</html>`;
  const text = [
    subject,
    preview,
    ...email.blocks.map((block) => blockText(block, profile)).filter(Boolean),
  ].join("\n\n");
  return { subject, preview, html, text };
}
