"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { audienceLabel, campaignStatusLabel, duplicateCampaign, listCampaigns, saveCampaign, type MarketingCampaign } from "@/lib/marketing/campaigns";

export function CampaignsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[] | null>(null);

  useEffect(() => {
    let alive = true;
    listCampaigns().then((rows) => { if (alive) setCampaigns(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [toast]);

  async function create() {
    try {
      const campaign = await saveCampaign({ name: "קמפיין חדש", messageId: null, audience: "subscribed", lookbackDays: null });
      router.push(`/admin/marketing/campaigns/${campaign.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו ליצור קמפיין");
    }
  }

  async function copy(campaign: MarketingCampaign) {
    try {
      const next = await duplicateCampaign(campaign);
      toast("הקמפיין שוכפל כטיוטה");
      router.push(`/admin/marketing/campaigns/${next.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשכפל");
    }
  }

  const rows = campaigns ?? [];
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[15px] font-bold">קמפיינים</h1>
          <button type="button" className={darkButton} onClick={() => void create()}>קמפיין חדש</button>
        </div>
        <p className="m-0 text-sm text-[#4a4a4a]">קמפיין הוא שליחה אחת לקהל, בנפרד מאוטומציה. תזמון נשמר, אבל בלי ספק מחובר שום קמפיין לא נשלח.</p>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="grid h-[34px] grid-cols-[minmax(0,1fr)_180px_160px_120px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]">
            <span>שם</span><span>קהל</span><span>תזמון</span><span />
          </div>
          {campaigns === null ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">טוען קמפיינים…</div> : null}
          {campaigns && rows.length === 0 ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">עדיין אין קמפיינים.</div> : null}
          {rows.map((campaign) => (
            <div key={campaign.id} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_180px_160px_120px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-2.5 hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/marketing/campaigns/${campaign.id}`)}>
              <div>
                <b className="block">{campaign.name}</b>
                <span className="text-xs text-ink-secondary">{campaignStatusLabel(campaign.status)}</span>
              </div>
              <span className="text-sm">{audienceLabel(campaign.audience)}</span>
              <span className="text-sm">{campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString("he-IL") : "—"}</span>
              <button type="button" className="h-7 justify-self-start rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={(event) => { event.stopPropagation(); void copy(campaign); }}>שכפול</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
