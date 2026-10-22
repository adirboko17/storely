"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { PopupCanvas } from "@/components/admin/marketing/popup-canvas";
import { PopupRules } from "@/components/admin/marketing/popup-rules";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { brandPalette, getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import {
  addArea,
  arrangeAreas,
  blankBlock,
  blankField,
  FIELD_PRESET_LABELS,
  fieldPreset,
  getPopup,
  popupAreaClass,
  popupBlockLabel,
  popupFieldClass,
  columnGrid,
  moveColumn,
  placeLeaf,
  popupLook,
  setColumnWidth,
  removePopupBlock,
  replacePopupBlock,
  savePopup,
  statusLabel,
  uploadPopupImage,
  type FieldPreset,
  type PopupBlock,
  type PopupDesign,
  type PopupClosePlace,
  type PopupLayout,
  type PopupMobile,
  type PopupStatus,
  type StorePopup,
} from "@/lib/marketing/popups";
import { getPopupSwatches, loadPopupSwatches, rememberPopupSwatch, subscribePopupSwatches } from "@/lib/marketing/popup-swatches";

const choice = "h-9 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-sm font-semibold data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white";

export function PopupEditorScreen({ popupId }: { popupId: string }) {
  const { toast } = useAdmin();
  const [popup, setPopup] = useState<StorePopup | null>(null);
  const [saved, setSaved] = useState<StorePopup | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"design" | "rules">("design");
  const [selected, setSelected] = useState("");
  const [overIndex, setOverIndex] = useState(-1);
  const [overColumn, setOverColumn] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [blocksOpen, setBlocksOpen] = useState(true);
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const logo = getSettings().logo;

  useEffect(() => {
    let alive = true;
    getPopup(popupId).then((row) => {
      if (!alive) return;
      setPopup(row);
      setSaved(row);
      setMissing(!row);
      setSelected(row?.design.blocks[0]?.id ?? "");
    }).catch((error: Error) => toast(error.message));
    void loadPopupSwatches();
    return () => { alive = false; };
  }, [popupId, toast]);

  const dirty = JSON.stringify(popup) !== JSON.stringify(saved);

  async function persist() {
    if (!popup) return;
    setSaving(true);
    try {
      const next = await savePopup(stampLogo(popup, getSettings().logo));
      setPopup(next);
      setSaved(next);
      toast(next.status === "active" ? "הפופאפ פעיל באתר" : "הפופאפ נשמר");
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  useUnsavedEditor(dirty, saving, () => void persist(), () => setPopup(saved));

  if (missing) return <p className="px-5 py-6 text-sm">הפופאפ לא נמצא בחנות הזו.</p>;
  if (!popup) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">טוען פופאפ…</p>;
  const draft = popup;

  function patch(next: Partial<StorePopup>) {
    setPopup((current) => current ? { ...current, ...next } : current);
  }

  function patchDesign(next: Partial<PopupDesign>) {
    setPopup((current) => current ? { ...current, design: { ...current.design, ...next } } : current);
  }

  function patchMobile(next: Partial<PopupMobile>) {
    setPopup((current) => current ? { ...current, design: { ...current.design, mobile: { ...current.design.mobile, ...next } } } : current);
  }

  function patchBlock(next: PopupBlock) {
    setPopup((current) => current ? { ...current, design: { ...current.design, blocks: replacePopupBlock(current.design.blocks, next) } } : current);
  }

  function addBlock(type: PopupBlock["type"]) {
    const next = blankBlock(type, draft.design.blocks);
    if (next.type === "row") {
      patchDesign({ blocks: [...draft.design.blocks, next] });
      setSelected(next.columns[0]?.id ?? next.id);
      return;
    }
    patchDesign({ blocks: placeLeaf(draft.design.blocks, selected, next) });
    setSelected(next.id);
  }

  function addField(preset: FieldPreset) {
    const next = blankField(preset, draft.design.blocks);
    patchDesign({ blocks: placeLeaf(draft.design.blocks, selected, next) });
    setSelected(next.id);
  }

  function addColumn() {
    const next = addArea(draft.design.blocks, selected);
    patchDesign({ blocks: next.blocks, media: draft.design.media === "none" ? "right" : draft.design.media });
    setSelected(next.columnId);
  }

  function arrange(side: "right" | "left" | "single") {
    setPopup((current) => {
      if (!current) return current;
      const row = current.design.blocks.length === 1 && current.design.blocks[0]?.type === "row" ? current.design.blocks[0] : null;
      if (side !== "single" && row && current.design.media === side) return current;
      if (side !== "single" && row && current.design.media !== "none") {
        return { ...current, design: { ...current.design, media: side, blocks: [{ ...row, columns: [...row.columns].reverse() }] } };
      }
      return { ...current, design: { ...current.design, media: side === "single" ? "none" : side, blocks: arrangeAreas(current.design.blocks, side) } };
    });
  }

  function moveBlockTo(id: string, index: number) {
    if (id.startsWith("column:")) return;
    setPopup((current) => {
      if (!current) return current;
      const from = current.design.blocks.findIndex((item) => item.id === id);
      if (from < 0) return current;
      const blocks = [...current.design.blocks];
      const [item] = blocks.splice(from, 1);
      const dest = Math.max(0, Math.min(index, blocks.length));
      if (!item || dest === from) return current;
      blocks.splice(dest, 0, item);
      return { ...current, design: { ...current.design, blocks } };
    });
    setOverIndex(-1);
  }

  function dropOn(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id.startsWith("column:")) {
      moveColumnTo(id.slice("column:".length), index);
      return;
    }
    if (id) moveBlockTo(id, index);
  }

  function moveColumnTo(id: string, index: number) {
    setPopup((current) => {
      if (!current) return current;
      const blocks = moveColumn(current.design.blocks, id, index);
      return blocks === current.design.blocks ? current : { ...current, design: { ...current.design, blocks } };
    });
    setOverColumn("");
  }

  function resizeColumn(id: string, width: number) {
    setPopup((current) => current ? { ...current, design: { ...current.design, blocks: setColumnWidth(current.design.blocks, id, width) } } : current);
  }

  function removeBlock(id: string) {
    patchDesign({ blocks: removePopupBlock(draft.design.blocks, id) });
    setSelected("");
  }

  async function saveAs(status: PopupStatus) {
    setSaving(true);
    try {
      const next = await savePopup(stampLogo({ ...draft, status }, getSettings().logo));
      setPopup(next);
      setSaved(next);
      toast(status === "active" ? "הפופאפ פעיל באתר" : "הפופאפ הושהה");
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href="/admin/marketing/popups" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">פופאפים /</span>
        <label className="flex min-w-0 items-center gap-1">
          <input aria-label="שם הפופאפ" value={draft.name} onChange={(event) => patch({ name: event.target.value.slice(0, 80) })} className="h-8 max-w-[280px] border-0 bg-transparent px-0.5 text-[15px] font-bold outline-none" />
          <Icon name="pencil" size={14} strokeWidth={1.7} className="shrink-0 text-[#8a8a8a]" />
        </label>
        <span className="rounded-full bg-[#f1f1f1] px-2 py-0.5 text-xs font-semibold text-[#4a4a4a]">{statusLabel(draft.status)}</span>
        <div className="ms-auto flex items-center gap-2">
          <div className="flex rounded-full bg-[#f1f1f1] p-0.5">
            <button type="button" onClick={() => setTab("design")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${tab === "design" ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>עיצוב</button>
            <button type="button" onClick={() => setTab("rules")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${tab === "rules" ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>מתי ואיפה</button>
          </div>
          {draft.status === "active" ? (
            <button type="button" className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold" onClick={() => void saveAs("paused")}>השהיה</button>
          ) : (
            <button type="button" className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white" onClick={() => void saveAs("active")}>פרסום</button>
          )}
        </div>
      </div>
      <div className="grid items-start gap-4 bg-[#f3f3f3] px-4 py-5 min-[960px]:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
        <div className="flex max-h-[calc(100dvh-96px)] min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pe-1">
          {tab === "design" ? (
            <>
              <section className="shrink-0 overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                <button type="button" aria-expanded={blocksOpen} onClick={() => setBlocksOpen((open) => !open)} className="flex w-full shrink-0 items-center gap-2 border-0 bg-transparent px-3 py-3 text-start">
                  <b className="text-sm">מה מופיע בחלון</b>
                  <span className="text-xs text-[#8a8a8a]">{draft.design.blocks.length}</span>
                  <span className="ms-auto text-xs text-[#8a8a8a] transition-transform duration-300" style={{ transform: blocksOpen ? "rotate(180deg)" : "none" }}>▾</span>
                </button>
                {blocksOpen ? <div className="flex max-h-[32vh] flex-col gap-2 overflow-y-auto px-3 pb-3">
                {draft.design.blocks.length === 0 ? <p className="m-0 px-1 text-sm text-[#616161]">עדיין ריק. הוסיפו כותרת, טקסט או שדה למטה.</p> : null}
                {draft.design.blocks.map((item, index) => (
                  <div
                    key={item.id}
                    onDragOver={(event) => { event.preventDefault(); setOverIndex(index); }}
                    onDrop={(event) => dropOn(event, index)}
                    className={`rounded-xl ${selected === item.id ? "bg-[#f7f7f7]" : ""} ${overIndex === index ? "shadow-[inset_0_2px_0_#1a1a1a]" : ""}`}
                  >
                    <div className="flex items-center gap-1 px-1">
                      <button
                        type="button"
                        draggable
                        aria-label="גרירה לשינוי סדר"
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", item.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setOverIndex(-1)}
                        className="grid size-7 cursor-grab place-items-center rounded-lg border-0 bg-transparent text-sm text-[#8a8a8a] active:cursor-grabbing"
                      >
                        ⋮⋮
                      </button>
                      <button type="button" aria-expanded={selected === item.id} onClick={() => setSelected((current) => current === item.id ? "" : item.id)} className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent py-2 text-start">
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm">{blockTitle(item)}</b>
                          <span className="block w-full truncate text-xs text-[#616161]">{blockHint(item)}{item.span === "half" ? " · חצי שורה" : ""}</span>
                        </span>
                        <span className="text-xs text-[#8a8a8a] transition-transform duration-300" style={{ transform: selected === item.id ? "rotate(180deg)" : "none" }}>▾</span>
                      </button>
                      <button type="button" aria-label="מחיקה" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-sm" onClick={() => removeBlock(item.id)}>×</button>
                    </div>
                    {item.type === "row" ? (
                      <div className="px-2 pb-3">
                      <div className="grid gap-2" style={{ gridTemplateColumns: columnGrid(item.columns, false) }}>
                        {item.columns.map((column, columnIndex) => (
                          <div
                            key={column.id}
                            onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOverColumn(column.id); }}
                            onDrop={(event) => { event.stopPropagation(); dropOn(event, columnIndex); }}
                            className={`rounded-xl p-2 ${selected === column.id ? "bg-white shadow-[inset_0_0_0_2px_#1a1a1a]" : "bg-[#f6f6f6]"} ${overColumn === column.id ? "shadow-[inset_0_2px_0_#1a1a1a]" : ""}`}
                          >
                            <div className="mb-1 flex items-center gap-1">
                              <button
                                type="button"
                                draggable
                                aria-label="גרירה להחלפת אזור"
                                onDragStart={(event) => {
                                  event.stopPropagation();
                                  event.dataTransfer.setData("text/plain", `column:${column.id}`);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setOverColumn("")}
                                className="grid size-6 cursor-grab place-items-center rounded-md border-0 bg-transparent text-xs text-[#8a8a8a] active:cursor-grabbing"
                              >
                                ⋮⋮
                              </button>
                              <button type="button" onClick={() => setSelected(column.id)} className="min-w-0 flex-1 border-0 bg-transparent text-start text-xs font-semibold">אזור {columnIndex + 1}</button>
                              <span className="text-[11px] text-[#8a8a8a]">{column.width}%</span>
                              <button type="button" aria-label="מחיקת אזור" onClick={() => removeBlock(column.id)} className="border-0 bg-transparent text-sm text-[#8a8a8a]">×</button>
                            </div>
                            {column.blocks.map((child) => (
                              <div key={child.id} className="mb-1">
                                <button type="button" onClick={() => setSelected(selected === child.id ? column.id : child.id)} className="block w-full rounded-lg border-0 bg-white px-2 py-1.5 text-start text-xs">
                                  <b>{blockTitle(child)}</b>
                                </button>
                                {selected === child.id ? (
                                  <div className="px-1 pt-2">
                                    <BlockFields block={child} blocks={draft.design.blocks} onChange={patchBlock} onUpload={async (file) => {
                                      try {
                                        const src = await uploadPopupImage(file);
                                        if (child.type === "image") patchBlock({ ...child, src });
                                      } catch (error) {
                                        toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
                                      }
                                    }} />
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {item.columns.some((column) => column.id === selected || column.blocks.some((child) => child.id === selected)) ? (
                        <label className="mt-2 block text-xs font-semibold text-[#616161]">
                          <span className="mb-1 flex items-center justify-between">
                            <span>רוחב האזור</span>
                            <span>{item.columns.find((column) => column.id === selected || column.blocks.some((child) => child.id === selected))?.width}%</span>
                          </span>
                          <input
                            type="range"
                            min={15}
                            max={100 - 15 * (item.columns.length - 1)}
                            value={item.columns.find((column) => column.id === selected || column.blocks.some((child) => child.id === selected))?.width ?? 50}
                            onChange={(event) => {
                              const column = item.columns.find((entry) => entry.id === selected || entry.blocks.some((child) => child.id === selected));
                              if (column) resizeColumn(column.id, Number(event.target.value));
                            }}
                            className="w-full"
                          />
                        </label>
                      ) : null}
                      </div>
                    ) : null}
                    {item.type === "row" ? null : <div data-open={selected === item.id} className="block-fold">
                      <div>
                        <div className="px-2 pb-3">
                          <BlockFields
                            block={item}
                            blocks={draft.design.blocks}
                            onChange={patchBlock}
                            onUpload={async (file) => {
                              try {
                                const src = await uploadPopupImage(file);
                                if (item.type === "image") patchBlock({ ...item, src });
                              } catch (error) {
                                toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>}
                  </div>
                ))}
                <div className={`h-2 rounded-full ${overIndex === draft.design.blocks.length ? "bg-[#1a1a1a]" : ""}`} onDragOver={(event) => { event.preventDefault(); setOverIndex(draft.design.blocks.length); }} onDrop={(event) => dropOn(event, draft.design.blocks.length)} />
                <style>{`.block-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .34s cubic-bezier(.2,.75,.2,1)}.block-fold[data-open="true"]{grid-template-rows:1fr}.block-fold>div{min-height:0;overflow:hidden}`}</style>
                </div> : null}
              </section>
              <div className="shrink-0"><AddDrawer onAdd={addBlock} onField={addField} onColumn={addColumn} /></div>
              <CanvasFields design={draft.design} device={device} onChange={patchDesign} onMobile={patchMobile} onArrange={arrange} onUpload={async (file) => {
                try {
                  patchDesign({ backgroundImage: await uploadPopupImage(file) });
                } catch (error) {
                  toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
                }
              }} onMedia={async (file) => {
                try {
                  patchDesign({ mediaImage: await uploadPopupImage(file), media: draft.design.media === "none" ? "right" : draft.design.media });
                } catch (error) {
                  toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
                }
              }} />
            </>
          ) : (
            <PopupRules popup={draft} onChange={(targeting) => patch({ targeting })} onWindow={(startsAt, endsAt) => patch({ startsAt, endsAt })} />
          )}
        </div>
        <div className="sticky top-4 min-w-0">
          <div className="mb-3 flex items-center justify-center">
            <div className="flex rounded-full bg-white p-1 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
              <button type="button" data-on={device === "desktop"} onClick={() => setDevice("desktop")} className="h-8 rounded-full border-0 px-4 text-sm font-semibold text-[#616161] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">מחשב</button>
              <button type="button" data-on={device === "mobile"} onClick={() => setDevice("mobile")} className="h-8 rounded-full border-0 px-4 text-sm font-semibold text-[#616161] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">אייפון</button>
            </div>
          </div>
          <PopupCanvas design={draft.design} device={device} logoUrl={logo} selectedId={selected} onSelect={(id) => setSelected((current) => current === id ? "" : id)} onMove={moveBlockTo} onMoveColumn={moveColumnTo} onResizeColumn={resizeColumn} />
        </div>
      </div>
    </div>
  );
}

function stampLogo(popup: StorePopup, logo: string): StorePopup {
  const src = /^https:\/\//i.test(logo) ? logo : "";
  return {
    ...popup,
    design: {
      ...popup.design,
      blocks: popup.design.blocks.map((block) => {
        if (block.type === "logo") return { ...block, src };
        if (block.type !== "row") return block;
        return { ...block, columns: block.columns.map((column) => ({ ...column, blocks: column.blocks.map((item) => item.type === "logo" ? { ...item, src } : item) })) };
      }),
    },
  };
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex items-center gap-1.5 text-xs font-semibold text-[#616161]">
        <span className="size-5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,.16)]" style={{ background: value }} />
        {label}
      </button>
      {open ? (
        <div className="absolute end-0 z-20 mt-2 w-60 rounded-2xl bg-white p-3 shadow-[0_16px_40px_rgba(0,0,0,.16)]">
          <ColorChoices value={value} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1.5">
        <ColorChoices value={value} onChange={onChange} />
      </div>
    </div>
  );
}

const ADD_ITEMS = [
  ["heading", "כותרת"],
  ["text", "טקסט"],
  ["logo", "לוגו"],
  ["image", "תמונה"],
  ["button", "כפתור"],
  ["spacer", "רווח"],
] as const;

const CLOSE_PLACES: Array<[PopupClosePlace, string]> = [
  ["top-right", "ימין למעלה"],
  ["top-left", "שמאל למעלה"],
  ["bottom-right", "ימין למטה"],
  ["bottom-left", "שמאל למטה"],
];

function AddDrawer({ onAdd, onField, onColumn }: { onAdd: (type: PopupBlock["type"]) => void; onField: (preset: FieldPreset) => void; onColumn: () => void }) {
  const [open, setOpen] = useState(false);
  const fields = Object.keys(FIELD_PRESET_LABELS) as FieldPreset[];
  return (
    <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-start">
        <span className="grid size-7 place-items-center rounded-full bg-[#1a1a1a] text-base leading-none text-white">+</span>
        <span className="text-sm font-semibold">הוספה</span>
        <span className="ms-auto text-xs text-[#8a8a8a] transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      <div data-open={open} className="popup-add">
        <div>
          <div className="grid grid-cols-2 gap-2 px-3 pb-2">
            {ADD_ITEMS.map(([type, label], index) => (
              <button key={type} type="button" onClick={() => { onAdd(type); setOpen(false); }} className="popup-add-item h-11 rounded-xl border-0 bg-[#f6f6f6] text-sm font-semibold hover:bg-[#ececec]" style={{ transitionDelay: open ? `${index * 35}ms` : "0ms" }}>{label}</button>
            ))}
            <button type="button" onClick={() => { onAdd("row"); setOpen(false); }} className="popup-add-item h-11 rounded-xl border-0 bg-[#f6f6f6] text-sm font-semibold hover:bg-[#ececec]" style={{ transitionDelay: open ? "210ms" : "0ms" }}>שורה</button>
            <button type="button" onClick={() => { onColumn(); setOpen(false); }} className="popup-add-item h-11 rounded-xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white hover:bg-[#303030]" style={{ transitionDelay: open ? "250ms" : "0ms" }}>עמודה בשורה</button>
          </div>
          <div className="popup-add-item px-3 pb-1.5 text-xs font-semibold text-[#8a8a8a]" style={{ transitionDelay: open ? "180ms" : "0ms" }}>איזה שדה</div>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {fields.map((preset, index) => (
              <button key={preset} type="button" onClick={() => { onField(preset); setOpen(false); }} className="popup-add-item h-11 rounded-xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white hover:bg-[#303030]" style={{ transitionDelay: open ? `${220 + index * 35}ms` : "0ms" }}>{FIELD_PRESET_LABELS[preset]}</button>
            ))}
          </div>
        </div>
      </div>
      <style>{`.popup-add{display:grid;grid-template-rows:0fr;transition:grid-template-rows .36s cubic-bezier(.2,.75,.2,1)}.popup-add[data-open="true"]{grid-template-rows:minmax(0,240px)}.popup-add>div{min-height:0;overflow:hidden}.popup-add[data-open="true"]>div{overflow-y:auto}.popup-add-item{opacity:0;transform:translateY(8px) scale(.98);transition:opacity .28s ease,transform .32s cubic-bezier(.2,.8,.2,1),background .15s}.popup-add[data-open="true"] .popup-add-item{opacity:1;transform:none}`}</style>
    </div>
  );
}

function ColorChoices({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const saved = useSyncExternalStore(subscribePopupSwatches, getPopupSwatches, () => [] as string[]);
  const brand = brandPalette().filter((color) => !saved.includes(color));
  const picker = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1a1a1a";
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {saved.length ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-[#8a8a8a]">שמורים</div>
          <div className="flex flex-wrap gap-1.5">
            <DotRow colors={saved} current={picker} onChange={onChange} />
          </div>
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-[11px] font-semibold text-[#8a8a8a]">המותג</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DotRow colors={brand} current={picker} onChange={onChange} />
          <label className="relative grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full text-[11px] font-bold" style={{ background: picker, color: picker.toLowerCase() === "#ffffff" ? "#1a1a1a" : "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.16)" }}>
            +
            <input aria-label="בחירת צבע" type="color" value={picker} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <button type="button" onClick={() => { void rememberPopupSwatch(picker); setNote("נשמר"); window.setTimeout(() => setNote(""), 1200); }} className="h-6 rounded-full border-0 bg-[#f3f3f3] px-2 text-[11px] font-semibold">{note || "שמירת צבע"}</button>
        </div>
      </div>
    </div>
  );
}

function DotRow({ colors, current, onChange }: { colors: string[]; current: string; onChange: (value: string) => void }) {
  return (
    <>
      {colors.map((color) => (
        <button key={color} type="button" aria-label={color} onClick={() => onChange(color)} className="size-6 rounded-full border-0 p-0" style={{ background: color, boxShadow: current.toLowerCase() === color ? "0 0 0 2px #fff, 0 0 0 4px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.16)" }} />
      ))}
    </>
  );
}

function layoutName(layout: PopupLayout) {
  return layout === "bar" ? "למטה" : layout === "corner" ? "פינה" : "מרכז";
}

function LayoutBoard({
  phone,
  design,
  lookLayout,
  onChange,
  onMobile,
  onArrange,
  onPickMedia,
}: {
  phone: boolean;
  design: PopupDesign;
  lookLayout: PopupLayout;
  onChange: (next: Partial<PopupDesign>) => void;
  onMobile: (next: Partial<PopupMobile>) => void;
  onArrange: (side: "right" | "left" | "single") => void;
  onPickMedia: () => void;
}) {
  const [open, setOpen] = useState(false);
  const place = phone && design.mobile.layout === "same" ? "כמו במחשב" : layoutName(lookLayout);
  const columns = phone
    ? design.mobile.media === "hide" ? "בלי תמונה" : design.mobile.media === "stack" ? "תמונה מעל" : design.mobile.columns === "same" ? "שתי עמודות" : "עמודה"
    : design.media === "right" ? "אזור מימין" : design.media === "left" ? "אזור משמאל" : "עמודה";
  const placeOn = (layout: PopupLayout | "same") => phone ? design.mobile.layout === layout : design.layout === layout;
  const places: Array<{ layout: PopupLayout | "same"; label: string; sketch: string }> = phone
    ? [
        { layout: "same", label: "כמו במחשב", sketch: "same" },
        { layout: "modal", label: "מרכז", sketch: "center" },
        { layout: "bar", label: "למטה", sketch: "bottom" },
        { layout: "corner", label: "פינה", sketch: "corner" },
      ]
    : [
        { layout: "modal", label: "מרכז", sketch: "center" },
        { layout: "bar", label: "למטה", sketch: "bottom" },
        { layout: "corner", label: "פינה", sketch: "corner" },
      ];
  const columnsTiles: Array<{ key: string; label: string; sketch: string; on: boolean; pick: () => void }> = phone
    ? [
        { key: "column", label: "עמודה", sketch: "one", on: design.mobile.media !== "hide" && design.mobile.media !== "stack" && design.mobile.columns === "stack", pick: () => onMobile({ media: "same", columns: "stack" }) },
        { key: "split", label: "שתי עמודות", sketch: "fields", on: design.mobile.columns === "same" && design.mobile.media !== "hide", pick: () => onMobile({ columns: "same", media: design.mobile.media === "hide" ? "same" : design.mobile.media }) },
        { key: "above", label: "תמונה מעל", sketch: "above", on: design.mobile.media === "stack", pick: () => onMobile({ media: "stack" }) },
        { key: "hide", label: "בלי תמונה", sketch: "one", on: design.mobile.media === "hide", pick: () => onMobile({ media: "hide" }) },
      ]
    : [
        { key: "one", label: "עמודה", sketch: "one", on: design.media === "none", pick: () => onArrange("single") },
        { key: "right", label: "אזור מימין", sketch: "right", on: design.media === "right", pick: () => onArrange("right") },
        { key: "left", label: "אזור משמאל", sketch: "left", on: design.media === "left", pick: () => onArrange("left") },
      ];
  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-[#fafafa]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 border-0 bg-transparent px-2.5 py-2 text-start">
        <span className="text-sm font-semibold">{phone ? "פריסת אייפון" : "פריסת מחשב"}</span>
        <span className="text-xs text-[#8a8a8a]">{place} · {columns}</span>
        <span className="ms-auto text-xs text-[#8a8a8a] transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      <div data-open={open} className="layout-fold">
        <div>
          <div className="grid grid-cols-3 gap-2 px-2 pb-3 pt-1">
            {places.map((item, index) => (
              <button key={item.label} type="button" onClick={() => phone ? onMobile({ layout: item.layout }) : onChange({ layout: item.layout === "same" ? "modal" : item.layout })} className="layout-tile rounded-2xl border-0 bg-white p-1.5 text-center shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)] data-[on=true]:shadow-[inset_0_0_0_2px_#1a1a1a]" data-on={placeOn(item.layout)} style={{ transitionDelay: open ? `${index * 40}ms` : "0ms" }}>
                <Sketch kind={item.sketch} />
                <span className="mt-1 block text-[11px] font-semibold">{item.label}</span>
              </button>
            ))}
            {columnsTiles.map((item, index) => (
              <button key={item.key} type="button" onClick={item.pick} className="layout-tile rounded-2xl border-0 bg-white p-1.5 text-center shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)] data-[on=true]:shadow-[inset_0_0_0_2px_#1a1a1a]" data-on={item.on} style={{ transitionDelay: open ? `${160 + index * 40}ms` : "0ms" }}>
                <Sketch kind={item.sketch} />
                <span className="mt-1 block text-[11px] font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
          {!phone && design.media !== "none" ? (
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              <button type="button" className="h-8 rounded-full border-0 bg-white px-3 text-xs font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.06)]" onClick={onPickMedia}>{design.mediaImage ? "החלפת תמונת הצד" : "תמונת הצד"}</button>
              {design.mediaImage ? <button type="button" className="text-xs text-[#8a8a8a]" onClick={() => onChange({ mediaImage: "" })}>הסרת תמונה</button> : null}
            </div>
          ) : null}
        </div>
      </div>
      <style>{`.layout-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .36s cubic-bezier(.2,.75,.2,1)}.layout-fold[data-open="true"]{grid-template-rows:1fr}.layout-fold>div{min-height:0;overflow:hidden}.layout-tile{opacity:0;transform:translateY(8px) scale(.96);transition:opacity .28s ease,transform .32s cubic-bezier(.2,.8,.2,1),box-shadow .15s}.layout-fold[data-open="true"] .layout-tile{opacity:1;transform:none}`}</style>
    </div>
  );
}

function Sketch({ kind }: { kind: string }) {
  return (
    <span className="relative block h-14 overflow-hidden rounded-xl bg-[#eee]">
      {kind === "center" || kind === "same" ? <span className="absolute left-1/2 top-1/2 h-6 w-8 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.16)]" /> : null}
      {kind === "bottom" ? <span className="absolute inset-x-1.5 bottom-1.5 h-3.5 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.16)]" /> : null}
      {kind === "corner" ? <span className="absolute bottom-1.5 left-1.5 h-5 w-7 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.16)]" /> : null}
      {kind === "one" ? <span className="absolute inset-y-2 left-3 right-3 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.16)]" /> : null}
      {kind === "right" ? <><span className="absolute inset-y-2 right-1.5 w-5 rounded-md bg-[#1a1a1a]" /><span className="absolute inset-y-2 left-1.5 right-8 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]" /></> : null}
      {kind === "left" ? <><span className="absolute inset-y-2 left-1.5 w-5 rounded-md bg-[#1a1a1a]" /><span className="absolute inset-y-2 left-8 right-1.5 rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]" /></> : null}
      {kind === "above" ? <><span className="absolute inset-x-2 top-1.5 h-4 rounded-md bg-[#1a1a1a]" /><span className="absolute inset-x-2 bottom-1.5 top-7 rounded-md bg-white" /></> : null}
      {kind === "fields" ? (
        <span className="absolute inset-x-2 top-2 grid grid-cols-2 gap-1">
          <span className="h-3 rounded bg-white" />
          <span className="h-3 rounded bg-white" />
          <span className="col-span-2 h-3 rounded bg-white" />
          <span className="col-span-2 h-3 rounded bg-[#1a1a1a]" />
        </span>
      ) : null}
    </span>
  );
}

function LookSlider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-[#616161]"><span>{label}</span><span>{value}</span></span>
      <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 block w-full" />
    </label>
  );
}

function CanvasFields({
  design,
  device,
  onChange,
  onMobile,
  onArrange,
  onUpload,
  onMedia,
}: {
  design: PopupDesign;
  device: "desktop" | "mobile";
  onChange: (next: Partial<PopupDesign>) => void;
  onMobile: (next: Partial<PopupMobile>) => void;
  onArrange: (side: "right" | "left" | "single") => void;
  onUpload: (file: File) => Promise<void>;
  onMedia: (file: File) => Promise<void>;
}) {
  const file = useRef<HTMLInputElement>(null);
  const mediaFile = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const hasFields = design.blocks.some((block) => block.type === "field");
  const look = popupLook(design, device);
  const phone = device === "mobile";
  const summary = `${phone ? "אייפון" : "מחשב"} · ${layoutName(look.layout)} · עיגול ${look.radius}`;
  return (
    <div className="shrink-0 overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-3 text-start">
        <b className="text-sm">החלון</b>
        <span className="truncate text-xs text-[#8a8a8a]">{summary}</span>
        <span className="ms-auto text-xs text-[#8a8a8a] transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      <div data-open={open} className="window-fold">
        <div>
      <div className="flex flex-col gap-4 px-3 pb-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#fafafa] px-3 py-2.5">
          <Swatch label="רקע" value={design.background} onChange={(background) => onChange({ background })} />
          <Swatch label="כפתור" value={design.submitBackground} onChange={(submitBackground) => onChange({ submitBackground })} />
          <Swatch label="איקס" value={design.closeColor} onChange={(closeColor) => onChange({ closeColor })} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#616161]">גודל האיקס</span>
        <input aria-label="גודל האיקס" type="range" min={14} max={36} value={design.closeSize} onChange={(event) => onChange({ closeSize: Number(event.target.value) })} className="w-24" />
        <div className="flex gap-1">
          {CLOSE_PLACES.map(([place, label]) => (
            <button key={place} type="button" aria-label={label} title={label} data-on={design.closePlace === place} onClick={() => onChange({ closePlace: place })} className="relative size-7 rounded-lg border-0 bg-[#f3f3f3] data-[on=true]:bg-[#1a1a1a]">
              <span className="absolute size-1.5 rounded-full bg-current" style={{ color: design.closePlace === place ? "#fff" : "#1a1a1a", top: place.startsWith("top") ? 4 : undefined, bottom: place.startsWith("bottom") ? 4 : undefined, left: place.endsWith("left") ? 4 : undefined, right: place.endsWith("right") ? 4 : undefined }} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <LookSlider label="עיגול פינות" min={0} max={40} value={look.radius} onChange={(radius) => phone ? onMobile({ radius }) : onChange({ radius })} />
        <LookSlider label="ריווח בפנים" min={0} max={40} value={look.gap} onChange={(gap) => phone ? onMobile({ gap }) : onChange({ gap })} />
        <LookSlider label="ריפוד" min={0} max={64} value={look.padding} onChange={(padding) => phone ? onMobile({ padding }) : onChange({ padding })} />
        <LookSlider label="רוחב" min={phone ? 280 : 280} max={phone ? 420 : 880} value={look.width} onChange={(width) => phone ? onMobile({ width }) : onChange({ width })} />
      </div>
      {phone && (design.mobile.radius >= 0 || design.mobile.padding >= 0 || design.mobile.gap >= 0 || design.mobile.width > 0) ? (
        <button type="button" className="mt-1 text-xs font-semibold text-[#616161]" onClick={() => onMobile({ radius: -1, padding: -1, gap: -1, width: 0 })}>ריווח ועיגול כמו במחשב</button>
      ) : null}
      <LayoutBoard phone={phone} design={design} lookLayout={look.layout} onChange={onChange} onMobile={onMobile} onArrange={onArrange} onPickMedia={() => mediaFile.current?.click()} />
      <input ref={mediaFile} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void onMedia(next); event.target.value = ""; }} />
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" className="h-8 rounded-full border-0 bg-[#f6f6f6] px-3 text-xs font-semibold" onClick={() => file.current?.click()}>{design.backgroundImage ? "תמונת רקע קיימת" : "תמונת רקע"}</button>
        {design.backgroundImage ? <button type="button" className="text-xs text-[#8a8a8a]" onClick={() => onChange({ backgroundImage: "" })}>הסרה</button> : null}
        <button type="button" className="ms-auto text-xs font-semibold text-[#616161]" onClick={() => setMore((open) => !open)}>{more ? "סגירה" : "עוד"}</button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void onUpload(next); event.target.value = ""; }} />
      </div>
      {more ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-[#f1f1f1] pt-3">
          <label className="text-sm">כהות מאחורי החלון
            <input type="range" min={0} max={80} value={design.overlay} onChange={(event) => onChange({ overlay: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={design.closeOnOverlay} onChange={(event) => onChange({ closeOnOverlay: event.target.checked })} />
            לחיצה בחוץ סוגרת
          </label>
          {hasFields ? (
            <label className="text-sm">טקסט הכפתור
              <input value={design.submitLabel} onChange={(event) => onChange({ submitLabel: event.target.value.slice(0, 40) })} className={popupFieldClass} />
            </label>
          ) : null}
          <ColorField label="צבע הטקסט בכפתור" value={design.submitColor} onChange={(submitColor) => onChange({ submitColor })} />
          <label className="text-sm">אחרי שליחה
            <input value={design.successTitle} onChange={(event) => onChange({ successTitle: event.target.value.slice(0, 80) })} className={popupFieldClass} />
          </label>
          <textarea value={design.successText} onChange={(event) => onChange({ successText: event.target.value.slice(0, 240) })} className={popupAreaClass} rows={2} />
        </div>
      ) : null}
      </div>
        </div>
      </div>
      <style>{`.window-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .36s cubic-bezier(.2,.75,.2,1)}.window-fold[data-open="true"]{grid-template-rows:minmax(0,46vh)}.window-fold>div{min-height:0;overflow:hidden}.window-fold[data-open="true"]>div{overflow-y:auto}`}</style>
    </div>
  );
}

function BlockFields({
  block,
  blocks,
  onChange,
  onUpload,
}: {
  block: PopupBlock;
  blocks: PopupBlock[];
  onChange: (next: PopupBlock) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <button type="button" data-on={block.span !== "half"} className={choice} onClick={() => onChange({ ...block, span: "full" })}>שורה מלאה</button>
        <button type="button" data-on={block.span === "half"} className={choice} onClick={() => onChange({ ...block, span: "half" })}>חצי שורה</button>
      </div>
      {block.type === "heading" || block.type === "text" ? (
        <>
          <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} className={popupAreaClass} rows={block.type === "heading" ? 2 : 4} />
          <ColorField label="צבע" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <label className="text-sm">גודל
            <input type="number" value={block.size} onChange={(event) => onChange({ ...block, size: Number(event.target.value) })} className={popupFieldClass} />
          </label>
          <div className="flex gap-1.5">
            {(["right", "center", "left"] as const).map((align) => (
              <button key={align} type="button" data-on={block.align === align} className={choice} onClick={() => onChange({ ...block, align })}>{align === "right" ? "ימין" : align === "center" ? "מרכז" : "שמאל"}</button>
            ))}
          </div>
          {block.type === "heading" ? (
            <div className="flex gap-1.5">
              <button type="button" data-on={block.weight === "bold"} className={choice} onClick={() => onChange({ ...block, weight: "bold" })}>מודגש</button>
              <button type="button" data-on={block.weight === "regular"} className={choice} onClick={() => onChange({ ...block, weight: "regular" })}>רגיל</button>
            </div>
          ) : null}
        </>
      ) : null}
      {block.type === "logo" ? (
        <>
          <p className="m-0 text-sm leading-6 text-[#4a4a4a]">הלוגו נמשך מההגדרות הכלליות. <Link href="/admin/settings" className="font-semibold text-[#1a1a1a]">להחלפת הלוגו</Link></p>
          <label className="text-sm">גודל {block.width}
            <input type="range" min={48} max={220} value={block.width} onChange={(event) => onChange({ ...block, width: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
        </>
      ) : null}
      {block.type === "image" ? (
        <>
          <button type="button" className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold" onClick={() => file.current?.click()}>{block.src ? "החלפת תמונה" : "העלאת תמונה"}</button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void onUpload(next); event.target.value = ""; }} />
          <label className="text-sm">טקסט חלופי
            <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value.slice(0, 120) })} className={popupFieldClass} />
          </label>
          <label className="text-sm">גודל {block.width}%
            <input type="range" min={30} max={100} value={block.width} onChange={(event) => onChange({ ...block, width: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="text-sm">עיגול הפינות {block.radius}
            <input type="range" min={0} max={40} value={block.radius} onChange={(event) => onChange({ ...block, radius: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
        </>
      ) : null}
      {block.type === "button" ? (
        <>
          <label className="text-sm">טקסט
            <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value.slice(0, 40) })} className={popupFieldClass} />
          </label>
          <label className="text-sm">קישור
            <input value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value.slice(0, 300) })} placeholder="/products או https://" className={popupFieldClass} />
          </label>
          <ColorField label="רקע" value={block.background} onChange={(background) => onChange({ ...block, background })} />
          <ColorField label="טקסט" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <label className="text-sm">עיגול
            <input type="number" min={0} max={28} value={block.radius === 999 ? 28 : block.radius} onChange={(event) => onChange({ ...block, radius: Number(event.target.value) >= 28 ? 999 : Number(event.target.value) })} className={popupFieldClass} />
          </label>
        </>
      ) : null}
      {block.type === "field" ? <FieldEditor block={block} blocks={blocks} onChange={onChange} /> : null}
      {block.type === "spacer" ? (
        <label className="text-sm">גובה
          <input type="number" min={4} max={80} value={block.height} onChange={(event) => onChange({ ...block, height: Number(event.target.value) })} className={popupFieldClass} />
        </label>
      ) : null}
    </div>
  );
}

function FieldEditor({ block, blocks, onChange }: { block: Extract<PopupBlock, { type: "field" }>; blocks: PopupBlock[]; onChange: (next: PopupBlock) => void }) {
  const preset = fieldPreset(block);
  function choose(nextPreset: FieldPreset) {
    const fresh = blankField(nextPreset, blocks.filter((item) => item.id !== block.id));
    onChange({
      ...block,
      fieldType: fresh.fieldType,
      label: nextPreset === "custom" && preset === "custom" ? block.label : fresh.label,
      placeholder: nextPreset === "custom" && preset === "custom" ? block.placeholder : fresh.placeholder,
      name: fresh.name,
      required: nextPreset === "custom" ? block.required : true,
    });
  }
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FIELD_PRESET_LABELS) as FieldPreset[]).map((item) => (
          <button key={item} type="button" data-on={preset === item} className={choice} onClick={() => choose(item)}>{FIELD_PRESET_LABELS[item]}</button>
        ))}
      </div>
      <label className="text-sm">{preset === "custom" ? "השאלה מעל השדה" : "הכיתוב מעל השדה"}
        <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value.slice(0, 60) })} className={popupFieldClass} />
      </label>
      <label className="text-sm">טקסט לדוגמה בתוך השדה
        <input value={block.placeholder} onChange={(event) => onChange({ ...block, placeholder: event.target.value.slice(0, 80) })} className={popupFieldClass} />
      </label>
      {preset === "custom" ? (
        <label className="text-sm">שם פנימי באנגלית, ככה זה נשמר בלידים
          <input value={block.name} onChange={(event) => onChange({ ...block, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} className={popupFieldClass} />
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={block.required} onChange={(event) => onChange({ ...block, required: event.target.checked })} />
        חובה למלא
      </label>
    </>
  );
}

function blockTitle(block: PopupBlock) {
  if (block.type === "field") return FIELD_PRESET_LABELS[fieldPreset(block)];
  return popupBlockLabel(block.type);
}

function blockHint(block: PopupBlock) {
  if (block.type === "heading" || block.type === "text") return block.text || "בלי טקסט";
  if (block.type === "image") return block.src ? "יש תמונה" : "עדיין בלי תמונה";
  if (block.type === "button") return block.label;
  if (block.type === "logo") return "הלוגו של החנות";
  if (block.type === "field") return block.label || "בלי כיתוב";
  if (block.type === "row") return `${block.columns.length} אזורים זה לצד זה`;
  return "רווח";
}
