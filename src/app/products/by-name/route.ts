import { NextResponse } from "next/server";
import { apiKeysMatch, applyPhotosProUpdate, PhotosProError, photosProConfig } from "@/lib/photospro/apply-product-update";
import { parsePhotosProBody } from "@/lib/photospro/payload";

export async function PUT(request: Request) {
  const config = photosProConfig();
  if (!config) {
    return NextResponse.json({ error: "חיבור PhotosPro אינו מוגדר בשרת" }, { status: 503 });
  }
  if (!apiKeysMatch(request.headers.get("x-api-key"), config.apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePhotosProBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await applyPhotosProUpdate(config, parsed.value);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PhotosProError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "עדכון המוצר נכשל" }, { status: 500 });
  }
}
