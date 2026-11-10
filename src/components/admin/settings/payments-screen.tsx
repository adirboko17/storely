"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clearStorePayment,
  loadStorePayment,
  saveStorePayment,
  type StorePaymentAccount,
} from "@/app/admin/settings/payments/actions";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { Card } from "@/components/ui/card";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm outline-none focus:border-[#1a1a1a]";

function badge(connected: boolean) {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium"
      style={connected ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ffd6a4", color: "#5e4200" }}
    >
      {connected ? "מחובר" : "חסרים מפתחות"}
    </span>
  );
}

export function PaymentsScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const store = getStoreIdentity();
  const [account, setAccount] = useState<StorePaymentAccount | null>(null);
  const [terminal, setTerminal] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!store.storeId) return;
    let active = true;
    setLoading(true);
    void loadStorePayment(store.storeId).then((result) => {
      if (!active) return;
      if ("error" in result) {
        toast(result.error);
        setLoading(false);
        return;
      }
      setAccount(result.account);
      setTerminal(result.account.terminal);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [store.storeId, toast]);

  async function save() {
    if (!store.storeId || saving) return;
    setSaving(true);
    try {
      const result = await saveStorePayment(store.storeId, { terminal, apiKey, apiPassword });
      if ("error" in result) {
        toast(result.error);
        return;
      }
      setAccount(result.account);
      setTerminal(result.account.terminal);
      setApiKey("");
      setApiPassword("");
      setShowKey(false);
      setShowPassword(false);
      toast("הסליקה נשמרה");
    } finally {
      setSaving(false);
    }
  }

  async function clearKeys() {
    if (!store.storeId || !account?.connected || clearing) return;
    setClearing(true);
    try {
      const result = await clearStorePayment(store.storeId);
      if ("error" in result) {
        toast(result.error);
        return;
      }
      setAccount(result.account);
      setTerminal(result.account.terminal);
      setApiKey("");
      setApiPassword("");
      toast("המפתחות נמחקו");
    } finally {
      setClearing(false);
    }
  }

  const savedKey = account?.connected ? "מפתח שמור. הדביקו ערך חדש רק כדי להחליף." : "מהאזור אימות בפורטל Hyp.";

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="m-0 text-xl font-bold text-ink-strong">סליקה</h1>
        <p className="m-0 mt-1 text-[13px] leading-5 text-ink-secondary">
          המסוף של {store.name || "החנות"}. המפתחות נשמרים על החנות הזאת ולא מוצגים שוב אחרי השמירה.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Hyp</div>
            <div className="mt-0.5 text-[13px] text-ink-secondary">דף התשלום והזיכוי רצים דרך המסוף הזה.</div>
          </div>
          {account ? badge(account.connected) : null}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">מספר מסוף</span>
          <input
            value={terminal}
            onChange={(event) => setTerminal(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            disabled={loading}
            className={`${field} text-left`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">API Key</span>
          <span className="flex gap-2">
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              disabled={loading}
              className={`${field} text-left`}
            />
            <button type="button" className={softButton} onClick={() => setShowKey((value) => !value)}>
              {showKey ? "הסתרה" : "הצגה"}
            </button>
          </span>
          <span className="text-[12px] text-ink-secondary">{savedKey}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">PassP</span>
          <span className="flex gap-2">
            <input
              value={apiPassword}
              onChange={(event) => setApiPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              dir="ltr"
              disabled={loading}
              className={`${field} text-left`}
            />
            <button type="button" className={softButton} onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "הסתרה" : "הצגה"}
            </button>
          </span>
          <span className="text-[12px] text-ink-secondary">סיסמת ה-API מהפורטל, לא הסיסמה שבה נכנסים אליו.</span>
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-[#ebebeb] pt-4">
          {account?.connected ? (
            <button type="button" className={`${softButton} text-[#8e1f0b]`} disabled={clearing || saving} onClick={() => void clearKeys()}>
              {clearing ? "מוחק…" : "מחיקת המפתחות"}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={darkButton} disabled={loading || saving || clearing} onClick={() => void save()}>
            {saving ? "שומר…" : "שמירה"}
          </button>
        </div>
      </Card>
    </div>
  );
}
