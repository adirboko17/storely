"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icons";
import { getStoreIdentity } from "@/data/live/store-identity";
import {
  createMcpConnection,
  listMcpConnections,
  revokeMcpConnection,
  type McpConnection,
} from "@/app/admin/settings/ai/actions";

type Tool = "claude" | "chatgpt" | "cursor" | "grok";
type ClaudeWhere = "web" | "desktop";

const TOOLS: { id: Tool; label: string; detail: string }[] = [
  { id: "claude", label: "Claude", detail: "בדפדפן או במחשב" },
  { id: "chatgpt", label: "ChatGPT", detail: "חיבור מרוחק" },
  { id: "cursor", label: "Cursor", detail: "קובץ הגדרות" },
  { id: "grok", label: "Grok", detail: "מחבר מותאם" },
];

const NAME_PRESETS = ["Claude", "ChatGPT", "Cursor", "Grok"];

const ABILITIES: { icon: IconName; title: string; detail: string }[] = [
  { icon: "tag", title: "מוצרים", detail: "מחיר, מלאי וטיוטה" },
  { icon: "store", title: "קטגוריות", detail: "יצירה ועדכון" },
  { icon: "content", title: "מאמרים", detail: "כתיבה, עריכה והסתרה" },
  { icon: "user", title: "לקוחות", detail: "פרטים ולקוח חדש" },
  { icon: "orders", title: "הזמנות", detail: "סטטוס והזמנה חדשה" },
  { icon: "design", title: "המראה", detail: "לוגו, צבעים ומדיניות" },
];

function when(value: string | null) {
  if (!value) return "עדיין לא בשימוש";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "עדיין לא בשימוש";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function localAddress(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function SectionTitle({ index, title, hint }: { index: string; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-[12px] font-semibold text-white">
        {index}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 className="m-0 text-sm font-semibold text-[#1a1a1a]">{title}</h2>
        {hint ? <p className="mt-1 mb-0 text-[13px] leading-5 text-[#616161]">{hint}</p> : null}
      </div>
    </div>
  );
}

function ToolMark({ name }: { name: Tool }) {
  const common = { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true as const };
  if (name === "claude") {
    return (
      <svg {...common}>
        <path fill="#D97757" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
      </svg>
    );
  }
  if (name === "chatgpt") {
    return (
      <svg {...common}>
        <path fill="#000" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
      </svg>
    );
  }
  if (name === "cursor") {
    return (
      <svg {...common}>
        <path fill="#000" d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 35 33" width="18" height="18" aria-hidden>
      <path fill="#111" d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" />
      <path fill="#111" d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" />
    </svg>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {items.map((item, index) => (
        <li key={item} className="flex items-start gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f1f1f1] text-[12px] font-semibold text-[#1a1a1a]">
            {index + 1}
          </span>
          <span className="pt-0.5 text-sm leading-6 text-[#303030]">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function AiConnectionsScreen() {
  const { toast } = useAdmin();
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Tool>("claude");
  const [claudeWhere, setClaudeWhere] = useState<ClaudeWhere>("web");
  const [name, setName] = useState("Claude");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [copied, setCopied] = useState("");

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

  function selectTool(next: Tool) {
    setClient(next);
    setName((current) => {
      if (current.trim() && !NAME_PRESETS.includes(current)) return current;
      if (next === "chatgpt") return "ChatGPT";
      if (next === "cursor") return "Cursor";
      if (next === "grok") return "Grok";
      return "Claude";
    });
  }

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

  async function copy(value: string, key: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast("הועתק");
      window.setTimeout(() => setCopied((current) => (current === key ? "" : current)), 1600);
    } catch {
      toast("לא הצלחנו להעתיק");
    }
  }

  const tokenLabel = freshToken || "stly_המפתח_שלכם";
  const needsFile = client === "cursor" || (client === "claude" && claudeWhere === "desktop");
  const config = JSON.stringify(
    {
      mcpServers: {
        storely: {
          url: endpoint || "https://your-storely-host/api/mcp",
          headers: { Authorization: `Bearer ${tokenLabel}` },
        },
      },
    },
    null,
    2,
  );
  const headerValue = `Bearer ${tokenLabel}`;
  const onThisComputer = endpoint ? localAddress(endpoint) : false;

  const guide =
    client === "grok"
      ? [
          "ב-Grok פתחו את העמוד grok.com/connectors.",
          "בחרו New Connector, ואז Custom.",
          "הדביקו את הכתובת. Grok מקבל רק כתובת https ציבורית, לא localhost.",
          "באימות הדביקו את המפתח, או התחברו בחלון של Storely אם הוא נפתח.",
        ]
      : client === "chatgpt"
      ? [
          "ב-ChatGPT פתחו Connectors ובחרו חיבור MCP מרוחק.",
          "הדביקו את הכתובת מהשלב הקודם.",
          "הוסיפו כותרת: השם Authorization, והערך מתחיל ב-Bearer, רווח, ואז המפתח.",
          "שמרו. אם נפתח חלון של Storely, התחברו לאותו חשבון.",
        ]
      : client === "cursor"
        ? [
            "ב-Cursor פתחו Settings, ואז MCP.",
            "הוסיפו שרת חדש, או פתחו את הקובץ mcp.json.",
            "הדביקו את ההגדרה למטה ושמרו.",
            "ודאו שהשרת storely מופעל. ביטול המפתח כאן מנתק אותו מיד.",
          ]
        : claudeWhere === "desktop"
          ? [
              "פתחו את קובץ החיבורים של Claude Desktop או של Claude Code.",
              "הדביקו את ההגדרה למטה ושמרו.",
              "הפעילו מחדש את קלוד.",
              "ביטול המפתח כאן מנתק את הכלי מיד.",
            ]
          : [
              "ב-Claude פתחו Settings, ואז Connectors.",
              "בחרו Add custom connector. השם: Storely.",
              "הדביקו את הכתובת בשדה ה-URL.",
              "באימות בחרו Bearer והדביקו את המפתח מהשלב הקודם.",
            ];

  return (
    <div data-screen-label="Settings AI" className="min-h-full px-4 pt-6 pb-16 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[20px] font-bold text-[#1a1a1a]">חיבור AI</h1>
          <p className="mt-1.5 mb-0 max-w-[58ch] text-sm leading-6 text-[#616161]">
            המנוע עורך את החנות הזו כמוכם: מוצרים, מאמרים, קטגוריות והזמנות. הוא לא רואה חנות אחרת, ולא נוגע בדאטה או בקוד.
          </p>
        </div>

        <Card className="p-4">
          <SectionTitle index="1" title="בחרו את הכלי" hint="ההוראות מתעדכנות לפי הבחירה." />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => {
              const selected = client === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectTool(tool.id)}
                  className={`flex items-center gap-2.5 rounded-xl border-0 px-3 py-3 text-start ${
                    selected ? "bg-[#1a1a1a] text-white" : "bg-[#f6f6f6] text-[#1a1a1a] hover:bg-[#efefef]"
                  }`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                    <ToolMark name={tool.id} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tool.label}</span>
                    <span className={`mt-0.5 block text-[12px] leading-5 ${selected ? "text-white/70" : "text-[#616161]"}`}>
                      {tool.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
        <Card className="p-4">
          <SectionTitle index="2" title="העתיקו את הכתובת" hint="מדביקים אותה בשדה השרת של הכלי." />
          <div className="mt-3 flex items-center gap-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-[#f6f6f6] px-3 py-2.5 text-left text-[13px] text-[#1a1a1a]">
              {endpoint || "/api/mcp"}
            </code>
            <button type="button" className={softButton} disabled={!endpoint} onClick={() => copy(endpoint, "endpoint")}>
              {copied === "endpoint" ? "הועתק" : "העתקה"}
            </button>
          </div>
          {onThisComputer ? (
            <div className="mt-3 flex gap-2.5 rounded-lg bg-[#f6f6f6] px-3 py-2.5">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[#1a1a1a]" />
              <p className="m-0 text-[13px] leading-5 text-[#303030]">
                <span className="font-semibold">רק המחשב הזה רואה את הכתובת.</span> קלוד, ChatGPT ו-Grok בענן לא מגיעים אל localhost. אחרי העלאה מעתיקים כאן את הכתובת הציבורית, עם https.
              </p>
            </div>
          ) : (
            <p className="mt-3 mb-0 text-[13px] leading-5 text-[#616161]">
              הכלי צריך להגיע לכתובת מהאינטרנט, ב-https. אם הוא מבקש רק כתובת, בלי מפתח, הדביקו אותה. ייפתח חלון התחברות של Storely.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle index="3" title="צרו מפתח" hint="שם שתזהו אחר כך. המפתח עצמו מוצג פעם אחת." />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="שם החיבור"
              placeholder="למשל Claude או ChatGPT"
              className="h-[30px] min-w-0 flex-1 rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none"
            />
            <button type="button" className={darkButton} disabled={creating} onClick={() => void create()}>
              {creating ? "יוצר…" : "יצירת מפתח"}
            </button>
          </div>
          {freshToken ? (
            <div className="mt-3 rounded-lg bg-[#f6f6f6] p-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1a1a1a]">
                <Icon name="check" size={16} />
                העתיקו עכשיו. המפתח לא יוצג שוב.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-[13px] text-[#1a1a1a]">
                  {freshToken}
                </code>
                <button type="button" className={softButton} onClick={() => copy(freshToken, "token")}>
                  {copied === "token" ? "הועתק" : "העתקה"}
                </button>
              </div>
            </div>
          ) : null}
        </Card>
          </div>

        <Card className="p-4">
          <SectionTitle
            index="4"
            title={
              client === "chatgpt" ? "הדביקו ב-ChatGPT" : client === "cursor" ? "הדביקו ב-Cursor" : client === "grok" ? "הדביקו ב-Grok" : "הדביקו ב-Claude"
            }
            hint={freshToken ? "המפתח כבר בתוך מה שמעתיקים." : "אחרי יצירת המפתח, ההגדרה כאן מתמלאת לבד."}
          />
          {client === "claude" ? (
            <div className="mt-3 flex gap-1.5">
              {(
                [
                  ["web", "בדפדפן"],
                  ["desktop", "במחשב"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={claudeWhere === id}
                  onClick={() => setClaudeWhere(id)}
                  className={`h-8 rounded-lg border-0 px-3 text-[13px] font-semibold ${
                    claudeWhere === id ? "bg-[#1a1a1a] text-white" : "bg-[#f6f6f6] text-[#1a1a1a] hover:bg-[#efefef]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-4">
            <Steps items={guide} />
          </div>
          {needsFile ? (
            <div className="mt-4 overflow-hidden rounded-lg bg-[#1a1a1a]">
              <div className="flex items-center justify-between gap-3 px-3 pt-3">
                <div dir="ltr" className="text-[12px] text-white/60">
                  mcp.json
                </div>
                <button type="button" className={softButton} onClick={() => copy(config, "config")}>
                  {copied === "config" ? "הועתק" : "העתקת ההגדרה"}
                </button>
              </div>
              <pre dir="ltr" className="m-0 overflow-x-auto px-3 pt-2 pb-3 text-left text-[12px] leading-5 text-white">
                {config}
              </pre>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-1.5 text-[13px] font-semibold text-[#1a1a1a]">ערך הכותרת Authorization</div>
              <div className="flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-[#f6f6f6] px-3 py-2.5 text-left text-[13px] text-[#1a1a1a]">
                  {headerValue}
                </code>
                <button type="button" className={softButton} onClick={() => copy(headerValue, "header")}>
                  {copied === "header" ? "הועתק" : "העתקה"}
                </button>
              </div>
              <p className="mt-2 mb-0 text-[13px] leading-5 text-[#616161]">
                בשדה Bearer אפשר להדביק רק את המפתח, בלי המילה Bearer.
              </p>
            </div>
          )}
        </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="px-4 pt-4 text-sm font-semibold text-[#1a1a1a]">המפתחות שלי</div>
          <p className="mt-1 mb-0 px-4 text-[13px] leading-5 text-[#616161]">ביטול מנתק את הכלי מיד. אפשר עד שמונה מפתחות פעילים.</p>
          {loading ? <div className="px-4 py-6 text-sm text-[#616161]">טוען…</div> : null}
          {!loading && connections.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#616161]">עדיין אין מפתח. השם שתבחרו בשלב 3 יופיע כאן.</div>
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
          <div className="text-sm font-semibold text-[#1a1a1a]">מה המנוע יכול לעשות</div>
          <p className="mt-1 mb-0 text-[13px] leading-5 text-[#616161]">רק בחנות הזו, באותם דברים שאפשר לערוך גם מכאן.</p>
          <ul className="mt-3 mb-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {ABILITIES.map((item) => (
              <li key={item.title} className="flex items-center gap-3 rounded-xl bg-[#f6f6f6] px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-white text-[#1a1a1a] shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                  <Icon name={item.icon} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#1a1a1a]">{item.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-[#616161]">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 mb-0 text-[13px] leading-5 text-[#616161]">
            מחיקה, החזר כספי, הנחה וסימון הזמנה כשולמה מחכים לאישור מפורש.
          </p>
        </Card>
      </div>
    </div>
  );
}
