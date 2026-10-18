"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { Card } from "@/components/ui/card";
import { getStoreIdentity } from "@/data/live/store-identity";
import {
  createMcpConnection,
  listMcpConnections,
  revokeMcpConnection,
  type McpConnection,
} from "@/app/admin/settings/ai/actions";

function when(value: string | null) {
  if (!value) return "עדיין לא בשימוש";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "עדיין לא בשימוש";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AiConnectionsScreen() {
  const { toast } = useAdmin();
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Claude");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState("");
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/mcp`);
    const storeId = getStoreIdentity().storeId;
    if (!storeId) {
      setLoading(false);
      return;
    }
    void listMcpConnections(storeId).then((result) => {
      if ("error" in result) toast(result.error);
      else setConnections(result.connections);
      setLoading(false);
    });
  }, [toast]);

  async function create() {
    const storeId = getStoreIdentity().storeId;
    if (!storeId || creating) return;
    setCreating(true);
    const result = await createMcpConnection(storeId, name);
    setCreating(false);
    if ("error" in result) {
      toast(result.error);
      return;
    }
    setFreshToken(result.token);
    setConnections((current) => [result.connection, ...current.filter((item) => item.id !== result.connection.id)]);
  }

  async function revoke(connection: McpConnection) {
    const storeId = getStoreIdentity().storeId;
    if (!storeId) return;
    const result = await revokeMcpConnection(storeId, connection.id);
    if ("error" in result) {
      toast(result.error);
      return;
    }
    setConnections((current) => current.filter((item) => item.id !== connection.id));
    toast("החיבור בוטל");
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("הועתק");
    } catch {
      toast("לא הצלחנו להעתיק");
    }
  }

  const config = JSON.stringify(
    {
      mcpServers: {
        storely: {
          url: endpoint || "https://your-storely-host/api/mcp",
          headers: { Authorization: `Bearer ${freshToken || "stly_המפתח_שלכם"}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div data-screen-label="Settings AI" className="min-h-full px-4 pt-5 pb-16 sm:px-6">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[20px] font-bold text-[#1a1a1a]">חיבור AI</h1>
          <p className="mt-1 mb-0 max-w-[62ch] text-sm leading-6 text-[#616161]">
            בקלוד, ב-Cursor או ב-ChatGPT מדביקים רק את הכתובת. נפתח חלון התחברות של Storely, והכלי פועל בשמכם. מפתח אישי נשאר אפשרות לכלים ישנים יותר.
          </p>
        </div>

        <Card className="p-4">
          <div className="text-sm font-semibold text-[#1a1a1a]">כתובת השרת</div>
          <div className="mt-2 flex items-center gap-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-[#f6f6f6] px-3 py-2 text-left text-[13px] text-[#1a1a1a]">
              {endpoint || "/api/mcp"}
            </code>
            <button type="button" className={softButton} onClick={() => copy(endpoint)}>
              העתקה
            </button>
          </div>
          <p className="mt-3 mb-0 text-[13px] leading-5 text-[#616161]">
            הכלי צריך להגיע לכתובת הזו מהאינטרנט, ב-HTTPS. מפתח שנוצר כאן לא עובד מול כתובת מקומית של המחשב.
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-[#1a1a1a]">מפתח חדש</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="שם החיבור"
              placeholder="למשל Claude או ChatGPT"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm text-ink outline-none"
            />
            <button type="button" className={darkButton} disabled={creating} onClick={() => void create()}>
              {creating ? "יוצר…" : "יצירת מפתח"}
            </button>
          </div>
          {freshToken ? (
            <div className="mt-3 rounded-lg bg-[#f6f6f6] p-3">
              <div className="text-[13px] font-semibold text-[#1a1a1a]">העתיקו את המפתח עכשיו. הוא לא יוצג שוב.</div>
              <div className="mt-2 flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-[13px]">
                  {freshToken}
                </code>
                <button type="button" className={softButton} onClick={() => copy(freshToken)}>
                  העתקה
                </button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 pt-4 text-sm font-semibold text-[#1a1a1a]">המפתחות שלי</div>
          {loading ? <div className="px-4 py-6 text-sm text-[#616161]">טוען…</div> : null}
          {!loading && connections.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#616161]">עדיין אין מפתח. צרו אחד והדביקו אותו בכלי.</div>
          ) : null}
          {connections.length > 0 ? (
            <ul className="m-0 list-none px-2 pt-2 pb-2">
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#1a1a1a]">{connection.name}</div>
                    <div dir="ltr" className="truncate text-right text-[12px] text-[#616161]">
                      {connection.tokenPrefix}… · {when(connection.lastUsedAt)}
                    </div>
                  </div>
                  <button type="button" className={softButton} onClick={() => void revoke(connection)}>
                    ביטול
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-[#1a1a1a]">איך מחברים</div>
          <ol className="mt-2 mb-0 list-decimal space-y-1.5 pr-5 text-sm leading-6 text-[#303030]">
            <li>צרו מפתח ושמרו אותו. הביטול כאן מנתק את הכלי מיד.</li>
            <li>ב-Claude Desktop או Claude Code הדביקו את ההגדרה למטה בקובץ החיבורים.</li>
            <li>בקלוד בדפדפן: Connectors, חיבור מותאם, אותה כתובת, והמפתח כ-Bearer.</li>
            <li>ב-ChatGPT: חיבור MCP מרוחק עם אותה כתובת וכותרת Authorization.</li>
          </ol>
          <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg bg-[#1a1a1a] p-3 text-left text-[12px] leading-5 text-white">
            {config}
          </pre>
          <button type="button" className={`${softButton} mt-3`} onClick={() => copy(config)}>
            העתקת ההגדרה
          </button>
        </Card>
      </div>
    </div>
  );
}
