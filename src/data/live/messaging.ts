export type MessagingChannel = {
  saved: boolean;
  marketing: boolean;
  login: boolean;
};

export type StoreMessagingStatus = {
  email: MessagingChannel & { fromEmail: string; fromName: string; hint: string };
  sms: MessagingChannel & { user: string; from: string };
};

export function emptyMessaging(): StoreMessagingStatus {
  return {
    email: { saved: false, fromEmail: "", fromName: "", marketing: false, login: false, hint: "" },
    sms: { saved: false, user: "", from: "", marketing: false, login: false },
  };
}

function flag(value: unknown) {
  return value === true;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseMessaging(value: unknown): StoreMessagingStatus {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const email = payload.email && typeof payload.email === "object" ? (payload.email as Record<string, unknown>) : {};
  const sms = payload.sms && typeof payload.sms === "object" ? (payload.sms as Record<string, unknown>) : {};
  return {
    email: {
      saved: flag(email.saved),
      fromEmail: text(email.fromEmail),
      fromName: text(email.fromName),
      marketing: flag(email.marketing),
      login: flag(email.login),
      hint: text(email.hint).slice(-4),
    },
    sms: {
      saved: flag(sms.saved),
      user: text(sms.user),
      from: text(sms.from),
      marketing: flag(sms.marketing),
      login: flag(sms.login),
    },
  };
}

export function channelLabel(channel: MessagingChannel) {
  if (channel.saved && channel.marketing) return "מחובר";
  if (channel.saved) return "שמור, כבוי לאוטומציות";
  return "לא מחובר";
}
