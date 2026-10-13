"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  deleteReturnRule,
  getSettings,
  getSettingsVersion,
  policyTemplate,
  policyText,
  savePolicy,
  saveReturnRule,
  subscribeSettings,
  type PolicyKind,
  type ReturnRule,
} from "@/data/mock/settings-session";

const POLICIES: Array<{ kind: PolicyKind; title: string; required?: boolean }> = [
  { kind: "return", title: "מדיניות החזרות והחזרים" },
  { kind: "privacy", title: "מדיניות פרטיות" },
  { kind: "terms", title: "תנאי שימוש" },
  { kind: "shipping", title: "מדיניות משלוחים" },
  { kind: "contact", title: "פרטי יצירת קשר" },
  { kind: "legal", title: "הודעה משפטית" },
  { kind: "purchase", title: "מדיניות ביטול אפשרויות רכישה", required: true },
];

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
  const [editing, setEditing] = useState<PolicyKind | null>(null);
  const [ruleOpen, setRuleOpen] = useState<ReturnRule | null>(null);
  const policy = POLICIES.find((item) => item.kind === editing);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <h1 className="m-0 text-xl font-bold text-ink-strong">פוליסות</h1>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold">כללי החזרה וביטול</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">תנאים ועמלות לבקשות החזרה וביטול.</p>
        </div>
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setRuleOpen(
                settings.rules[0] ?? { id: `rule-${Date.now()}`, name: "כללי ברירת מחדל", days: "", fee: "" },
              )
            }
            className="flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-[#fafafa]"
          >
            <span className="min-w-0 flex-1 text-sm font-semibold">כללי ברירת מחדל</span>
            <span className="text-[13px] text-ink-secondary">
              {settings.rules.length === 0 ? "לא הוגדרו כללים" : `${settings.rules.length} כללים`}
            </span>
            <Icon name="chevron" size={16} className="text-ink-secondary" />
          </button>
        </Card>
        <button
          type="button"
          onClick={() => setRuleOpen({ id: `rule-${Date.now()}`, name: "", days: "", fee: "" })}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold shadow-[var(--shadow-card)] hover:bg-[#fafafa]"
        >
          <Icon name="plus" size={16} />
          הוספת כלל
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold">פוליסות כתובות</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">כברירת מחדל הפוליסות מופיעות בתחתית החנות ובעמוד התשלום.</p>
        </div>
        <Card className="overflow-hidden">
          {POLICIES.map((item, index) => {
            const written = policyText(settings.policies[item.kind]).length > 0;
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => setEditing(item.kind)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-[#fafafa] ${index > 0 ? "border-t border-[#ebebeb]" : ""}`}
              >
                <Icon name="document" size={16} className="shrink-0 text-ink-secondary" />
                <span className="min-w-0 flex-1 text-sm">{item.title}</span>
                {written ? badge("פורסמה", "green") : item.required ? badge("נדרש", "amber") : <span className="text-[13px] text-ink-secondary">לא הוגדרה מדיניות</span>}
                <Icon name="chevron" size={16} className="shrink-0 text-ink-secondary" />
              </button>
            );
          })}
        </Card>
        <p className="m-0 text-[13px] text-ink-secondary">המלצות אינן ייעוץ משפטי. האחריות לדיוק הפוליסות ולעמידה בדין היא של החנות.</p>
      </section>

      {policy ? <PolicyEditor kind={policy.kind} title={policy.title} initial={settings.policies[policy.kind]} onClose={() => setEditing(null)} /> : null}
      {ruleOpen ? (
        <RuleEditor
          rule={ruleOpen}
          onClose={() => setRuleOpen(null)}
          canDelete={settings.rules.some((item) => item.id === ruleOpen.id)}
        />
      ) : null}
    </div>
  );
}

function PolicyEditor({
  kind,
  title,
  initial,
  onClose,
}: {
  kind: PolicyKind;
  title: string;
  initial: string;
  onClose: () => void;
}) {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editor.current) editor.current.innerHTML = initial;
  }, [initial]);

  function format(command: "bold" | "italic" | "underline") {
    editor.current?.focus();
    document.execCommand(command);
  }

  return (
    <SettingsDialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={softButton} onClick={onClose}>
            ביטול
          </button>
          <button
            type="button"
            className={darkButton}
            onClick={() => {
              savePolicy(kind, editor.current?.innerHTML ?? "");
              onClose();
            }}
          >
            שמירה
          </button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#f6f6f6] px-3 py-2.5">
        <p className="m-0 min-w-0 flex-1 text-[13px] text-ink-secondary">תבנית אינה ייעוץ משפטי. היא נפתחת עם שם החנות ופרטי הקשר שלה, ואפשר לערוך אותה.</p>
        <button
          type="button"
          className={softButton}
          onClick={() => {
            if (editor.current) editor.current.innerHTML = policyTemplate(kind);
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
          aria-label={title}
          className="max-h-[420px] min-h-[280px] overflow-y-auto px-4 py-3 text-sm leading-6 outline-none"
        />
      </div>
    </SettingsDialog>
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

function RuleEditor({ rule, onClose, canDelete }: { rule: ReturnRule; onClose: () => void; canDelete: boolean }) {
  const [name, setName] = useState(rule.name);
  const [days, setDays] = useState(rule.days);
  const [fee, setFee] = useState(rule.fee);

  return (
    <SettingsDialog
      title={rule.name.trim() || "כלל החזרה"}
      onClose={onClose}
      footer={
        <>
          {canDelete ? (
            <button
              type="button"
              className={`${softButton} me-auto text-[#8e1f0b]`}
              onClick={() => {
                deleteReturnRule(rule.id);
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
              saveReturnRule({ id: rule.id, name: name.trim() || "כלל החזרה", days, fee });
              onClose();
            }}
          >
            שמירה
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם הכלל
          <input value={name} onChange={(event) => setName(event.target.value)} className={field} />
          <span className="text-[13px] font-normal text-ink-secondary">הלקוחות לא רואים את השם.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          חלון החזרה בימים
          <input value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          עמלת החזרה
          <input value={fee} onChange={(event) => setFee(event.target.value)} className={field} placeholder="לדוגמה ₪15 או ריק" />
        </label>
      </div>
    </SettingsDialog>
  );
}
