"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { Card } from "@/components/ui/card";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { createOrderReadKey, listOrderReadKeys, revokeOrderReadKey, type OrderReadKey } from "@/app/admin/orders/feed/actions";

function when(value: string | null) {
  if (!value) return "עדיין לא בשימוש";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "עדיין לא בשימוש";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function OrderFeedScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const storeId = getStoreIdentity().storeId;
  const [keys, setKeys] = useState<OrderReadKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("מערכת ההזמנות");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState("");
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/orders/feed`);
    if (!storeId) return;
    let active = true;
    void listOrderReadKeys(storeId).then((result) => {
      if (!active) return;
      if ("error" in result) toast(result.error);
      else setKeys(result.keys);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [storeId, toast]);

  async function create() {
    if (!storeId) return;
    setCreating(true);
    const result = await createOrderReadKey(storeId, name.trim() || "מערכת ההזמנות");
    setCreating(false);
    if ("error" in result) {
      toast(result.error);
      return;
    }
    setFreshToken(result.token);
    setKeys((current) => [result.key, ...current]);
    toast("המפתח מוכן. העתיקו אותו עכשיו");
  }

  async function revoke(key: OrderReadKey) {
    if (!storeId) return;
    const result = await revokeOrderReadKey(storeId, key.id);
    if ("error" in result) {
      toast(result.error);
      return;
    }
    setKeys((current) => current.filter((item) => item.id !== key.id));
    toast("המפתח בוטל");
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("הועתק");
    } catch {
      toast("לא הצלחנו להעתיק");
    }
  }

  return (
    <div className="min-h-full px-4 pt-6 pb-16 sm:px-6">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[20px] font-bold text-[#1a1a1a]">מפתח קריאה להזמנות</h1>
          <p className="mt-1.5 mb-0 max-w-[62ch] text-sm leading-6 text-[#616161]">
            המפתח מיועד לשרת בלבד. הוא קורא הזמנות חדשות ומעודכנות, כולל שאלות הצ׳קאאוט וההסכמה לדיוור, ולא יכול לשנות כלום.
          </p>
        </div>

        <Card className="p-4">
          <div className="text-sm font-semibold text-[#1a1a1a]">הכתובת</div>
          <div className="mt-3 flex items-center gap-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-[#f6f6f6] px-3 py-2.5 text-left text-[13px] text-[#1a1a1a]">
              {endpoint || "/api/orders/feed"}
            </code>
            <button type="button" className={softButton} disabled={!endpoint} onClick={() => void copy(endpoint)}>העתקה</button>
          </div>
          <p className="mt-3 mb-0 text-[13px] leading-5 text-[#616161]">
            קריאה עם הכותרת Authorization, הערך מתחיל ב-Bearer ואז המפתח. אפשר להוסיף updated_since עם הזמן של ההזמנה האחרונה שכבר נקלטה, ו-after עם המזהה שלה.
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-[#1a1a1a]">יצירת מפתח</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="שם המפתח"
              className="h-[30px] min-w-0 flex-1 rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none"
            />
            <button type="button" className={darkButton} disabled={creating} onClick={() => void create()}>
              {creating ? "יוצר…" : "יצירת מפתח"}
            </button>
          </div>
          {freshToken ? (
            <div className="mt-3 rounded-lg bg-[#f6f6f6] p-3">
              <div className="text-[13px] font-semibold text-[#1a1a1a]">העתיקו עכשיו. המפתח לא יוצג שוב.</div>
              <div className="mt-2 flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-[13px] text-[#1a1a1a]">{freshToken}</code>
                <button type="button" className={softButton} onClick={() => void copy(freshToken)}>העתקה</button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 pt-4 text-sm font-semibold text-[#1a1a1a]">מפתחות פעילים</div>
          {loading ? <div className="px-4 py-6 text-sm text-[#616161]">טוען…</div> : null}
          {!loading && keys.length === 0 ? <div className="px-4 py-6 text-sm text-[#616161]">עדיין אין מפתח.</div> : null}
          {keys.length > 0 ? (
            <ul className="m-0 list-none px-2 pt-2 pb-2">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#1a1a1a]">{key.name}</div>
                    <div dir="ltr" className="truncate text-right text-[12px] text-[#616161]">{key.tokenPrefix}… · {when(key.lastUsedAt)}</div>
                  </div>
                  <button type="button" className={softButton} onClick={() => void revoke(key)}>ביטול</button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
