import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 120;

export function signPopupPreview(popupId: string, secret: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const body = `${popupId}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readPopupPreview(token: string, secret: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [popupId, expText, sig] = parts;
  if (!popupId || !expText || !sig || !/^[0-9a-f-]{36}$/i.test(popupId)) return null;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  const expected = createHmac("sha256", secret).update(`${popupId}.${expText}`).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return popupId;
}
