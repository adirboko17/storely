import { PhotosProError, applyPhotosProUpdate } from "@/lib/photospro/apply-product-update";
import { authorizedPhotosPro, photosProResponse } from "@/lib/photospro/http";
import { parsePhotosProBody } from "@/lib/photospro/payload";

export async function PUT(request: Request) {
  const auth = await authorizedPhotosPro(request);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = parsePhotosProBody(body);
  if (!parsed.ok) return photosProResponse({ error: parsed.error }, 400);

  try {
    return photosProResponse(await applyPhotosProUpdate(auth.config, parsed.value));
  } catch (error) {
    if (error instanceof PhotosProError) return photosProResponse({ error: error.message }, error.status);
    return photosProResponse({ error: "עדכון המוצר נכשל" }, 500);
  }
}
