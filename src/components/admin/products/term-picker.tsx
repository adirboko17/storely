"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

type TermPickerProps = {
  label?: string;
  addLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  createLabel: string;
  options: string[];
  selected: string[];
  onChange: (names: string[]) => void;
  onCreate: (name: string) => boolean;
  disabled?: boolean;
  disabledHint?: string;
  appearance?: "field" | "button";
  showSelected?: boolean;
};

export function TermPicker({ label, addLabel, searchPlaceholder, emptyLabel, createLabel, options, selected, onChange, onCreate, disabled, disabledHint, appearance = "field", showSelected = true }: TermPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryText = query.trim();
  const visible = options.filter((name) => !queryText || name.includes(queryText));
  const floating = appearance === "button";

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !floating) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 280;
      const margin = 8;
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
      const height = menuRef.current?.offsetHeight ?? 280;
      const below = window.innerHeight - rect.bottom;
      const top = below < height + 12 && rect.top > below ? Math.max(margin, rect.top - height - 6) : rect.bottom + 6;
      setMenuBox({ top, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, floating, query, visible.length]);

  function create() {
    if (!onCreate(queryText)) return;
    setQuery("");
  }

  const menu = (
    <div ref={menuRef} className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08),0_12px_28px_rgba(0,0,0,.18)]" style={floating ? { position: "fixed", top: menuBox?.top ?? -9999, left: menuBox?.left ?? 0, width: menuBox?.width ?? 280, zIndex: 80 } : undefined}>
      <div className="flex items-center gap-2 border-b border-[#ebebeb] px-3">
        <Icon name="search" size={16} strokeWidth={1.8} className="text-[#616161]" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }} placeholder={searchPlaceholder} className="h-10 w-full border-0 bg-transparent text-sm outline-none" style={{ backgroundColor: "transparent" }} />
      </div>
      <div className="max-h-52 overflow-auto p-1.5">
        {visible.map((name) => (
          <label key={name} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f1f1f1]">
            <input type="checkbox" checked={selected.includes(name)} onChange={() => onChange(selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name])} className="size-4 accent-[#303030]" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
          </label>
        ))}
        {visible.length === 0 ? <div className="px-2 py-2 text-sm text-[#616161]">{emptyLabel}</div> : null}
      </div>
      <button type="button" className="flex w-full items-center gap-2 border-t border-[#ebebeb] bg-transparent px-3 py-2.5 text-start text-sm hover:bg-[#f7f7f7]" onClick={create}>
        <Icon name="plus" size={16} strokeWidth={1.8} />
        {queryText ? `הוספת "${queryText}"` : createLabel}
      </button>
    </div>
  );

  const trigger = (
    <button ref={buttonRef} type="button" disabled={disabled} className="inline-flex h-7 items-center gap-1.5 rounded-lg border-0 bg-[#f3f3f3] px-2 text-[13px] font-medium disabled:cursor-default" onClick={() => setOpen((current) => !current)}>
      <span className="grid size-4 place-items-center rounded-full bg-white text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.08)]"><Icon name="plus" size={11} strokeWidth={2} /></span>
      {addLabel}
    </button>
  );

  return (
    <div className={floating ? "relative flex w-full flex-col items-start gap-1.5" : "relative"} ref={boxRef} onClick={(event) => event.stopPropagation()}>
      {label ? <span className="mb-1.5 block w-full font-semibold">{label}</span> : null}
      {floating ? (
        <>
          {showSelected && selected.length ? (
            <div className="flex max-w-full flex-wrap items-center gap-1">
              {selected.map((name) => (
                <span key={name} className="inline-flex h-6 items-center gap-1 rounded-md bg-[#ebebeb] px-2 text-[12px] font-normal">
                  {name}
                  <button type="button" aria-label={`הסרת ${name}`} className="border-0 bg-transparent text-ink-secondary" onClick={() => onChange(selected.filter((item) => item !== name))}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          {trigger}
        </>
      ) : (
        <div className="rounded-[10px] border border-[#c9c9c9] bg-white p-1.5" style={{ opacity: disabled ? 0.7 : 1 }}>
          {selected.length ? (
            <div className="mb-1 flex flex-col">
              {selected.map((name) => (
                <div key={name} className="flex h-8 items-center gap-2 px-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <button type="button" aria-label={`הסרת ${name}`} className="border-0 bg-transparent text-ink-secondary" onClick={() => onChange(selected.filter((item) => item !== name))}>×</button>
                </div>
              ))}
            </div>
          ) : null}
          {trigger}
        </div>
      )}
      {disabled && disabledHint ? <div className="mt-1.5 w-full text-[13px] text-ink-secondary">{disabledHint}</div> : null}
      {open && !disabled ? (floating ? createPortal(menu, document.body) : <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50">{menu}</div>) : null}
    </div>
  );
}
