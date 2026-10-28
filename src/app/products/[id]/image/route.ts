import { PhotosProError, replacePhotosProProductImage } from "@/lib/photospro/apply-product-update";
import { authorizedPhotosPro, photosProResponse } from "@/lib/photospro/http";

export async function PUT(request: Request, context: RouteContext<"/products/[id]/image">) {
  const auth = await authorizedPhotosPro(request);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { image_base64?: unknown } | null;
  const base64 = typeof body?.image_base64 === "string" ? body.image_base64.trim() : "";
  if (!base64) return photosProResponse({ error: "חסרה תמונה" }, 400);

  try {
    return photosProResponse(await replacePhotosProProductImage(auth.config, id, base64));
  } catch (error) {
    if (error instanceof PhotosProError) return photosProResponse({ error: error.message }, error.status);
    return photosProResponse({ error: "העלאת התמונה נכשלה" }, 500);
  }
}
