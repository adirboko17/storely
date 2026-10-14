import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const bucket = "email-media";
const kinds = ["jpg", "png", "webp", "gif", "avif"];

export async function uploadEmailImage(storeId: string, file: File) {
  if (!storeId) throw new Error("לא נמצאה חנות להעלאה");
  if (!file.type.startsWith("image/")) throw new Error("אפשר להעלות רק תמונה");
  if (file.size > 5 * 1024 * 1024) throw new Error("התמונה גדולה מ-5MB");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  if (!extension || !kinds.includes(extension)) throw new Error("אפשר לשמור רק תמונות jpg, png, webp, gif או avif");
  const path = `${storeId}/emails/${crypto.randomUUID()}.${extension}`;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("העלאת התמונה נכשלה");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export async function uploadStoreLogo(storeId: string, file: File) {
  if (!storeId) throw new Error("לא נמצאה חנות להעלאה");
  if (!file.type.startsWith("image/")) throw new Error("אפשר להעלות רק תמונה");
  if (file.size > 5 * 1024 * 1024) throw new Error("התמונה גדולה מ-5MB");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  if (!extension || !kinds.includes(extension)) throw new Error("אפשר לשמור רק תמונות jpg, png, webp, gif או avif");
  const path = `${storeId}/brand/${crypto.randomUUID()}.${extension}`;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("העלאת הלוגו נכשלה");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
