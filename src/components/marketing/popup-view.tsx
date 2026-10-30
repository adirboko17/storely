"use client";

import type { CSSProperties } from "react";
import { columnGrid, popupHasFields, popupLook, type PopupBlock, type PopupDesign } from "@/lib/marketing/popups";
import { popupStyleCss, resolvePopupStyle, type PopupIconName, type PopupStyle } from "@/lib/marketing/popup-style";

function textAlign(value: "right" | "center" | "left"): CSSProperties["textAlign"] {
  if (value === "left") return "left";
  if (value === "center") return "center";
  return "right";
}

function lookOf(style: PopupStyle | undefined, mobile: PopupStyle | undefined, device: "desktop" | "mobile") {
  return resolvePopupStyle(style, mobile, device);
}

const ICONS: Record<PopupIconName, string> = {
  gift: "M4 10h16v10H4z M12 10v10 M4 10c0-3 3-5 8-5s8 2 8 5",
  star: "M12 3l2.4 6.6H21l-5.4 4 2 6.4L12 16.8 6.4 20l2-6.4L3 9.6h6.6z",
  check: "M5 12l5 5L20 7",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  heart: "M12 19s-7-4.4-7-8.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 14.6 12 19 12 19z",
  leaf: "M5 19C5 11 12 4 20 4 20 12 13 19 5 19z M8 16c2-2 5-5 8-8",
  spark: "M12 2l1.4 6.2L20 10l-6.6 1.8L12 18l-1.4-6.2L4 10l6.6-1.8z",
};

export function PopupBlockView({
  block,
  device,
  logoUrl = "",
  stack = false,
}: {
  block: PopupBlock;
  device: "desktop" | "mobile";
  logoUrl?: string;
  stack?: boolean;
}) {
  const style = lookOf(block.style, block.mobile, device);
  if (style?.hide === device) return null;
  const css = popupStyleCss(style);
  if (block.type === "row" || block.type === "columns") {
    return (
      <div style={{ ...css, display: "grid", gridTemplateColumns: columnGrid(block.columns, stack || style?.direction === "column"), gap: style?.gap ?? 12, width: "100%" }}>
        {block.columns.map((column) => (
          <div key={column.id} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: style?.gap ?? 12, order: device === "mobile" ? column.mobileOrder : undefined }}>
            {column.blocks.map((child) => <PopupBlockView key={child.id} block={child} device={device} logoUrl={logoUrl} stack={stack} />)}
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "container" || block.type === "stack") {
    const direction = block.type === "stack" ? (style?.direction ?? block.direction) : (style?.direction ?? "column");
    return (
      <div style={{ ...css, display: "flex", flexDirection: direction, gap: style?.gap ?? 12, width: css.width ?? "100%", minWidth: 0 }}>
        {block.blocks.map((child) => <PopupBlockView key={child.id} block={child} device={device} logoUrl={logoUrl} stack={stack} />)}
      </div>
    );
  }
  if (block.type === "overlay") {
    const src = device === "mobile" && block.mobileSrc ? block.mobileSrc : block.src;
    return (
      <div style={{ ...css, position: "relative", overflow: "hidden", minHeight: style?.height ?? 180, width: "100%" }}>
        {src ? <img src={src} alt={block.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: style?.fit ?? "cover", objectPosition: style?.position ?? "center" }} /> : null}
        <div style={{ position: "absolute", inset: 0, background: style?.gradient ? undefined : "linear-gradient(180deg, transparent, rgba(58,40,38,.45))" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, minHeight: style?.height ?? 180, padding: style?.padding ?? 16 }}>
          {block.blocks.map((child) => <PopupBlockView key={child.id} block={child} device={device} logoUrl={logoUrl} stack={stack} />)}
        </div>
      </div>
    );
  }
  if (block.type === "heading") {
    return <div style={{ ...css, color: css.color ?? block.color, fontSize: style?.fontSize ?? block.size, fontWeight: style?.fontWeight ?? (block.weight === "bold" ? 700 : 500), textAlign: textAlign(block.align), lineHeight: style?.lineHeight ?? 1.25, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{block.text || "כותרת"}</div>;
  }
  if (block.type === "text") {
    return <div style={{ ...css, color: css.color ?? block.color, fontSize: style?.fontSize ?? block.size, textAlign: textAlign(block.align), lineHeight: style?.lineHeight ?? 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{block.text || "טקסט"}</div>;
  }
  if (block.type === "image") {
    const src = device === "mobile" && block.mobileSrc ? block.mobileSrc : block.src;
    if (!src) return <div style={{ ...css, width: `${block.width}%` }}>תמונה</div>;
    return <img src={src} alt={block.alt} style={{ ...css, display: "block", width: css.width ?? `${block.width}%`, maxWidth: "100%", height: style?.height ?? "auto", maxHeight: style?.height ?? 420, objectFit: style?.fit ?? "cover", objectPosition: style?.position ?? "center", borderRadius: style?.radius ?? block.radius, marginInline: "auto" }} />;
  }
  if (block.type === "logo") {
    const src = device === "mobile" && block.mobileSrc ? block.mobileSrc : (logoUrl || block.src);
    if (!src) return null;
    return <img src={src} alt="" style={{ ...css, display: "block", width: style?.width ?? block.width, maxWidth: "100%", height: "auto", objectFit: "contain" }} />;
  }
  if (block.type === "button") {
    return <span style={{ ...css, display: "grid", minHeight: 44, placeItems: "center", textAlign: "center", background: css.background ?? block.background, color: css.color ?? block.color, borderRadius: style?.radius ?? block.radius, fontWeight: 700 }}>{block.label}</span>;
  }
  if (block.type === "field") {
    if (block.fieldType === "consent") {
      return (
        <label style={{ ...css, display: "flex", alignItems: "flex-start", gap: 8, fontSize: style?.fontSize ?? 13, lineHeight: 1.45 }}>
          <span aria-hidden style={{ width: 18, height: 18, flex: "0 0 18px", marginTop: 1, borderRadius: 4, border: "1.5px solid currentColor", background: "#fff" }} />
          <span>{block.label || "אני מסכימה לקבל דיוור"}{block.required ? " *" : ""}</span>
        </label>
      );
    }
    const tall = block.fieldType === "textarea";
    return (
      <span style={{ ...css, display: "block" }}>
        {block.label ? <span style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>{block.label}{block.required ? " *" : ""}</span> : null}
        <span style={{ display: "block", minHeight: tall ? 72 : 44, borderRadius: 12, background: "#fff", padding: "10px 12px", fontSize: 14, color: "#8a8a8a", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }}>{block.placeholder || "התשובה תופיע כאן"}</span>
      </span>
    );
  }
  if (block.type === "badge") {
    return <span style={{ ...css, display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 28, padding: style?.padding ?? "4px 10px", borderRadius: style?.radius ?? 999, fontSize: style?.fontSize ?? 13, fontWeight: style?.fontWeight ?? 700, width: "fit-content", maxWidth: "100%" }}>{block.text}</span>;
  }
  if (block.type === "divider") {
    return <span style={{ ...css, display: "block", height: style?.height ?? 1, width: "100%", background: css.background ?? "currentColor", opacity: style?.opacity === undefined ? 0.25 : style.opacity / 100 }} />;
  }
  if (block.type === "icon") {
    return (
      <svg viewBox="0 0 24 24" width={style?.width ?? 28} height={style?.height ?? 28} aria-hidden style={{ ...css, display: "block" }}>
        <path d={ICONS[block.name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  if (block.type === "shape") {
    return <span aria-hidden style={{ ...css, display: "block", width: style?.width ?? (block.kind === "line" ? "100%" : 72), height: style?.height ?? (block.kind === "line" ? 2 : 72), borderRadius: block.kind === "ellipse" ? 999 : style?.radius ?? 0, background: css.background ?? "currentColor" }} />;
  }
  return <span style={{ ...css, display: "block", height: block.height }} />;
}

export function PopupStage({
  design,
  device,
  logoUrl = "",
  submitted = false,
}: {
  design: PopupDesign;
  device: "desktop" | "mobile";
  logoUrl?: string;
  submitted?: boolean;
}) {
  const look = popupLook(design, device);
  const stack = look.stackColumns;
  const card: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: look.layout === "bar" ? "100%" : `min(${look.width}px, calc(100% - 24px))`,
    maxHeight: "calc(100dvh - 32px)",
    overflow: "auto",
    background: design.background,
    backgroundImage: design.backgroundImage ? `linear-gradient(rgba(255,255,255,.08), rgba(255,255,255,.08)), url("${design.backgroundImage}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: look.layout === "bar" ? `${look.radius}px ${look.radius}px 0 0` : look.radius,
    boxShadow: "0 18px 50px rgba(20,16,14,.22)",
    color: "#1a1a1a",
  };
  return (
    <div data-popup-root dir="rtl" lang="he" style={{ position: "relative", minHeight: "100dvh", overflow: "hidden", background: "#e7e1db" }}>
      {look.layout === "modal" ? <div style={{ position: "absolute", inset: 0, background: `rgba(20,16,14,${design.overlay / 100})` }} /> : null}
      <div style={{ position: "relative", minHeight: "100dvh", display: "flex", alignItems: look.layout === "modal" ? "center" : "flex-end", justifyContent: look.layout === "corner" ? "flex-start" : "center", padding: 16 }}>
        <div data-popup-card style={card}>
          <span aria-hidden style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 32, height: 32, display: "grid", placeItems: "center", color: design.closeColor, fontSize: design.closeSize }}>×</span>
          <div style={{ paddingTop: Math.max(look.padding, 36), paddingInline: look.padding, paddingBottom: look.padding, display: "flex", flexDirection: "column", gap: look.gap }}>
            {submitted ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
                <strong style={{ fontSize: 28 }}>{design.successTitle}</strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>{design.successText}</p>
                {design.couponCode ? (
                  <button type="button" style={{ minHeight: 44, border: 0, borderRadius: 999, background: design.submitBackground, color: design.submitColor, fontWeight: 700 }}>{design.couponCode}</button>
                ) : null}
              </div>
            ) : (
              <>
                {design.blocks.map((block) => <PopupBlockView key={block.id} block={block} device={device} logoUrl={logoUrl} stack={stack} />)}
                {popupHasFields(design.blocks) ? (
                  <span style={{ display: "grid", minHeight: 44, placeItems: "center", background: design.submitBackground, color: design.submitColor, borderRadius: 999, fontWeight: 700 }}>{design.submitLabel}</span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
