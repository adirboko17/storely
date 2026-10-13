"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AssistantDock, darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { CUSTOMERS } from "@/data/mock/customers";
import { createGiftCard, getCatalogVersion, listGiftCards, subscribeCatalog } from "@/data/mock/catalog-session";
import { formatMoney } from "@/lib/formatting/money";

function freshCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 16; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (index % 4 === 3 && index < 15) code += " ";
  }
  return code;
}

export function GiftCardsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const cards = listGiftCards();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [value, setValue] = useState("100.00");
  const [customer, setCustomer] = useState("");

  function openNew() {
    setCode(freshCode());
    setValue("100.00");
    setCustomer("");
    setOpen(true);
  }

  function create() {
    const amount = Number.parseFloat(value);
    if (!(amount > 0)) {
      toast("יש להזין ערך גבוה מ-₪0");
      return;
    }
    createGiftCard({ code, value: amount, customer });
    setOpen(false);
    toast("כרטיס המתנה נוצר");
  }

  return (
    <div className="flex min-h-full flex-col px-3.5 pt-2.5">
      <div className="flex items-center gap-2 pb-2.5">
        <h1 className="m-0 flex-1 text-[15px] font-bold">כרטיסי מתנה</h1>
        <button type="button" disabled={cards.length === 0} className={softButton} style={{ background: cards.length ? "#fff" : "#f1f1f1", color: cards.length ? "#303030" : "#b5b5b5" }} onClick={() => toast("קובץ CSV יישלח אל maya@lavana.co.il")}>ייצוא</button>
      </div>
      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-[14px] bg-white px-6 py-[72px] text-center shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="mb-2 grid size-[150px] place-items-center rounded-full bg-[#f1f1f1]">
            <div className="relative h-[120px] w-[140px] rounded-xl bg-[#56b8ac]">
              <span className="absolute inset-x-0 top-[54px] h-3.5 bg-[#1b8a7c]" />
              <span className="absolute inset-y-0 left-16 w-3.5 bg-[#1b8a7c]" />
            </div>
          </div>
          <h2 className="m-0 text-base font-semibold">התחילו למכור כרטיסי מתנה</h2>
          <p className="m-0 max-w-[380px] text-pretty">הוסיפו מוצרי כרטיס מתנה למכירה, או צרו כרטיסי מתנה ושלחו אותם ישירות ללקוחות.</p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={openNew}>יצירת כרטיס מתנה</button>
            <button type="button" className={darkButton} onClick={() => router.push("/admin/products/new")}>הוספת מוצר כרטיס מתנה</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-end pb-2.5"><button type="button" className={darkButton} onClick={openNew}>יצירת כרטיס מתנה</button></div>
          <div className="overflow-x-auto rounded-[10px]">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="text-[13px] text-[#4a4a4a]">
                  {["קוד", "סטטוס", "לקוח", "נוצר", "יתרה", "ערך התחלתי"].map((label) => (
                    <th key={label} className="h-8 bg-[#f3f3f3] px-2.5 text-start font-semibold whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.code} className="h-10 border-b border-[#ebebeb] bg-white">
                    <td dir="ltr" className="px-2.5 text-right font-mono">{card.code}</td>
                    <td className="px-2.5"><span className="inline-flex h-5 items-center rounded-md bg-[#cdfee1] px-[7px] text-[13px] font-semibold text-[#0c5132]">פעיל</span></td>
                    <td className="px-2.5">{card.customer || "—"}</td>
                    <td className="px-2.5">היום</td>
                    <td dir="ltr" className="px-2.5 text-left">{formatMoney(card.value)}</td>
                    <td dir="ltr" className="px-2.5 text-left">{formatMoney(card.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="min-h-10 flex-1" />
      <AssistantDock />
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="יצירת כרטיס מתנה" className="w-full max-w-[440px] rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">יצירת כרטיס מתנה</h2>
            <label className="mt-3 block text-sm font-semibold">קוד<input dir="ltr" value={code} readOnly className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-[#f7f7f7] px-3 text-end" /></label>
            <label className="mt-3 block text-sm font-semibold">ערך<input dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-end" /></label>
            <label className="mt-3 block text-sm font-semibold">לקוח
              <select value={customer} onChange={(event) => setCustomer(event.target.value)} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3">
                <option value="">ללא</option>
                {CUSTOMERS.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={softButton} onClick={() => setOpen(false)}>ביטול</button>
              <button type="button" className={darkButton} onClick={create}>יצירה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
