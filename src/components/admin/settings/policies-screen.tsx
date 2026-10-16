"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  BUILTIN_POLICIES,
  blankPolicy,
  deletePolicy,
  getSettings,
  getSettingsVersion,
  policyPlacementLabel,
  policyTemplate,
  policyText,
  savePolicy,
  subscribeSettings,
  type PolicySurfaceMode,
  type StorePolicy,
} from "@/data/mock/settings-session";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm outline-none focus:border-[#1a1a1a]";

function badge(label: string, tone: "green" | "amber" | "plain") {
  const style =
    tone === "green"
      ? { background: "#cdfee1", color: "#0c5132" }
      : tone === "amber"
        ? { background: "#ffd6a4", color: "#5e4200" }
        : { background: "transparent", color: "#616161" };
  return (
    <span className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium" style={style}>
      {label}
    </span>
  );
}

export function PoliciesScreen() {
  useSyncExternalStore(subscribeSettings, getSettingsVersion, getSettingsVersion);
  const settings = getSettings();
  const [editing, setEditing] = useState<StorePolicy | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <h1 className="m-0 text-xl font-bold text-ink-strong">פוליסות</h1>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold">פוליסות ותקנונים</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">
            לכל מסמך בוחרים איפה הוא מופיע באתר: פוטר, עגלת קניות או דף תשלום. בעגלה ובדף התשלום אפשר קישור, או תיבת סימון שהלקוח קרא.
          </p>
        </div>
        <Card className="overflow-hidden">
          {settings.policies.map((item, index) => {
            const written = policyText(item.body).length > 0;
            const required = BUILTIN_POLICIES.find((policy) => policy.kind === item.kind)?.required;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setEditing(item)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-[#fafafa] ${index > 0 ? "border-t border-[#ebebeb]" : ""}`}
              >
                <Icon name="document" size={16} className="shrink-0 text-ink-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{item.title}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-secondary">{policyPlacementLabel(item)}</span>
                </span>
                {written ? badge("פורסמה", "green") : required ? badge("נדרש", "amber") : <span className="text-[13px] text-ink-secondary">לא הוגדרה מדיניות</span>}
                <Icon name="chevron" size={16} className="shrink-0 text-ink-secondary" />
              </button>
            );
          })}
        </Card>
        <button
          type="button"
          onClick={() => setEditing(blankPolicy())}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold shadow-[var(--shadow-card)] hover:bg-[#fafafa]"
        >
          <Icon name="plus" size={16} />
          הוספת פוליסיה או תקנון
        </button>
        <p className="m-0 text-[13px] text-ink-secondary">המלצות אינן ייעוץ משפטי. האחריות לדיוק הפוליסות ולעמידה בדין היא של החנות.</p>
      </section>

      {editing ? <PolicyEditor key={editing.id} policy={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PolicyEditor({ policy, onClose }: { policy: StorePolicy; onClose: () => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(policy.title);
  const [footer, setFooter] = useState(policy.footer);
  const [cart, setCart] = useState<PolicySurfaceMode>(policy.cart);
  const [checkout, setCheckout] = useState<PolicySurfaceMode>(policy.checkout);
  const saved = getSettings().policies.some((item) => item.id === policy.id);

  useEffect(() => {
    if (editor.current) editor.current.innerHTML = policy.body;
  }, [policy.body]);

  function format(command: "bold" | "italic" | "underline") {
    editor.current?.focus();
    document.execCommand(command);
  }

  return (
    <SettingsDialog
      title={title.trim() || "פוליסיה או תקנון"}
      onClose={onClose}
      scroll
      footer={
        <>
          {saved && policy.kind === "custom" ? (
            <button
              type="button"
              className={`${softButton} me-auto text-[#8e1f0b]`}
              onClick={() => {
                deletePolicy(policy.id);
                onClose();
              }}
            >
              מחיקה
            </button>
          ) : null}
          <button type="button" className={softButton} onClick={onClose}>
            ביטול
          </button>
          <button
            type="button"
            className={darkButton}
            onClick={() => {
              savePolicy({
                ...policy,
                title,
                body: editor.current?.innerHTML ?? "",
                footer,
                cart,
                checkout,
              });
              onClose();
            }}
          >
            שמירה
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={field} placeholder="לדוגמה תקנון האתר" />
        </label>

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="m-0 text-sm font-semibold">איפה להציג</h3>
            <p className="m-0 mt-0.5 text-[13px] font-normal text-ink-secondary">האתר מציג את המסמך במקומות שסימנתם, בטעינה הבאה.</p>
          </div>
          <SurfaceRow
            label="פוטר"
            detail="קישור בתחתית האתר"
            enabled={footer}
            onEnabled={setFooter}
          />
          <SurfaceRow
            label="עגלת קניות"
            detail="קישור ליד סיכום העגלה, או תיבת סימון שחובה לסמן לפני המשך"
            enabled={cart !== "hidden"}
            mode={cart === "hidden" ? "link" : cart}
            onEnabled={(on) => setCart(on ? (cart === "hidden" ? "link" : cart) : "hidden")}
            onMode={setCart}
          />
          <SurfaceRow
            label="דף תשלום"
            detail="קישור בקופה, או תיבת סימון שחובה לסמן לפני התשלום"
            enabled={checkout !== "hidden"}
            mode={checkout === "hidden" ? "link" : checkout}
            onEnabled={(on) => setCheckout(on ? (checkout === "hidden" ? "link" : checkout) : "hidden")}
            onMode={setCheckout}
          />
          <PlacementPreview title={title.trim() || "המסמך"} footer={footer} cart={cart} checkout={checkout} />
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-[#f6f6f6] px-3 py-2.5">
          <p className="m-0 min-w-0 flex-1 text-[13px] text-ink-secondary">תבנית אינה ייעוץ משפטי. היא נפתחת עם שם החנות ופרטי הקשר שלה, ואפשר לערוך אותה.</p>
          <button
            type="button"
            className={softButton}
            onClick={() => {
              if (editor.current) editor.current.innerHTML = policyTemplate(policy.kind);
            }}
          >
            הכנסת תבנית
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#e3e3e3]">
          <div className="flex items-center gap-1 border-b border-[#ebebeb] px-2 py-1.5">
            <span className="px-2 text-[13px] text-ink-secondary">פסקה</span>
            <FormatButton label="מודגש" onClick={() => format("bold")}>
              B
            </FormatButton>
            <FormatButton label="נטוי" onClick={() => format("italic")}>
              <span className="italic">I</span>
            </FormatButton>
            <FormatButton label="קו תחתון" onClick={() => format("underline")}>
              <span className="underline">U</span>
            </FormatButton>
          </div>
          <div
            ref={editor}
            contentEditable
            role="textbox"
            aria-label={title || "תוכן הפוליסיה"}
            className="min-h-[140px] px-4 py-3 text-sm leading-6 outline-none"
          />
        </div>
      </div>
    </SettingsDialog>
  );
}

function PlacementPreview({
  title,
  footer,
  cart,
  checkout,
}: {
  title: string;
  footer: boolean;
  cart: PolicySurfaceMode;
  checkout: PolicySurfaceMode;
}) {
  if (!footer && cart === "hidden" && checkout === "hidden") {
    return <p className="m-0 text-[13px] text-ink-secondary">המסמך לא יופיע באתר עד שתבחרו מקום.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[#fafafa] px-3 py-3">
      <p className="m-0 text-[12px] font-semibold text-ink-secondary">תצוגה מקדימה</p>
      {footer ? (
        <div>
          <p className="m-0 mb-1 text-[12px] text-ink-secondary">פוטר</p>
          <span className="text-sm underline underline-offset-2">{title}</span>
        </div>
      ) : null}
      {cart !== "hidden" ? <PreviewSurface label="עגלת קניות" title={title} mode={cart} /> : null}
      {checkout !== "hidden" ? <PreviewSurface label="דף תשלום" title={title} mode={checkout} /> : null}
    </div>
  );
}

function PreviewSurface({ label, title, mode }: { label: string; title: string; mode: "link" | "checkbox" }) {
  return (
    <div>
      <p className="m-0 mb-1 text-[12px] text-ink-secondary">{label}</p>
      {mode === "checkbox" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" readOnly className="mt-0.5 size-4 accent-[#303030]" />
          <span>
            קראתי ואני מסכים ל<span className="underline underline-offset-2">{title}</span>
          </span>
        </label>
      ) : (
        <span className="text-sm underline underline-offset-2">{title}</span>
      )}
    </div>
  );
}

function SurfaceRow({
  label,
  detail,
  enabled,
  mode,
  onEnabled,
  onMode,
}: {
  label: string;
  detail: string;
  enabled: boolean;
  mode?: "link" | "checkbox";
  onEnabled: (enabled: boolean) => void;
  onMode?: (mode: "link" | "checkbox") => void;
}) {
  return (
    <div className="rounded-xl border border-[#e3e3e3] px-3 py-2.5">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} className="mt-0.5 size-4 accent-[#303030]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-[13px] font-normal text-ink-secondary">{detail}</span>
        </span>
      </label>
      {onMode && enabled ? (
        <div className="mt-2 flex gap-1 rounded-lg bg-[#f1f1f1] p-0.5">
          <ModeButton active={mode === "link"} onClick={() => onMode("link")}>
            קישור
          </ModeButton>
          <ModeButton active={mode === "checkbox"} onClick={() => onMode("checkbox")}>
            קראתי ואני מסכים
          </ModeButton>
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 flex-1 rounded-md text-[13px] font-semibold ${active ? "bg-white text-ink shadow-[0_0_0_1px_rgba(0,0,0,.06)]" : "text-ink-secondary"}`}
    >
      {children}
    </button>
  );
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-sm font-semibold hover:bg-[#f1f1f1]"
    >
      {children}
    </button>
  );
}
