import type { CSSProperties } from "react";

export const POPUP_FONTS = ["inherit", "heebo", "frank", "playfair"] as const;
export const POPUP_SHADOWS = ["none", "soft", "medium", "strong"] as const;
export const POPUP_ICONS = ["gift", "star", "check", "mail", "heart", "leaf", "spark"] as const;
export const POPUP_ASPECTS = ["auto", "1/1", "3/4", "4/5", "16/9"] as const;

export type PopupFont = (typeof POPUP_FONTS)[number];
export type PopupShadow = (typeof POPUP_SHADOWS)[number];
export type PopupIconName = (typeof POPUP_ICONS)[number];
export type PopupAspect = (typeof POPUP_ASPECTS)[number];

export type PopupGradient = { angle: number; stops: Array<{ color: string; offset: number }> };

export type PopupStyle = {
  width?: number;
  height?: number;
  padding?: number;
  margin?: number;
  gap?: number;
  background?: string;
  gradient?: PopupGradient;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  shadow?: PopupShadow;
  opacity?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  direction?: "row" | "column";
  z?: number;
  rotate?: number;
  overflow?: "visible" | "hidden";
  order?: number;
  fontFamily?: PopupFont;
  fontWeight?: 400 | 500 | 600 | 700;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fit?: "contain" | "cover";
  position?: "center" | "top" | "bottom";
  aspect?: PopupAspect;
  hide?: "desktop" | "mobile";
};

const SHADOW: Record<PopupShadow, string> = {
  none: "none",
  soft: "0 8px 24px rgba(58,40,38,.12)",
  medium: "0 16px 40px rgba(58,40,38,.18)",
  strong: "0 24px 60px rgba(58,40,38,.28)",
};

const FONT: Record<PopupFont, string> = {
  inherit: "inherit",
  heebo: 'var(--font-assistant), "Heebo", sans-serif',
  frank: '"Frank Ruhl Libre", "Times New Roman", serif',
  playfair: '"Playfair Display", "Frank Ruhl Libre", serif',
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hex(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "";
}

function num(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function fraction(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

export function cleanPopupStyle(value: unknown): PopupStyle | undefined {
  const row = record(value);
  if (!row) return undefined;
  const style: PopupStyle = {};
  const width = num(row.width, 0, 1200);
  const height = num(row.height, 0, 1200);
  const padding = num(row.padding, 0, 80);
  const margin = num(row.margin, 0, 80);
  const gap = num(row.gap, 0, 64);
  const background = hex(row.background);
  const color = hex(row.color);
  const borderColor = hex(row.borderColor);
  const borderWidth = num(row.borderWidth, 0, 12);
  const radius = num(row.radius, 0, 999);
  const opacity = num(row.opacity, 0, 100);
  const z = num(row.z, 0, 40);
  const rotate = num(row.rotate, -30, 30);
  const order = num(row.order, 0, 20);
  const fontSize = num(row.fontSize, 11, 64);
  const lineHeight = fraction(row.lineHeight, 1, 2);
  const letterSpacing = fraction(row.letterSpacing, -1, 8);
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  if (padding !== undefined) style.padding = padding;
  if (margin !== undefined) style.margin = margin;
  if (gap !== undefined) style.gap = gap;
  if (background) style.background = background;
  if (color) style.color = color;
  if (borderColor) style.borderColor = borderColor;
  if (borderWidth !== undefined) style.borderWidth = borderWidth;
  if (radius !== undefined) style.radius = radius;
  if (opacity !== undefined) style.opacity = opacity;
  if (z !== undefined) style.z = z;
  if (rotate !== undefined) style.rotate = rotate;
  if (order !== undefined) style.order = order;
  if (fontSize !== undefined) style.fontSize = fontSize;
  if (lineHeight !== undefined) style.lineHeight = lineHeight;
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;
  if (row.shadow === "none" || row.shadow === "soft" || row.shadow === "medium" || row.shadow === "strong") style.shadow = row.shadow;
  if (row.align === "start" || row.align === "center" || row.align === "end" || row.align === "stretch") style.align = row.align;
  if (row.justify === "start" || row.justify === "center" || row.justify === "end" || row.justify === "between") style.justify = row.justify;
  if (row.direction === "row" || row.direction === "column") style.direction = row.direction;
  if (row.overflow === "visible" || row.overflow === "hidden") style.overflow = row.overflow;
  if (row.fontFamily === "inherit" || row.fontFamily === "heebo" || row.fontFamily === "frank" || row.fontFamily === "playfair") style.fontFamily = row.fontFamily;
  if (row.fontWeight === 400 || row.fontWeight === 500 || row.fontWeight === 600 || row.fontWeight === 700) style.fontWeight = row.fontWeight;
  if (row.fit === "contain" || row.fit === "cover") style.fit = row.fit;
  if (row.position === "center" || row.position === "top" || row.position === "bottom") style.position = row.position;
  if (row.aspect === "auto" || row.aspect === "1/1" || row.aspect === "3/4" || row.aspect === "4/5" || row.aspect === "16/9") style.aspect = row.aspect;
  if (row.hide === "desktop" || row.hide === "mobile") style.hide = row.hide;
  const gradient = record(row.gradient);
  if (gradient && Array.isArray(gradient.stops)) {
    const angle = num(gradient.angle, 0, 360);
    const stops = gradient.stops.flatMap((stop) => {
      const item = record(stop);
      const stopColor = item ? hex(item.color) : "";
      const offset = item ? num(item.offset, 0, 100) : undefined;
      return stopColor && offset !== undefined ? [{ color: stopColor, offset }] : [];
    }).slice(0, 4);
    if (angle !== undefined && stops.length >= 2) style.gradient = { angle, stops };
  }
  return Object.keys(style).length ? style : undefined;
}

export function resolvePopupStyle(style: PopupStyle | undefined, mobile: PopupStyle | undefined, device: "desktop" | "mobile") {
  if (device === "desktop") return style;
  return { ...style, ...mobile };
}

export function popupStyleCss(style: PopupStyle | undefined): CSSProperties {
  if (!style) return {};
  const justify = style.justify === "between" ? "space-between" : style.justify === "start" ? "flex-start" : style.justify === "end" ? "flex-end" : style.justify === "center" ? "center" : undefined;
  const align = style.align === "start" ? "flex-start" : style.align === "end" ? "flex-end" : style.align === "center" ? "center" : style.align === "stretch" ? "stretch" : undefined;
  return {
    width: style.width ? style.width : undefined,
    maxWidth: "100%",
    height: style.height ? style.height : undefined,
    padding: style.padding,
    margin: style.margin,
    gap: style.gap,
    background: style.gradient
      ? `linear-gradient(${style.gradient.angle}deg, ${style.gradient.stops.map((stop) => `${stop.color} ${stop.offset}%`).join(", ")})`
      : style.background,
    color: style.color,
    border: style.borderWidth ? `${style.borderWidth}px solid ${style.borderColor || "transparent"}` : undefined,
    borderRadius: style.radius,
    boxShadow: style.shadow ? SHADOW[style.shadow] : undefined,
    opacity: style.opacity === undefined ? undefined : style.opacity / 100,
    justifyContent: justify,
    alignItems: align,
    flexDirection: style.direction,
    zIndex: style.z,
    transform: style.rotate ? `rotate(${style.rotate}deg)` : undefined,
    overflow: style.overflow,
    order: style.order,
    fontFamily: style.fontFamily ? FONT[style.fontFamily] : undefined,
    fontWeight: style.fontWeight,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing === undefined ? undefined : `${style.letterSpacing}px`,
    objectFit: style.fit,
    objectPosition: style.position,
    aspectRatio: style.aspect && style.aspect !== "auto" ? style.aspect : undefined,
  };
}
