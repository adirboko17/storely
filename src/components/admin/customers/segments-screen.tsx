"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IndexDock } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { customerSpent } from "@/components/admin/customers/customers-list-screen";
import { getPeopleVersion, listPeople, profileOf, subscribePeople } from "@/data/mock/people-session";
import { getOrderSessionVersion, subscribeOrderSession } from "@/data/mock/order-session";
import { formatInteger, formatMoney } from "@/lib/formatting/money";
import { QuizSegmentCard } from "@/components/admin/customers/quiz-segment-card";
import { listCustomerSegments, matchesCustomerSegment, saveCustomerSegment, type CustomerSegment } from "@/lib/marketing/customer-segments";
import { saveCampaign } from "@/lib/marketing/campaigns";

const SAVED = [
  { name: "לקוחות VIP", minSpent: "1500", minOrders: "5", subOnly: false },
  { name: "מנויים לדיוור", minSpent: "0", minOrders: "0", subOnly: true },
  { name: "לקוחות חדשים", minSpent: "0", minOrders: "1", subOnly: false },
  { name: "רכשו יותר מפעמיים", minSpent: "0", minOrders: "3", subOnly: false },
];

const PAGE_SIZE = 50;

export function SegmentsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const peopleVersion = useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  const orderVersion = useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const people = useMemo(() => listPeople(), [peopleVersion]);
  const [name, setName] = useState("לקוחות VIP");
  const [minSpent, setMinSpent] = useState("1500");
  const [minOrders, setMinOrders] = useState("5");
  const [subOnly, setSubOnly] = useState(false);
  const [savedName, setSavedName] = useState("לקוחות VIP");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quizEditId, setQuizEditId] = useState<string | null>(null);
  const [stored, setStored] = useState<CustomerSegment[]>([]);
  const [page, setPage] = useState(0);
  const rules = { minSpent: Number(minSpent || 0), minOrders: Number(minOrders || 0), subscribedOnly: subOnly };

  useEffect(() => {
    let alive = true;
    listCustomerSegments().then((rows) => { if (alive) setStored(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [toast]);

  const rows = useMemo(() => people
    .map((person) => ({ person, profile: profileOf(person), orders: person.orders, spent: customerSpent(person.id, person.orders) }))
    .filter((row) => matchesCustomerSegment(row.person, row.profile, rules)),
  [people, orderVersion, rules.minSpent, rules.minOrders, rules.subscribedOnly]);

  function applySegment(segment: CustomerSegment) {
    setEditingId(segment.id);
    setName(segment.name);
    setMinSpent(String(segment.minSpent));
    setMinOrders(String(segment.minOrders));
    setSubOnly(segment.subscribedOnly);
    setSavedName(segment.name);
  }

  async function persistSegment() {
    const saved = await saveCustomerSegment({ id: editingId, name, minSpent: rules.minSpent, minOrders: rules.minOrders, subscribedOnly: rules.subscribedOnly });
    setEditingId(saved.id);
    setSavedName(saved.name);
    setStored((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((left, right) => left.name.localeCompare(right.name, "he")));
    return saved;
  }

  useEffect(() => {
    setPage(0);
  }, [minSpent, minOrders, subOnly]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(rows.length, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">פלחי לקוחות</h1>
        <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={() => { setEditingId(null); setSavedName(""); setName("פלח חדש"); setMinSpent("0"); setMinOrders("0"); setSubOnly(false); }}>יצירת פלח</button>
      </div>
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_0_rgba(26,26,26,.07)]">
          <div className="bg-[#f7f7f7] px-4 py-3 text-[13px] font-semibold text-ink-secondary">פלחים שמורים</div>
          {SAVED.map((item) => (
            <button key={item.name} type="button" className="flex w-full items-center gap-2 border-0 border-t border-[#ebebeb] px-4 py-3 text-start text-sm" style={{ background: savedName === item.name ? "#f1f1f1" : "#fff", fontWeight: savedName === item.name ? 600 : 400 }} onClick={() => { const saved = stored.find((segment) => segment.name === item.name); if (saved) applySegment(saved); else { setEditingId(null); setName(item.name); setMinSpent(item.minSpent); setMinOrders(item.minOrders); setSubOnly(item.subOnly); setSavedName(item.name); } }}>
              <span className="flex-1">{item.name}</span>
            </button>
          ))}
          {stored.filter((segment) => !SAVED.some((item) => item.name === segment.name)).map((segment) => (
            <button key={segment.id} type="button" className="flex w-full items-center gap-2 border-0 border-t border-[#ebebeb] px-4 py-3 text-start text-sm" style={{ background: editingId === segment.id || quizEditId === segment.id ? "#f1f1f1" : "#fff", fontWeight: editingId === segment.id || quizEditId === segment.id ? 600 : 400 }} onClick={() => { if (segment.source === "quiz") { setQuizEditId(segment.id); setEditingId(null); document.getElementById("quiz-segment")?.scrollIntoView({ block: "start" }); return; } setQuizEditId(null); applySegment(segment); }}>
              <span className="flex-1">{segment.name}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
            <label className="block font-medium">שם הפלח<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-sm font-normal outline-none" /></label>
            <div className="font-semibold">תנאים</div>
            <div className="grid items-center gap-2 rounded-[10px] border border-[#e3e3e3] px-3 py-2 min-[700px]:grid-cols-[minmax(0,1fr)_auto_140px]">
              <span>סכום שהוצא</span><span className="text-[13px] text-ink-secondary">לפחות</span>
              <input dir="ltr" value={minSpent} onChange={(event) => setMinSpent(event.target.value)} className="h-8 rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-end text-sm outline-none" />
            </div>
            <div className="grid items-center gap-2 rounded-[10px] border border-[#e3e3e3] px-3 py-2 min-[700px]:grid-cols-[minmax(0,1fr)_auto_140px]">
              <span>מספר הזמנות</span><span className="text-[13px] text-ink-secondary">לפחות</span>
              <input dir="ltr" type="number" min={0} value={minOrders} onChange={(event) => setMinOrders(event.target.value)} className="h-8 rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-end text-sm outline-none" />
            </div>
            <label className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] p-3"><input type="checkbox" checked={subOnly} onChange={(event) => setSubOnly(event.target.checked)} className="size-4 accent-[#303030]" />רק לקוחות שמנויים לדיוור בדוא״ל</label>
            <code dir="ltr" className="block rounded-lg bg-[#f7f7f7] p-2 text-left text-xs">{`spent >= ${minSpent || 0} AND orders >= ${minOrders || 0}${subOnly ? " AND subscribed" : ""}`}</code>
            <div className="flex justify-end gap-2">
              <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => void persistSegment().then(async (saved) => { const campaign = await saveCampaign({ name: saved.name, messageId: null, audience: "subscribed", lookbackDays: null, savedSegmentId: saved.id }); router.push(`/admin/marketing/campaigns/${campaign.id}`); }).catch((error: Error) => toast(error.message))}>שליחת קמפיין לפלח</button>
              <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={() => void persistSegment().then(() => toast("הפלח נשמר. הוא זמין בקמפיינים ובאוטומציות")).catch((error: Error) => toast(error.message))}>שמירת פלח</button>
            </div>
          </div>
          <QuizSegmentCard
            editing={stored.find((segment) => segment.id === quizEditId) ?? null}
            onCreate={() => setQuizEditId(null)}
            onSaved={(segment) => {
              setQuizEditId(null);
              setStored((current) => [segment, ...current.filter((item) => item.id !== segment.id)].sort((left, right) => left.name.localeCompare(right.name, "he")));
            }}
          />
          <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
            <div className="flex items-baseline gap-2 px-4 pt-4 pb-3"><h2 className="m-0 text-[15px] font-bold">{formatInteger(rows.length)} לקוחות</h2><span className="text-[13px] text-ink-secondary">{people.length ? Math.round((rows.length / people.length) * 100) : 0}% מכלל הלקוחות</span></div>
            {visible.length === 0 ? <div className="border-t border-[#ebebeb] px-4 py-8 text-center text-ink-secondary">אף לקוח לא עונה על התנאים. נסו להרחיב אותם.</div> : visible.map((row) => (
              <button key={row.person.id} type="button" className="grid h-11 w-full grid-cols-[minmax(0,1fr)_110px_90px_100px] items-center gap-2 border-0 border-t border-[#ebebeb] bg-white px-4 text-start text-sm hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/customers/${row.person.id}`)}>
                <span className="font-semibold">{row.person.name}</span>
                <span className="text-ink-secondary">{row.person.city}</span>
                <span>{row.orders}</span>
                <span dir="ltr" className="text-left">{formatMoney(row.spent)}</span>
              </button>
            ))}
            {rows.length > PAGE_SIZE ? (
              <div className="border-t border-[#ebebeb] px-4 py-3">
                <IndexDock pageLabel={`${from}–${to} / ${formatInteger(rows.length)}`} onPrevious={safePage > 0 ? () => setPage(safePage - 1) : undefined} onNext={safePage + 1 < pageCount ? () => setPage(safePage + 1) : undefined} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
