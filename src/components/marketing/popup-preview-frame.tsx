"use client";

import { PopupStage } from "@/components/marketing/popup-view";
import { normalizeDesign } from "@/lib/marketing/popups";

export function PopupPreviewFrame({
  design,
  device,
  logoUrl,
  submitted,
}: {
  design: unknown;
  device: "desktop" | "mobile";
  logoUrl: string;
  submitted: boolean;
}) {
  return <PopupStage design={normalizeDesign(design)} device={device} logoUrl={logoUrl} submitted={submitted} />;
}
