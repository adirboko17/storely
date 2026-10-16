import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { decodeImageBase64, matchProductsByTitle, orderedImages, type PhotosProUpdate } from "./payload";

const BUCKET = "product-media";

export class PhotosProError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PhotosProError";
    this.status = status;
  }
}

export type PhotosProConfig = {
  url: string;
  secret: string;
  apiKey: string;
  storeId: string;
};

export function photosProConfig(): PhotosProConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const apiKey = process.env.PHOTOSPRO_API_KEY;
  const storeId = process.env.PHOTOSPRO_STORE_ID;
  if (!url || !secret || !apiKey || !storeId) return null;
  return { url, secret, apiKey, storeId };
}

export function apiKeysMatch(provided: string | null, expected: string) {
  if (!provided) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function publicMediaUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

function adminClient(config: PhotosProConfig) {
  return createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function storeCurrency(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase.from("store_settings").select("currency").eq("store_id", storeId).maybeSingle();
  if (error) throw new PhotosProError(500, "לא הצלחנו לקרוא את מטבע החנות");
  const currency = typeof data?.currency === "string" && data.currency.trim() ? data.currency.trim().toUpperCase() : "ILS";
  return currency;
}

export async function listPhotosProProducts(config: PhotosProConfig) {
  const supabase = adminClient(config);
  const { data: products, error } = await supabase.from("products").select("id, title").eq("store_id", config.storeId).order("title");
  if (error) throw new PhotosProError(500, "לא הצלחנו לקרוא את המוצרים");
  const ids = (products ?? []).map((product) => product.id);
  const mediaByProduct = new Map<string, { url: string; position: number }[]>();
  if (ids.length > 0) {
    const { data: media, error: mediaError } = await supabase
      .from("product_media")
      .select("product_id, path, position")
      .eq("store_id", config.storeId)
      .in("product_id", ids)
      .order("position");
    if (mediaError) throw new PhotosProError(500, "לא הצלחנו לקרוא את התמונות");
    for (const item of media ?? []) {
      const list = mediaByProduct.get(item.product_id) ?? [];
      list.push({ url: publicMediaUrl(config.url, item.path), position: item.position + 1 });
      mediaByProduct.set(item.product_id, list);
    }
  }
  return (products ?? []).map((product) => {
    const images = mediaByProduct.get(product.id) ?? [];
    return { id: product.id, title: product.title, image_url: images[0]?.url ?? null, images };
  });
}

export async function applyPhotosProUpdate(config: PhotosProConfig, update: PhotosProUpdate) {
  const supabase = adminClient(config);
  if (update.currency) {
    const currency = await storeCurrency(supabase, config.storeId);
    if (update.currency !== currency) throw new PhotosProError(400, `המטבע של החנות הוא ${currency}`);
  }

  const { data: rows, error: listError } = await supabase.from("products").select("id, title").eq("store_id", config.storeId);
  if (listError) throw new PhotosProError(500, "לא הצלחנו לחפש את המוצר");
  const matches = matchProductsByTitle(rows ?? [], update.title);
  if (matches.length === 0) throw new PhotosProError(404, "המוצר לא נמצא");
  if (matches.length > 1) throw new PhotosProError(409, "נמצאו כמה מוצרים עם אותו שם");
  const product = matches[0];
  if (!product) throw new PhotosProError(404, "המוצר לא נמצא");

  const ordered = orderedImages(update.images);
  const decodedImages = ordered.map((image) => {
    const decoded = decodeImageBase64(image.base64);
    if (!decoded) throw new PhotosProError(400, "אחת התמונות אינה קובץ jpg, png, webp, gif או avif תקין");
    return { image, decoded };
  });

  const { data: priced, error: priceError } = await supabase
    .from("products")
    .update({ price: update.price, updated_at: new Date().toISOString() })
    .eq("store_id", config.storeId)
    .eq("id", product.id)
    .select("id");
  if (priceError || !priced?.length) throw new PhotosProError(500, "עדכון המחיר נכשל");

  const { data: variant, error: variantReadError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("store_id", config.storeId)
    .eq("product_id", product.id)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (variantReadError) throw new PhotosProError(500, "עדכון המחיר נכשל");
  if (variant?.id) {
    const { error: variantError } = await supabase
      .from("product_variants")
      .update({ price: update.price })
      .eq("store_id", config.storeId)
      .eq("id", variant.id);
    if (variantError) throw new PhotosProError(500, "עדכון המחיר נכשל");
  }

  if (decodedImages.length === 0) {
    const { data: current, error: currentError } = await supabase
      .from("product_media")
      .select("path, position")
      .eq("store_id", config.storeId)
      .eq("product_id", product.id)
      .order("position");
    if (currentError) throw new PhotosProError(500, "קריאת התמונות נכשלה");
    const images = (current ?? []).map((item) => ({
      url: publicMediaUrl(config.url, item.path),
      position: item.position + 1,
    }));
    return {
      success: true as const,
      id: product.id,
      title: product.title,
      image_url: images[0]?.url ?? null,
      images,
    };
  }

  const { data: previous, error: previousError } = await supabase
    .from("product_media")
    .select("path")
    .eq("store_id", config.storeId)
    .eq("product_id", product.id);
  if (previousError) throw new PhotosProError(500, "שמירת התמונות נכשלה");

  const uploaded: string[] = [];
  let saved = false;
  try {
    for (const { decoded } of decodedImages) {
      const path = `${config.storeId}/${product.id}/${randomUUID()}.${decoded.extension}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decoded.bytes, {
        contentType: decoded.contentType,
        upsert: false,
      });
      if (uploadError) throw new PhotosProError(500, "העלאת התמונה נכשלה");
      uploaded.push(path);
    }

    const { error: insertError } = await supabase.from("product_media").insert(
      uploaded.map((path, index) => ({
        store_id: config.storeId,
        product_id: product.id,
        path,
        position: index,
      })),
    );
    if (insertError) throw new PhotosProError(500, "שמירת התמונות נכשלה");
    saved = true;

    const stale = (previous ?? [])
      .map((item) => item.path)
      .filter((path): path is string => typeof path === "string" && !uploaded.includes(path));
    if (stale.length > 0) {
      const { error: deleteError } = await supabase.from("product_media").delete().eq("store_id", config.storeId).eq("product_id", product.id).in("path", stale);
      if (deleteError) throw new PhotosProError(500, "שמירת התמונות נכשלה");
      const removable = stale.filter((path) => path.startsWith(`${config.storeId}/${product.id}/`) && !path.startsWith("http"));
      if (removable.length > 0) await supabase.storage.from(BUCKET).remove(removable);
    }
  } catch (error) {
    if (!saved && uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
    throw error;
  }

  const images = ordered.map((image, index) => ({
    url: publicMediaUrl(config.url, uploaded[index] ?? ""),
    position: image.position,
  }));
  const primary = ordered.findIndex((image) => image.primary);
  return {
    success: true as const,
    id: product.id,
    title: product.title,
    image_url: images[primary >= 0 ? primary : 0]?.url ?? null,
    images,
  };
}

export async function createPhotosProProduct(config: PhotosProConfig, update: PhotosProUpdate) {
  const supabase = adminClient(config);
  if (update.currency) {
    const currency = await storeCurrency(supabase, config.storeId);
    if (update.currency !== currency) throw new PhotosProError(400, `המטבע של החנות הוא ${currency}`);
  }

  const title = update.title.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const { data: rows, error: listError } = await supabase.from("products").select("id, title").eq("store_id", config.storeId);
  if (listError) throw new PhotosProError(500, "לא הצלחנו לחפש את המוצר");
  if (matchProductsByTitle(rows ?? [], title).length > 0) {
    throw new PhotosProError(409, "כבר יש מוצר עם השם הזה");
  }

  const ordered = orderedImages(update.images);
  const decodedImages = ordered.map((image) => {
    const decoded = decodeImageBase64(image.base64);
    if (!decoded) throw new PhotosProError(400, "אחת התמונות אינה קובץ jpg, png, webp, gif או avif תקין");
    return decoded;
  });

  const { data: created, error: createError } = await supabase
    .from("products")
    .insert({ store_id: config.storeId, title, price: update.price, status: "active" })
    .select("id, title")
    .single();
  if (createError || !created) throw new PhotosProError(500, "יצירת המוצר נכשלה");

  const { error: variantError } = await supabase.from("product_variants").insert({
    store_id: config.storeId,
    product_id: created.id,
    title: "",
    price: update.price,
    position: 0,
  });
  if (variantError) {
    await supabase.from("products").delete().eq("store_id", config.storeId).eq("id", created.id);
    throw new PhotosProError(500, "יצירת המוצר נכשלה");
  }

  if (decodedImages.length === 0) return { id: created.id, title: created.title, image_url: null };

  const uploaded: string[] = [];
  try {
    for (const decoded of decodedImages) {
      const path = `${config.storeId}/${created.id}/${randomUUID()}.${decoded.extension}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decoded.bytes, {
        contentType: decoded.contentType,
        upsert: false,
      });
      if (uploadError) throw new PhotosProError(500, "העלאת התמונה נכשלה");
      uploaded.push(path);
    }
    const { error: mediaError } = await supabase.from("product_media").insert(
      uploaded.map((path, index) => ({
        store_id: config.storeId,
        product_id: created.id,
        path,
        position: index,
      })),
    );
    if (mediaError) throw new PhotosProError(500, "שמירת התמונות נכשלה");
  } catch (error) {
    if (uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from("product_media").delete().eq("store_id", config.storeId).eq("product_id", created.id);
    await supabase.from("product_variants").delete().eq("store_id", config.storeId).eq("product_id", created.id);
    await supabase.from("products").delete().eq("store_id", config.storeId).eq("id", created.id);
    throw error;
  }

  return {
    id: created.id,
    title: created.title,
    image_url: publicMediaUrl(config.url, uploaded[0] ?? ""),
  };
}
