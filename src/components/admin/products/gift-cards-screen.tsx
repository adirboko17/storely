"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { getCatalogVersion, listGiftCards, subscribeCatalog } from "@/data/mock/catalog-session";
import { formatMoney } from "@/lib/formatting/money";

export function GiftCardsScreen() {
  const router = useRouter();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const cards = listGiftCards();

  function openNew() {
    router.push("/admin/products/gift-cards/new");
  }

  return (
    <div className="flex min-h-full flex-col px-3.5 pt-2.5">
      <div className="flex items-center gap-2 pb-2.5">
        <h1 className="m-0 flex-1 text-[15px] font-bold">כרטיסי מתנה</h1>
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
            <button type="button" className={darkButton} onClick={() => router.push("/admin/products/gift-cards/product")}>הוספת מוצר כרטיס מתנה</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2 pb-2.5">
            <button type="button" className={softButton} onClick={() => router.push("/admin/products/gift-cards/product")}>הוספת מוצר כרטיס מתנה</button>
            <button type="button" className={darkButton} onClick={openNew}>יצירת כרטיס מתנה</button>
          </div>
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
                  <tr key={card.code} className="h-10 cursor-pointer border-b border-[#ebebeb] bg-white hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/products/gift-cards/${encodeURIComponent(card.code)}`)}>
                    <td dir="ltr" className="px-2.5 text-right font-mono">{card.code}</td>
                    <td className="px-2.5"><span className="inline-flex h-5 items-center rounded-md bg-[#cdfee1] px-[7px] text-[13px] font-semibold text-[#0c5132]">פעיל</span></td>
                    <td className="px-2.5">{card.customer || "—"}</td>
                    <td className="px-2.5">היום</td>
                    <td dir="ltr" className="px-2.5 text-left">{formatMoney(card.balance ?? card.value)}</td>
                    <td dir="ltr" className="px-2.5 text-left">{formatMoney(card.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="min-h-10 flex-1" />
    </div>
  );
}
