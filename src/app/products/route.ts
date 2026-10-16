import { PhotosProError, createPhotosProProduct, listPhotosProProducts } from "@/lib/photospro/apply-product-update";
import { authorizedPhotosPro, photosProResponse } from "@/lib/photospro/http";
import { parsePhotosProBody } from "@/lib/photospro/payload";

export async function GET(request: Request) {
  const auth = authorizedPhotosPro(request);
  if ("response" in auth) return auth.response;
  try {
    const products = await listPhotosProProducts(auth.config);
    return photosProResponse({ products });
  } catch (error) {
    if (error instanceof PhotosProError) return photosProResponse({ error: error.message }, error.status);
    return photosProResponse({ error: "קריאת המוצרים נכשלה" }, 500);
  }
}

export async function POST(request: Request) {
  const auth = authorizedPhotosPro(request);
  if ("response" in auth) return auth.response;
  const parsed = parsePhotosProBody(await request.json().catch(() => null));
  if (!parsed.ok) return photosProResponse({ error: parsed.error }, 400);
  try {
    return photosProResponse(await createPhotosProProduct(auth.config, parsed.value));
  } catch (error) {
    if (error instanceof PhotosProError) return photosProResponse({ error: error.message }, error.status);
    return photosProResponse({ error: "יצירת המוצר נכשלה" }, 500);
  }
}
