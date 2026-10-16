import { NextResponse } from "next/server";
import { apiKeysMatch, photosProConfig, type PhotosProConfig } from "./apply-product-update";

export function photosProResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function authorizedPhotosPro(request: Request): { config: PhotosProConfig } | { response: NextResponse } {
  const config = photosProConfig();
  if (!config) return { response: photosProResponse({ error: "חיבור PhotosPro אינו מוגדר בשרת" }, 503) };
  if (!apiKeysMatch(request.headers.get("x-api-key"), config.apiKey)) {
    return { response: photosProResponse({ error: "Unauthorized" }, 401) };
  }
  return { config };
}
