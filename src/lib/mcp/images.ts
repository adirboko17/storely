import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ImageSize = "thumbnail" | "medium" | "original";

export type DecodedImage = {
  bytes: Uint8Array;
  mimeType: ImageMime;
  width: number;
  height: number;
};

const MAX_UPLOAD = 4 * 1024 * 1024;
const WIDTH = { thumbnail: 320, medium: 960, original: 1600 } as const;
const BYTE_CAP = { thumbnail: 250_000, medium: 700_000, original: 1_500_000 } as const;

export function imageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export function decodeImage(bytes: Uint8Array): DecodedImage | null {
  const mimeType = imageMime(bytes);
  if (!mimeType || bytes.byteLength > MAX_UPLOAD) return null;
  const size = mimeType === "image/jpeg" ? jpegSize(bytes) : mimeType === "image/png" ? pngSize(bytes) : webpSize(bytes);
  if (!size || size.width < 1 || size.height < 1 || size.width > 8000 || size.height > 8000) return null;
  return { bytes, mimeType, width: size.width, height: size.height };
}

export function decodeBase64Image(value: string): DecodedImage | null {
  const trimmed = value.trim().replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!trimmed || trimmed.length > Math.ceil(MAX_UPLOAD / 3) * 4 + 8) return null;
  if (!/^[a-z0-9+/=\s]+$/i.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed.replace(/\s/g, ""), "base64");
  return decodeImage(bytes);
}

export function extensionFor(mime: ImageMime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "webp";
}

export function cleanFileName(value: string) {
  const name = value.replace(/[\\/]/g, " ").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return name || "image";
}

/** A public object already stored for this store. Other hosts, queries, and other stores are rejected. */
export function ownStorageObject(sourceUrl: string, storeId: string, supabaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  const allowed = new URL(supabaseUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== allowed.hostname || parsed.port || parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  const prefix = "/storage/v1/object/public/";
  if (!parsed.pathname.startsWith(prefix)) return null;
  const parts = parsed.pathname.slice(prefix.length).split("/").map((part) => safeDecode(part));
  if (parts.some((part) => part == null)) return null;
  const [bucket, storeFolder, ...rest] = parts as string[];
  if ((bucket !== "product-media" && bucket !== "email-media") || storeFolder !== storeId || rest.length === 0) return null;
  if (rest.some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part))) return null;
  return { bucket, path: [storeFolder, ...rest].join("/") };
}

type MediaFile = {
  bucket?: string;
  path?: string;
  publicUrl?: string;
  productId?: string;
  title?: string;
  imageIndex?: number;
  role?: string;
};

type MediaPayload = {
  deliver?: string;
  size?: string;
  storeId?: string;
  files?: MediaFile[];
  errors?: Array<{ productId?: string; code?: string; error?: string }>;
  brandName?: string;
  brandColors?: unknown;
  logoUrl?: string | null;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  faviconUrl?: string | null;
  note?: string;
};

export async function mediaContent(supabase: SupabaseClient, data: MediaPayload) {
  const size = data.size === "thumbnail" || data.size === "original" ? data.size : "medium";
  const storeId = typeof data.storeId === "string" ? data.storeId : "";
  const images: Array<Record<string, unknown>> = [];
  const errors = Array.isArray(data.errors) ? [...data.errors] : [];
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: ImageMime }> = [];

  for (const file of data.files ?? []) {
    const loaded = await loadFile(supabase, file, storeId, size);
    if (!loaded.ok) {
      errors.push({ productId: file.productId, code: loaded.code, error: loaded.error });
      continue;
    }
    images.push({
      productId: file.productId ?? null,
      title: file.title ?? null,
      role: file.role ?? "image",
      url: file.publicUrl ?? null,
      imageIndex: file.imageIndex ?? 0,
      width: loaded.width,
      height: loaded.height,
      byteSize: loaded.bytes.byteLength,
      mimeType: loaded.mimeType,
      size,
    });
    content.push({ type: "image", data: Buffer.from(loaded.bytes).toString("base64"), mimeType: loaded.mimeType });
  }

  const summary: Record<string, unknown> = { images, errors };
  if (data.brandName !== undefined) {
    summary.brandName = data.brandName;
    summary.brandColors = data.brandColors ?? [];
    summary.logoUrl = data.logoUrl ?? null;
    summary.logoLightUrl = data.logoLightUrl ?? null;
    summary.logoDarkUrl = data.logoDarkUrl ?? null;
    summary.faviconUrl = data.faviconUrl ?? null;
    summary.note = data.note ?? null;
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }, ...content],
    isError: images.length === 0 && errors.length > 0,
  };
}

async function loadFile(supabase: SupabaseClient, file: MediaFile, storeId: string, size: ImageSize) {
  const bucket = file.bucket === "product-media" || file.bucket === "email-media" ? file.bucket : "";
  const path = typeof file.path === "string" ? file.path : "";
  if (!bucket || !path.startsWith(`${storeId}/`) || path.includes("..")) {
    return { ok: false as const, code: "PERMISSION", error: "הקובץ לא שייך לחנות הזו" };
  }
  const width = size === "original" ? 0 : WIDTH[size];
  const fitted = width > 0 ? await download(supabase, bucket, path, width) : null;
  const bytes = fitted ?? (await download(supabase, bucket, path, 0));
  if (!bytes) return { ok: false as const, code: "NOT_FOUND", error: "הקובץ לא נמצא באחסון" };
  if (bytes.byteLength > BYTE_CAP[size]) {
    return { ok: false as const, code: "VALIDATION", error: "התמונה גדולה מדי לתשובה. בקשו גודל medium או thumbnail" };
  }
  const decoded = decodeImage(bytes);
  if (!decoded) return { ok: false as const, code: "VALIDATION", error: "הקובץ אינו JPEG, PNG או WebP" };
  return { ok: true as const, ...decoded };
}

async function download(supabase: SupabaseClient, bucket: string, path: string, width: number) {
  const options = width > 0 ? { transform: { width, resize: "contain" as const, quality: 80, format: "origin" as const } } : undefined;
  const { data, error } = await supabase.storage.from(bucket).download(path, options);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return bytes.byteLength > 0 ? bytes : null;
}

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
}

function jpegSize(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array) {
  const format = ascii(bytes, 12, 4);
  if (format === "VP8 " && bytes.length >= 30) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (format === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
    return { width, height };
  }
  if (format === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  return null;
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function safeDecode(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("%") ? null : decoded;
  } catch {
    return null;
  }
}
