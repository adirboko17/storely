export type IncomingImage = {
  base64: string;
  position: number;
  primary: boolean;
};

export type PhotosProUpdate = {
  title: string;
  price: number;
  currency: string | null;
  images: IncomingImage[];
};

export type DecodedImage = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";
  extension: "jpg" | "png" | "webp" | "gif" | "avif";
};

const MAX_DECODED_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_CHARS = 8_000_000;

export function normalizeProductTitle(title: string) {
  return title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

export function matchProductsByTitle<T extends { title: string }>(products: T[], title: string) {
  const key = normalizeProductTitle(title);
  if (!key) return [];
  return products.filter((product) => normalizeProductTitle(product.title) === key);
}

function rawBase64(input: string) {
  const trimmed = input.trim();
  const comma = trimmed.indexOf(",");
  const payload = /^data:/i.test(trimmed) && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  return payload.replace(/\s/g, "");
}

export function decodeImageBase64(input: string): DecodedImage | null {
  const raw = rawBase64(input);
  if (!raw || raw.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_DECODED_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { bytes, contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { bytes, contentType: "image/png", extension: "png" };
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { bytes, contentType: "image/gif", extension: "gif" };
  }
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { bytes, contentType: "image/webp", extension: "webp" };
  }
  if (bytes.length > 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return { bytes, contentType: "image/avif", extension: "avif" };
  }
  return null;
}

function imageRecord(value: unknown, fallbackPosition: number): IncomingImage | string {
  if (!value || typeof value !== "object") return "תמונה לא תקינה";
  const record = value as Record<string, unknown>;
  const base64 = typeof record.image_base64 === "string" ? record.image_base64.trim() : "";
  if (!base64) return "חסרה תמונה";
  const position = typeof record.position === "number" && Number.isFinite(record.position) ? record.position : fallbackPosition;
  return { base64, position, primary: record.primary === true };
}

export function parsePhotosProBody(body: unknown): { ok: true; value: PhotosProUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "גוף הבקשה אינו JSON" };
  const record = body as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  if (!normalizeProductTitle(title)) return { ok: false, error: "חסר שם מוצר" };

  const price = typeof record.price === "number" ? record.price : typeof record.price === "string" ? Number(record.price) : Number.NaN;
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return { ok: false, error: "מחיר לא תקין" };

  const currency = typeof record.currency === "string" && record.currency.trim() ? record.currency.trim().toUpperCase() : null;
  const images: IncomingImage[] = [];
  if (Array.isArray(record.images)) {
    for (let index = 0; index < record.images.length; index += 1) {
      const parsed = imageRecord(record.images[index], index + 1);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      images.push(parsed);
    }
  } else if (record.images != null) {
    return { ok: false, error: "רשימת התמונות אינה תקינה" };
  }

  const main = typeof record.image_base64 === "string" ? record.image_base64.trim() : "";
  if (main) {
    const existing = images.find((image) => rawBase64(image.base64) === rawBase64(main));
    if (existing) {
      images.forEach((image) => {
        image.primary = image === existing;
      });
    } else {
      images.forEach((image) => {
        image.primary = false;
      });
      images.unshift({ base64: main, position: 1, primary: true });
    }
  }

  if (images.length > 12) return { ok: false, error: "אפשר לשלוח עד 12 תמונות" };
  if (!images.some((image) => image.primary) && images.length > 0) {
    const first = images.reduce((best, image) => (image.position < best.position ? image : best));
    first.primary = true;
  }

  return {
    ok: true,
    value: {
      title,
      price: Math.round(price * 100) / 100,
      currency,
      images,
    },
  };
}

/** Primary image first, then the rest by position. The admin catalog treats the first photo as the main photo. */
export function orderedImages(images: IncomingImage[]) {
  const primary = images.find((image) => image.primary) ?? images[0];
  if (!primary) return [];
  const rest = images.filter((image) => image !== primary).sort((a, b) => a.position - b.position);
  return [primary, ...rest];
}
