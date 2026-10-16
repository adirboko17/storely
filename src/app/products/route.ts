import { PhotosProError, listPhotosProProducts } from "@/lib/photospro/apply-product-update";
import { authorizedPhotosPro, photosProResponse } from "@/lib/photospro/http";

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
