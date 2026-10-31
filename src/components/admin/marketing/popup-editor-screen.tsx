"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { PopupCanvas } from "@/components/admin/marketing/popup-canvas";
import { PopupRules } from "@/components/admin/marketing/popup-rules";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { brandPalette, getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { popupFontStack, popupFontWeight, type PopupTextFont, type PopupTextWeight } from "@/lib/marketing/popup-style";
import {
  addArea,
  arrangeAreas,
  blankBlock,
  blankField,
  blockOnDevice,
  clearPhoneDesign,
  FIELD_PRESET_LABELS,
  fieldPreset,
  getPopup,
  popupAreaClass,
  popupBlockLabel,
  popupFieldClass,
  columnGrid,
  insertLeaf,
  moveColumn,
  moveLeafInto,
  moveLeafToRoot,
  placeLeaf,
  POPUP_MOTIONS,
  popupLook,
  setColumnWidth,
  removePopupBlock,
  savePopup,
  sealPhoneDesign,
  statusLabel,
  uploadPopupImage,
  writeBlockForDevice,
  writeWindowForDevice,
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

type Side = { kind: "list" } | { kind: "add" } | { kind: "window" } | { kind: "edit"; id: string };

const ADDABLE = new Set<PopupBlock["type"]>(["heading", "text", "logo", "image", "button", "spacer"]);

function blockFromToken(token: string, blocks: PopupBlock[]): PopupBlock | null {
  if (token === "add:row") return blankBlock("row", blocks);
  if (token.startsWith("add:field:")) {
    const preset = token.slice("add:field:".length);
    if (!(preset in FIELD_PRESET_LABELS)) return null;
    return blankField(preset as FieldPreset, blocks);
  }
  if (token.startsWith("add:block:")) {
    const type = token.slice("add:block:".length) as PopupBlock["type"];
    if (!ADDABLE.has(type)) return null;
    return blankBlock(type, blocks);
  }
  return null;
}

function findPopupPiece(blocks: PopupBlock[], id: string): { block: PopupBlock } | { columnId: string } | null {
  for (const block of blocks) {
    if (block.id === id) return { block };
    if (block.type === "row" || block.type === "columns") {
      for (const column of block.columns) {
        if (column.id === id) return { columnId: column.id };
        const child = findPopupPiece(column.blocks, id);
        if (child) return child;
      }
    }
    if (block.type === "container" || block.type === "stack" || block.type === "overlay") {
      const nested = findPopupPiece(block.blocks, id);
      if (nested) return nested;
    }
  }
  return null;
}

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
  const [side, setSide] = useState<Side>({ kind: "list" });
  const [beside, setBeside] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [columnAdd, setColumnAdd] = useState("");
  const [preview, setPreview] = useState(false);
  const [clip, setClip] = useState<{ id: number; kind: "in" | "both" }>({ id: 0, kind: "in" });
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const logo = getSettings().logo;
  function playMotion(kind: "in" | "both") {
    setClip((current) => ({ id: current.id + 1, kind }));
  }

  useEffect(() => {
    let alive = true;
    getPopup(popupId).then((row) => {
      if (!alive) return;
      setPopup(row);
      setSaved(row);
      setMissing(!row);
      setSelected("");
      setSide({ kind: "list" });
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
    setPopup((current) => {
      if (!current) return current;
      const design = sealPhoneDesign(current.design);
      return { ...current, design: { ...design, mobile: { ...design.mobile, ...next } } };
    });
  }

  function patchLook(next: Partial<PopupDesign>) {
    setPopup((current) => current ? { ...current, design: writeWindowForDevice(current.design, next, device) } : current);
  }

  function patchBlock(next: PopupBlock) {
    setPopup((current) => current ? { ...current, design: writeBlockForDevice(current.design, next, device) } : current);
  }

  function openEdit(id: string) {
    setSelected(id);
    setSide({ kind: "edit", id });
  }

  function placeBeside(block: PopupBlock, index: number) {
    setPopup((current) => {
      if (!current) return current;
      const blocks = [...current.design.blocks];
      blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
      const design = writeBlockForDevice({ ...current.design, blocks }, { ...block, span: "half" }, device);
      return { ...current, design };
    });
    setBeside(null);
    setInsertAt(null);
    setColumnAdd("");
    openEdit(block.id);
  }

  function addInColumn(columnId: string, block: PopupBlock) {
    setPopup((current) => current ? { ...current, design: { ...current.design, blocks: insertLeaf(current.design.blocks, columnId, block, 999) } } : current);
    setColumnAdd("");
    setBeside(null);
    setInsertAt(null);
    openEdit(block.id);
  }

  function insertBlock(block: PopupBlock, index: number) {
    setPopup((current) => {
      if (!current) return current;
      const blocks = [...current.design.blocks];
      blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
      return { ...current, design: { ...current.design, blocks } };
    });
    setBeside(null);
    setInsertAt(null);
    openEdit(block.type === "row" || block.type === "columns" ? block.columns[0]?.id ?? block.id : block.id);
  }

  function addBlock(type: PopupBlock["type"]) {
    const next = blankBlock(type, draft.design.blocks);
    if (columnAdd) {
      if (next.type !== "row" && next.type !== "columns" && next.type !== "container" && next.type !== "stack" && next.type !== "overlay") {
        addInColumn(columnAdd, next);
        return;
      }
      setColumnAdd("");
    }
    if (beside != null && next.type !== "row" && next.type !== "columns" && next.type !== "container" && next.type !== "stack" && next.type !== "overlay") {
      placeBeside(next, beside);
      return;
    }
    if (beside != null) setBeside(null);
    if (insertAt != null) {
      insertBlock(next, insertAt);
      return;
    }
    if (next.type === "row" || next.type === "columns" || next.type === "container" || next.type === "stack" || next.type === "overlay") {
      patchDesign({ blocks: [...draft.design.blocks, next] });
      openEdit(next.type === "row" || next.type === "columns" ? next.columns[0]?.id ?? next.id : next.id);
      return;
    }
    patchDesign({ blocks: placeLeaf(draft.design.blocks, selected, next) });
    openEdit(next.id);
  }

  function addField(preset: FieldPreset) {
    const next = blankField(preset, draft.design.blocks);
    if (columnAdd) {
      addInColumn(columnAdd, next);
      return;
    }
    if (beside != null) {
      placeBeside(next, beside);
      return;
    }
    if (insertAt != null) {
      insertBlock(next, insertAt);
      return;
    }
    patchDesign({ blocks: placeLeaf(draft.design.blocks, selected, next) });
    openEdit(next.id);
  }

  function insertToken(token: string, index: number, columnId?: string) {
    if (token === "add:column") {
      addColumn();
      setSide({ kind: "list" });
      return;
    }
    const block = blockFromToken(token, draft.design.blocks);
    if (!block) return;
    setPopup((current) => {
      if (!current) return current;
      const leaf = block.type !== "row" && block.type !== "columns" && block.type !== "container" && block.type !== "stack" && block.type !== "overlay";
      if (columnId && leaf) {
        return { ...current, design: { ...current.design, blocks: insertLeaf(current.design.blocks, columnId, block, index) } };
      }
      const blocks = [...current.design.blocks];
      blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
      return { ...current, design: { ...current.design, blocks } };
    });
    openEdit(block.id);
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

  function fillSlot(source: string, index: number) {
    if (source.startsWith("add:")) {
      const block = blockFromToken(source, draft.design.blocks);
      if (!block || block.type === "row") return;
      placeBeside(block, index);
      return;
    }
    setPopup((current) => {
      if (!current) return current;
      const from = current.design.blocks.findIndex((item) => item.id === source);
      if (from < 0) return current;
      const blocks = [...current.design.blocks];
      const [item] = blocks.splice(from, 1);
      if (!item || item.type === "row") return current;
      const dest = Math.max(0, Math.min(from < index ? index - 1 : index, blocks.length));
      blocks.splice(dest, 0, item);
      const viewed = blockOnDevice(item, device);
      const design = writeBlockForDevice({ ...current.design, blocks }, { ...viewed, span: "half" }, device);
      return { ...current, design };
    });
    setBeside(null);
    openEdit(source);
  }

  function moveIntoColumn(id: string, columnId: string, index: number) {
    setPopup((current) => current ? { ...current, design: { ...current.design, blocks: moveLeafInto(current.design.blocks, id, columnId, index) } } : current);
    setOverColumn("");
    openEdit(id);
  }

  function moveBlockTo(id: string, index: number) {
    if (id.startsWith("column:")) return;
    setPopup((current) => {
      if (!current) return current;
      const from = current.design.blocks.findIndex((item) => item.id === id);
      if (from < 0) return { ...current, design: { ...current.design, blocks: moveLeafToRoot(current.design.blocks, id, index) } };
      const blocks = [...current.design.blocks];
      const [item] = blocks.splice(from, 1);
      const dest = Math.max(0, Math.min(index > from ? index - 1 : index, blocks.length));
      if (!item || dest === from) return current;
      blocks.splice(dest, 0, item);
      return { ...current, design: { ...current.design, blocks } };
    });
    setOverIndex(-1);
  }

  function dropOn(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id.startsWith("add:")) {
      insertToken(id, index);
      return;
    }
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
    setPopup((current) => {
      if (!current) return current;
      const design = device === "mobile" ? sealPhoneDesign(current.design) : current.design;
      return { ...current, design: { ...design, blocks: setColumnWidth(design.blocks, id, width, device === "mobile") } };
    });
  }

  function removeBlock(id: string) {
    patchDesign({ blocks: removePopupBlock(draft.design.blocks, id) });
    setSelected("");
    setSide({ kind: "list" });
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

  const piece = side.kind === "edit" ? findPopupPiece(draft.design.blocks, side.id) : null;
  const menu = side.kind === "list" || (side.kind === "edit" && !piece);
  const editBlock = piece && "block" in piece ? blockOnDevice(piece.block, device) : null;
  const editColumn = piece && "columnId" in piece ? draft.design.blocks.flatMap((block) => block.type === "row" || block.type === "columns" ? block.columns : []).find((column) => column.id === piece.columnId) : null;

  return (
    <div className="flex min-h-full flex-col">
      <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
        <div className="flex max-h-[calc(100dvh-96px)] min-h-0 min-w-0 flex-col gap-3 overflow-hidden pe-1">
          {tab === "design" ? menu ? (
            <>
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                <div className="flex w-full shrink-0 items-center gap-2 px-3 py-3">
                  <b className="text-sm">מה מופיע בחלון</b>
                  <span className="text-xs text-[#8a8a8a]">{draft.design.blocks.length}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
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
                      <button type="button" onClick={() => openEdit(item.id)} className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent py-2 text-start">
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm">{blockTitle(item)}</b>
                          <span className="block w-full truncate text-xs text-[#616161]">{blockHint(item)}{item.span === "half" ? " · חצי שורה" : ""}</span>
                        </span>
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
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const id = event.dataTransfer.getData("text/plain");
                              if (id.startsWith("add:")) insertToken(id, column.blocks.length, column.id);
                              else if (id.startsWith("column:")) moveColumnTo(id.slice("column:".length), columnIndex);
                              else if (id) moveIntoColumn(id, column.id, column.blocks.length);
                            }}
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
                              <button type="button" onClick={() => openEdit(column.id)} className="min-w-0 flex-1 border-0 bg-transparent text-start text-xs font-semibold">אזור {columnIndex + 1}</button>
                              <span className="text-[11px] text-[#8a8a8a]">{column.width}%</span>
                              <button type="button" aria-label="מחיקת אזור" onClick={() => removeBlock(column.id)} className="border-0 bg-transparent text-sm text-[#8a8a8a]">×</button>
                            </div>
                            {column.blocks.map((child, childIndex) => (
                              <button
                                key={child.id}
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  event.stopPropagation();
                                  event.dataTransfer.setData("text/plain", child.id);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOverColumn(column.id); }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const id = event.dataTransfer.getData("text/plain");
                                  if (id.startsWith("add:")) insertToken(id, childIndex, column.id);
                                  else if (id && !id.startsWith("column:") && id !== child.id) moveIntoColumn(id, column.id, childIndex);
                                }}
                                onClick={() => openEdit(child.id)}
                                className="mb-1 block w-full cursor-grab rounded-lg border-0 bg-white px-2 py-1.5 text-start text-xs active:cursor-grabbing"
                              >
                                <b>{blockTitle(child)}</b>
                              </button>
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
                  </div>
                ))}
                <div className={`h-2 rounded-full ${overIndex === draft.design.blocks.length ? "bg-[#1a1a1a]" : ""}`} onDragOver={(event) => { event.preventDefault(); setOverIndex(draft.design.blocks.length); }} onDrop={(event) => dropOn(event, draft.design.blocks.length)} />
                </div>
              </section>
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button type="button" onClick={() => { setBeside(null); setInsertAt(null); setColumnAdd(""); setSide({ kind: "add" }); }} className="flex h-12 items-center justify-center gap-2 rounded-[18px] border-0 bg-[#1a1a1a] text-sm font-semibold text-white">
                  <span className="grid size-6 place-items-center rounded-full bg-white text-base leading-none text-[#1a1a1a]">+</span>
                  הוספה
                </button>
                <button type="button" onClick={() => setSide({ kind: "window" })} className="h-12 rounded-[18px] border-0 bg-white px-4 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.06)]">החלון</button>
              </div>
            </>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
              <SideBack
                title={side.kind === "add" ? "הוספה" : side.kind === "window" ? "החלון" : editColumn ? "אזור" : editBlock ? blockTitle(editBlock) : "עריכה"}
                hint={side.kind === "add" ? (columnAdd ? "הפריט יתווסף בצד בלי התמונה" : beside != null ? "הפריט יתווסף ליד החצי שורה" : insertAt != null ? "הפריט יתווסף בתחתית הפופאפ" : "לחצו או גררו לתוך הפופאפ") : side.kind === "window" ? `${device === "mobile" ? "אייפון" : "מחשב"} · ${layoutName(popupLook(draft.design, device).layout)}` : undefined}
                onBack={() => setSide({ kind: "list" })}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {side.kind === "add" ? <AddDrawer onAdd={addBlock} onField={addField} onColumn={addColumn} /> : null}
                {side.kind === "window" ? (
                  <CanvasFields design={draft.design} device={device} onChange={patchLook} onMobile={patchMobile} onResetPhone={() => patchDesign({ ...clearPhoneDesign(draft.design) })} onArrange={arrange} onPlay={playMotion} onUpload={async (file) => {
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
                ) : null}
                {editColumn ? (
                  <label className="block text-sm font-semibold">רוחב האזור {(device === "mobile" && editColumn.phoneWidth ? editColumn.phoneWidth : editColumn.width)}%
                    <input type="range" min={15} max={85} value={device === "mobile" && editColumn.phoneWidth ? editColumn.phoneWidth : editColumn.width} onChange={(event) => resizeColumn(editColumn.id, Number(event.target.value))} className="mt-2 w-full" />
                  </label>
                ) : null}
                {editBlock ? (
                  <BlockFields block={editBlock} blocks={draft.design.blocks} onChange={patchBlock} onUpload={async (file) => {
                    try {
                      const src = await uploadPopupImage(file);
                      if (editBlock.type === "image") patchBlock({ ...editBlock, src });
                    } catch (error) {
                      toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
                    }
                  }} />
                ) : null}
              </div>
            </section>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto"><PopupRules popup={draft} onChange={(targeting) => patch({ targeting })} onWindow={(startsAt, endsAt) => patch({ startsAt, endsAt })} /></div>
          )}
        </div>
        <div className="sticky top-4 min-w-0">
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="flex rounded-full bg-white p-1 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
              <button type="button" data-on={device === "desktop"} onClick={() => { setDevice("desktop"); if (preview) playMotion("in"); }} className="h-8 rounded-full border-0 px-4 text-sm font-semibold text-[#616161] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">מחשב</button>
              <button type="button" data-on={device === "mobile"} onClick={() => { setDevice("mobile"); if (preview) playMotion("in"); }} className="h-8 rounded-full border-0 px-4 text-sm font-semibold text-[#616161] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">אייפון</button>
            </div>
            <button type="button" data-on={preview} onClick={() => { if (!preview) playMotion("in"); setPreview((on) => !on); }} className="h-8 rounded-full border-0 bg-white px-4 text-sm font-semibold text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.06)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">{preview ? "חזרה לעריכה" : "צפייה"}</button>
            {preview ? <button type="button" onClick={() => playMotion("both")} className="h-8 rounded-full border-0 bg-white px-4 text-sm font-semibold text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.06)]">נגן שוב</button> : null}
          </div>
          {device === "mobile" ? <p className="mb-3 text-center text-xs leading-5 text-[#616161]">ההתאמה לאייפון נשמרת בנפרד. המילים והתמונות נשארים כמו במחשב.</p> : null}
          <PopupCanvas design={draft.design} device={device} logoUrl={logo} preview={preview} motionPlay={clip} selectedId={preview ? "" : selected} onSelect={preview ? undefined : openEdit} onMove={moveBlockTo} onMoveColumn={moveColumnTo} onResizeColumn={resizeColumn} onInsert={insertToken} onMoveInto={moveIntoColumn} onFillSlot={fillSlot} onAddBeside={(index) => { setColumnAdd(""); setInsertAt(null); setBeside(index); setSide({ kind: "add" }); }} onAddAt={(index) => { setColumnAdd(""); setBeside(null); setInsertAt(index); setSide({ kind: "add" }); }} onAddInColumn={(columnId) => { setBeside(null); setInsertAt(null); setColumnAdd(columnId); setSide({ kind: "add" }); }} onRemove={removeBlock} />
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

const CLOSE_PLACES: Array<[PopupClosePlace, string]> = [
  ["top-right", "ימין למעלה"],
  ["top-left", "שמאל למעלה"],
  ["bottom-right", "ימין למטה"],
  ["bottom-left", "שמאל למטה"],
];

function dragToken(event: DragEvent<HTMLButtonElement>, token: string) {
  event.dataTransfer.setData("text/plain", token);
  event.dataTransfer.effectAllowed = "copy";
}

const ADD_GLYPHS = {
  heading: "M4 16V4h3.2M4 9.5h7M13 4v12",
  text: "M4 6h12M4 10h12M4 14h8",
  image: "M4 5h12v10H4zM4 12.2l3-2.4 2.4 2 2.2-1.6L16 13M8 8h.01",
  logo: "M10 3.2l1.3 3.4 3.6.3-2.7 2.3.8 3.5L10 11.2 7 12.7l.8-3.5L5.1 6.9l3.6-.3z",
  button: "M4 7h12v6H4z",
  spacer: "M4 8h12M4 12h12",
  row: "M3.5 5h13v10h-13zM10 5v10",
  column: "M3.5 5h13v10h-13zM8 5v10M12 5v10",
  email: "M3.5 6h13v8.5h-13zM3.5 7l6.5 4 6.5-4",
  phone: "M7 4h2l1 2.5-1.5.8a8 8 0 0 0 3.2 3.2l.8-1.5L15 10v2a1 1 0 0 1-1 1A10 10 0 0 1 5 6a1 1 0 0 1 1-1z",
  name: "M10 9.2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.2 16c.6-2.4 2.5-3.6 4.8-3.6s4.2 1.2 4.8 3.6",
  note: "M6 3.8h6.2L15 6.6V16H6zM12.2 3.8V6.6H15M8 10.5h4M8 13h3",
  custom: "M10 4.2a4.2 4.2 0 0 1 2.3 7.6c-.8.5-1.3 1.1-1.3 1.8V14.4M10 16.6h.01",
  check: "M5 4.5h10v11H5zM7.2 10l1.8 1.8L13 8",
} as const;

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function AddTile({ label, hint, glyph, token, tone, onClick }: { label: string; hint: string; glyph: string; token: string; tone: "content" | "field"; onClick: () => void }) {
  return (
    <button type="button" draggable onDragStart={(event) => dragToken(event, token)} onClick={onClick} className="flex cursor-grab items-center gap-2.5 rounded-2xl border-0 bg-white px-2.5 py-2 text-start shadow-[0_0_0_1px_rgba(0,0,0,.07)] hover:bg-[#faf8f6] active:cursor-grabbing">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone === "field" ? "bg-[#1a1a1a] text-white" : "bg-[#f3efe9] text-[#1a1a1a]"}`}>
        <Glyph d={glyph} />
      </span>
      <span className="min-w-0">
        <b className="block text-[13px] leading-5">{label}</b>
        <span className="block truncate text-[11px] leading-4 text-[#8a8a8a]">{hint}</span>
      </span>
    </button>
  );
}

function AddDrawer({ onAdd, onField, onColumn }: { onAdd: (type: PopupBlock["type"]) => void; onField: (preset: FieldPreset) => void; onColumn: () => void }) {
  const content: Array<[PopupBlock["type"], string, string, string]> = [
    ["heading", "כותרת", "שורה גדולה", ADD_GLYPHS.heading],
    ["text", "טקסט", "פסקה קצרה", ADD_GLYPHS.text],
    ["image", "תמונה", "תמונה מהמחשב", ADD_GLYPHS.image],
    ["logo", "לוגו", "הלוגו של החנות", ADD_GLYPHS.logo],
    ["button", "כפתור", "קישור לפעולה", ADD_GLYPHS.button],
    ["spacer", "רווח", "מרווח בין פריטים", ADD_GLYPHS.spacer],
  ];
  const fields: Array<[FieldPreset, string]> = [
    ["email", "כתובת מייל"],
    ["phone", "מספר טלפון"],
    ["name", "שם מלא"],
    ["note", "טקסט ארוך"],
    ["custom", "שאלה משלכם"],
    ["check", "סימון כן או לא"],
  ];
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-xs leading-5 text-[#616161]">גררו פריט לתוך הפופאפ, או לחצו עליו כדי להוסיף אותו.</p>
      <section className="flex flex-col gap-2">
        <b className="text-sm">תוכן</b>
        <div className="grid grid-cols-2 gap-2">
          {content.map(([type, label, hint, glyph]) => (
            <AddTile key={type} label={label} hint={hint} glyph={glyph} tone="content" token={`add:block:${type}`} onClick={() => onAdd(type)} />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <b className="text-sm">מבנה</b>
        <div className="grid grid-cols-2 gap-2">
          <AddTile label="שורה" hint="שני אזורים זה לצד זה" glyph={ADD_GLYPHS.row} tone="content" token="add:row" onClick={() => onAdd("row")} />
          <AddTile label="עמודה" hint="אזור נוסף בשורה" glyph={ADD_GLYPHS.column} tone="content" token="add:column" onClick={onColumn} />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <div>
          <b className="text-sm">שדות לטופס</b>
          <p className="m-0 mt-0.5 text-xs leading-5 text-[#616161]">אחרי ההוספה בוחרים אם השדה חובה או לא.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {fields.map(([preset, hint]) => (
            <AddTile key={preset} label={FIELD_PRESET_LABELS[preset]} hint={hint} glyph={ADD_GLYPHS[preset]} tone="field" token={`add:field:${preset}`} onClick={() => onField(preset)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SideBack({ title, hint, onBack }: { title: string; hint?: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#f1f1f1] px-3 py-3">
      <button type="button" onClick={onBack} className="flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-[#f3f3f3] px-3 py-1.5 text-sm font-semibold">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        חזרה לתפריט
      </button>
      <span className="min-w-0">
        <b className="block truncate text-sm">{title}</b>
        {hint ? <span className="block truncate text-xs text-[#8a8a8a]">{hint}</span> : null}
      </span>
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

function LookSlider({ label, min, max, step = 1, value, text, onChange }: { label: string; min: number; max: number; step?: number; value: number; text?: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-[#616161]"><span>{label}</span><span>{text ?? value}</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 block w-full" />
    </label>
  );
}

function CanvasFields({
  design,
  device,
  onChange,
  onMobile,
  onResetPhone,
  onArrange,
  onPlay,
  onUpload,
  onMedia,
}: {
  design: PopupDesign;
  device: "desktop" | "mobile";
  onChange: (next: Partial<PopupDesign>) => void;
  onMobile: (next: Partial<PopupMobile>) => void;
  onResetPhone: () => void;
  onArrange: (side: "right" | "left" | "single") => void;
  onPlay: (kind: "in" | "both") => void;
  onUpload: (file: File) => Promise<void>;
  onMedia: (file: File) => Promise<void>;
}) {
  const mediaFile = useRef<HTMLInputElement>(null);
  const [more, setMore] = useState(false);
  const [motionOpen, setMotionOpen] = useState(true);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const look = popupLook(design, device);
  const phone = device === "mobile";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#fafafa] px-3 py-2.5">
          <Swatch label="רקע" value={look.background} onChange={(background) => onChange({ background })} />
          <Swatch label="איקס" value={look.closeColor} onChange={(closeColor) => onChange({ closeColor })} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#616161]">גודל האיקס</span>
        <input aria-label="גודל האיקס" type="range" min={14} max={36} value={look.closeSize} onChange={(event) => onChange({ closeSize: Number(event.target.value) })} className="w-24" />
        <div className="flex gap-1">
          {CLOSE_PLACES.map(([place, label]) => (
            <button key={place} type="button" aria-label={label} title={label} data-on={look.closePlace === place} onClick={() => onChange({ closePlace: place })} className="relative size-7 rounded-lg border-0 bg-[#f3f3f3] data-[on=true]:bg-[#1a1a1a]">
              <span className="absolute size-1.5 rounded-full bg-current" style={{ color: look.closePlace === place ? "#fff" : "#1a1a1a", top: place.startsWith("top") ? 4 : undefined, bottom: place.startsWith("bottom") ? 4 : undefined, left: place.endsWith("left") ? 4 : undefined, right: place.endsWith("right") ? 4 : undefined }} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <LookSlider label="עיגול פינות" min={0} max={40} value={look.radius} onChange={(radius) => phone ? onMobile({ radius }) : onChange({ radius })} />
        <LookSlider label="ריווח בפנים" min={0} max={40} value={look.gap} onChange={(gap) => phone ? onMobile({ gap }) : onChange({ gap })} />
        <LookSlider label="ריפוד" min={0} max={64} value={look.padding} onChange={(padding) => phone ? onMobile({ padding }) : onChange({ padding })} />
        <LookSlider label="רוחב" min={phone ? 280 : 280} max={phone ? 420 : 880} value={look.width} onChange={(width) => phone ? onMobile({ width }) : onChange({ width })} />
        <LookSlider label="גובה" min={0} max={phone ? 780 : 960} step={10} value={look.height} text={look.height ? String(look.height) : "לפי התוכן"} onChange={(height) => onChange({ height })} />
      </div>
      <Fold title="אנימציה" summary={phone && design.mobile.motion === "same" ? "כמו במחשב" : (POPUP_MOTIONS.find((item) => item.id === look.motion)?.label ?? "עולה")} open={motionOpen} onToggle={() => setMotionOpen((open) => !open)}>
        <div className="flex flex-col gap-0.5">
          {phone ? <MenuRow on={design.mobile.motion === "same"} onClick={() => onMobile({ motion: "same" })}>כמו במחשב</MenuRow> : null}
          {POPUP_MOTIONS.map((item) => {
            const picked = phone ? design.mobile.motion === item.id : look.motion === item.id;
            return (
              <MenuRow key={item.id} on={picked} onClick={() => { onChange({ motion: item.id }); onPlay("in"); }}>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-[11px] leading-4 text-[#8a8a8a]">{item.detail}</span>
              </MenuRow>
            );
          })}
        </div>
        <button type="button" disabled={look.motion === "none"} onClick={() => onPlay("both")} className="mt-2 h-9 w-full rounded-full border-0 bg-[#1a1a1a] text-xs font-semibold text-white disabled:bg-[#ececec] disabled:text-[#8a8a8a]">נגן כניסה ויציאה</button>
        <p className="m-0 mt-2 text-[11px] leading-5 text-[#616161]">אותה תנועה רצה בכניסה וביציאה, רק הפוך. במחשב ובאייפון אפשר לבחור בנפרד.</p>
      </Fold>
      {phone ? (
        <button type="button" className="text-xs font-semibold text-[#616161]" onClick={onResetPhone}>לאפס את האייפון להגדרות המחשב</button>
      ) : null}
      <LayoutBoard phone={phone} design={design} lookLayout={look.layout} onChange={onChange} onMobile={onMobile} onArrange={onArrange} onPickMedia={() => mediaFile.current?.click()} />
      <input ref={mediaFile} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void onMedia(next); event.target.value = ""; }} />
      <div className="mt-2.5 flex items-center gap-2">
        <label className="relative grid h-16 min-w-36 cursor-pointer overflow-hidden rounded-2xl bg-[#f6f6f6]">
          {design.backgroundImage ? <img alt="" src={design.backgroundImage} className="absolute inset-0 size-full object-cover" /> : null}
          <span className="relative z-[1] grid place-items-center px-3 text-xs font-semibold" style={design.backgroundImage ? { color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.55)" } : undefined}>{uploadingBackground ? "מעלים את התמונה…" : design.backgroundImage ? "החלפת תמונת רקע" : "תמונת רקע"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="absolute inset-0 z-[2] cursor-pointer opacity-0"
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (!next) return;
              setUploadingBackground(true);
              void onUpload(next).finally(() => setUploadingBackground(false));
            }}
          />
        </label>
        {design.backgroundImage ? <button type="button" className="text-xs text-[#8a8a8a]" onClick={() => onChange({ backgroundImage: "" })}>הסרה</button> : null}
        <button type="button" className="ms-auto text-xs font-semibold text-[#616161]" onClick={() => setMore((open) => !open)}>{more ? "סגירה" : "עוד"}</button>
      </div>
      {design.backgroundImage ? (
        <div className="flex flex-col gap-3">
          <LookSlider label="שקיפות התמונה" min={0} max={100} value={look.imageFade} text={`${look.imageFade}%`} onChange={(imageFade) => onChange({ imageFade })} />
          {look.imageWash ? (
            <>
              <div className="flex items-center gap-3">
                <Swatch label="צבע מעל התמונה" value={look.imageWash} onChange={(imageWash) => onChange({ imageWash })} />
                <button type="button" className="text-xs text-[#8a8a8a]" onClick={() => onChange({ imageWash: "" })}>בלי צבע</button>
              </div>
              <LookSlider label="שקיפות הצבע" min={0} max={100} value={look.imageWashOpacity} text={`${look.imageWashOpacity}%`} onChange={(imageWashOpacity) => onChange({ imageWashOpacity })} />
            </>
          ) : (
            <button type="button" className="h-8 w-fit rounded-full border-0 bg-[#f6f6f6] px-3 text-xs font-semibold" onClick={() => onChange({ imageWash: "#1a1a1a", imageWashOpacity: look.imageWashOpacity || 45 })}>צבע מעל התמונה</button>
          )}
        </div>
      ) : null}
      {more ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-[#f1f1f1] pt-3">
          <label className="text-sm">כהות מאחורי החלון
            <input type="range" min={0} max={80} value={look.overlay} onChange={(event) => onChange({ overlay: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={design.closeOnOverlay} onChange={(event) => onChange({ closeOnOverlay: event.target.checked })} />
            לחיצה בחוץ סוגרת
          </label>
          <label className="text-sm">קוד ההנחה
            <input value={design.couponCode} onChange={(event) => onChange({ couponCode: event.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) })} placeholder="WELCOME10" className={popupFieldClass} />
          </label>
          <p className="m-0 text-xs leading-5 text-[#616161]">הקוד מופיע אחרי שליחה, רק כשיש שדה הסכמה מסומן. כפתור השליחה נוסף מהאלמנטים.</p>
          <label className="text-sm">אחרי שליחה
            <input value={design.successTitle} onChange={(event) => onChange({ successTitle: event.target.value.slice(0, 80) })} className={popupFieldClass} />
          </label>
          <textarea value={design.successText} onChange={(event) => onChange({ successText: event.target.value.slice(0, 240) })} className={popupAreaClass} rows={2} />
        </div>
      ) : null}
    </div>
  );
}

function Fold({ title, summary, open, onToggle, children }: { title: string; summary: ReactNode; open?: boolean; onToggle?: () => void; children: ReactNode }) {
  const [local, setLocal] = useState(false);
  const shown = open ?? local;
  return (
    <div className="overflow-hidden rounded-2xl bg-[#f6f5f3]">
      <button type="button" aria-expanded={shown} onClick={() => (onToggle ? onToggle() : setLocal((current) => !current))} className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-start">
        <span className="text-sm font-semibold">{title}</span>
        <span className="ms-auto max-w-[58%] truncate rounded-full bg-white px-2.5 py-1 text-xs font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.06)]">{summary}</span>
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[#8a8a8a] transition-transform duration-300" style={{ transform: shown ? "rotate(180deg)" : "none" }}><path d="M5 8l5 5 5-5" /></svg>
      </button>
      <div data-open={shown} className="choice-fold">
        <div>
          <div className="px-2 pb-2">{children}</div>
        </div>
      </div>
      <style>{`.choice-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.2,.75,.2,1)}.choice-fold[data-open="true"]{grid-template-rows:1fr}.choice-fold>div{min-height:0;overflow:hidden}`}</style>
    </div>
  );
}

function MenuRow({ on, onClick, style, children }: { on: boolean; onClick: () => void; style?: CSSProperties; children: ReactNode }) {
  return (
    <button type="button" data-on={on} onClick={onClick} style={style} className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-sm data-[on=true]:bg-white data-[on=true]:shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <span className="min-w-0 flex-1">{children}</span>
      <span className={`grid size-4 shrink-0 place-items-center rounded-full ${on ? "bg-[#1a1a1a] text-white" : ""}`}>
        {on ? <svg viewBox="0 0 20 20" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 10.5 8 14l7.5-8" /></svg> : null}
      </span>
    </button>
  );
}

function TextSize({ value, min, max, onChange, open, onToggle }: { value: number; min: number; max: number; onChange: (size: number) => void; open?: boolean; onToggle?: () => void }) {
  const steps = [12, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48].filter((size) => size >= min && size <= max);
  function set(size: number) {
    const next = Math.round(size);
    if (!Number.isFinite(next)) return;
    onChange(Math.min(max, Math.max(min, next)));
  }
  return (
    <Fold title="גודל" summary={`${value} px`} open={open} onToggle={onToggle}>
      <div className="flex items-center justify-between rounded-full bg-white p-0.5 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
        <button type="button" aria-label="קטן יותר" onClick={() => set(value - 1)} className="grid size-8 place-items-center rounded-full border-0 bg-transparent text-base">−</button>
        <label className="flex items-center gap-0.5">
          <input aria-label="גודל בפיקסלים" type="number" min={min} max={max} value={value} onChange={(event) => set(Number(event.target.value))} className="w-10 border-0 bg-transparent text-center text-sm font-semibold outline-none" />
          <span className="text-[11px] text-[#8a8a8a]">px</span>
        </label>
        <button type="button" aria-label="גדול יותר" onClick={() => set(value + 1)} className="grid size-8 place-items-center rounded-full border-0 bg-transparent text-base">+</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {steps.map((size) => (
          <button key={size} type="button" data-on={value === size} onClick={() => set(size)} className="h-8 min-w-8 rounded-full border-0 bg-white px-2 text-xs font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">{size}</button>
        ))}
      </div>
    </Fold>
  );
}

function AlignPicker({ value, onChange, open, onToggle }: { value: "right" | "center" | "left"; onChange: (align: "right" | "center" | "left") => void; open?: boolean; onToggle?: () => void }) {
  const marks = [
    ["right", "ימין", "M4 5h12M8 10h8M4 15h12"],
    ["center", "מרכז", "M4 5h12M6 10h8M4 15h12"],
    ["left", "שמאל", "M4 5h12M4 10h8M4 15h12"],
  ] as const;
  const current = marks.find(([align]) => align === value)?.[1] ?? "ימין";
  return (
    <Fold title="יישור" summary={current} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-0.5">
        {marks.map(([align, label, d]) => (
          <MenuRow key={align} on={value === align} onClick={() => onChange(align)}>
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d={d} /></svg>
              {label}
            </span>
          </MenuRow>
        ))}
      </div>
    </Fold>
  );
}

const TEXT_FONTS: Array<[PopupTextFont, string]> = [
  ["inherit", "ברירת מחדל"],
  ["heebo", "הייבו"],
  ["frank", "פרנק"],
];

const TEXT_WEIGHTS: Array<[PopupTextWeight, string]> = [
  ["regular", "רגיל"],
  ["medium", "בינוני"],
  ["semibold", "חצי מודגש"],
  ["bold", "מודגש"],
];

function markersToHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function markersFromHtml(root: HTMLElement) {
  let out = "";
  const walk = (node: Node, bold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) out += bold ? `**${text}**` : text;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    const next = bold || node.tagName === "STRONG" || node.tagName === "B";
    if ((node.tagName === "DIV" || node.tagName === "P") && out && !out.endsWith("\n")) out += "\n";
    node.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((child) => walk(child, false));
  while (out.includes("****")) out = out.replaceAll("****", "");
  return out;
}

function RichTextBox({ value, rows, max, onChange }: { value: string; rows: number; max: number; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    el.innerHTML = markersToHtml(value);
  }, [value]);
  function commit() {
    const el = ref.current;
    if (!el) return;
    onChange(markersFromHtml(el).slice(0, max));
  }
  function emphasize() {
    ref.current?.focus();
    document.execCommand("bold");
    commit();
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">הטקסט</span>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={emphasize} className="h-8 rounded-lg border-0 bg-[#f3f3f3] px-3 text-sm font-bold">הדגש</button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        dir="rtl"
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; commit(); }}
        onInput={commit}
        className={`${popupAreaClass} outline-none`}
        style={{ minHeight: rows * 28, whiteSpace: "pre-wrap" }}
      />
      <p className="m-0 mt-1 text-xs leading-5 text-[#616161]">סמנו מילים ולחצו הדגש. רק מה שסימנתם יודגש.</p>
    </div>
  );
}

function FontPicker({ value, onChange, open, onToggle }: { value: PopupTextFont; onChange: (font: PopupTextFont) => void; open?: boolean; onToggle?: () => void }) {
  const current = TEXT_FONTS.find(([font]) => font === value)?.[1] ?? "ברירת מחדל";
  return (
    <Fold title="פונט" summary={<span style={{ fontFamily: popupFontStack(value) }}>{current}</span>} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-0.5">
        {TEXT_FONTS.map(([font, label]) => (
          <MenuRow key={font} on={value === font} onClick={() => onChange(font)} style={{ fontFamily: popupFontStack(font) }}>{label}</MenuRow>
        ))}
      </div>
    </Fold>
  );
}

function WeightPicker({ value, onChange, open, onToggle }: { value: PopupTextWeight; onChange: (weight: PopupTextWeight) => void; open?: boolean; onToggle?: () => void }) {
  const current = TEXT_WEIGHTS.find(([weight]) => weight === value)?.[1] ?? "רגיל";
  return (
    <Fold title="משקל" summary={<span style={{ fontWeight: popupFontWeight(value) }}>{current}</span>} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-0.5">
        {TEXT_WEIGHTS.map(([weight, label]) => (
          <MenuRow key={weight} on={value === weight} onClick={() => onChange(weight)} style={{ fontWeight: popupFontWeight(weight) }}>{label}</MenuRow>
        ))}
      </div>
    </Fold>
  );
}

function SpanPicker({ span, onChange, open, onToggle }: { span: PopupBlock["span"]; onChange: (span: PopupBlock["span"]) => void; open?: boolean; onToggle?: () => void }) {
  return (
    <Fold title="כמה רוחב זה תופס" summary={span === "half" ? "חצי רוחב" : "על כל הרוחב"} open={open} onToggle={onToggle}>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" data-on={span !== "half"} onClick={() => onChange("full")} className="rounded-2xl border-0 bg-white p-2.5 text-start shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">
          <span className="mb-2 block h-3 rounded-md bg-current opacity-80" />
          <b className="block text-sm">על כל הרוחב</b>
          <span className="mt-0.5 block text-[11px] leading-4 opacity-70">שורה שלמה, לבד</span>
        </button>
        <button type="button" data-on={span === "half"} onClick={() => onChange("half")} className="rounded-2xl border-0 bg-white p-2.5 text-start shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">
          <span className="mb-2 flex gap-1">
            <span className="h-3 flex-1 rounded-md bg-current opacity-80" />
            <span className="h-3 flex-1 rounded-md bg-current opacity-25" />
          </span>
          <b className="block text-sm">חצי רוחב</b>
          <span className="mt-0.5 block text-[11px] leading-4 opacity-70">משאיר מקום לידו</span>
        </button>
      </div>
      <p className="m-0 mt-1.5 px-1 text-xs leading-5 text-[#616161]">חצי רוחב יושב לצד פריט אחר שגם הוא בחצי רוחב. אם אין לידו פריט, נשאר מקום ריק.</p>
    </Fold>
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
  const [uploading, setUploading] = useState(false);
  const [fold, setFold] = useState<string | null>(null);
  useEffect(() => { setFold(null); }, [block.id]);
  function toggle(key: string) {
    setFold((current) => (current === key ? null : key));
  }
  async function upload(next: File) {
    setUploading(true);
    try {
      await onUpload(next);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <SpanPicker span={block.span} onChange={(span) => onChange({ ...block, span })} open={fold === "span"} onToggle={() => toggle("span")} />
      {block.type === "heading" || block.type === "text" ? (
        <>
          <RichTextBox key={block.id} value={block.text} rows={block.type === "heading" ? 2 : 4} max={block.type === "heading" ? 160 : 800} onChange={(text) => onChange({ ...block, text })} />
          <ColorField label="צבע" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <TextSize value={block.size} min={block.type === "heading" ? 16 : 12} max={block.type === "heading" ? 48 : 24} onChange={(size) => onChange({ ...block, size })} open={fold === "size"} onToggle={() => toggle("size")} />
          <FontPicker value={block.font || "inherit"} onChange={(font) => onChange({ ...block, font })} open={fold === "font"} onToggle={() => toggle("font")} />
          <WeightPicker value={block.weight === "bold" || block.weight === "semibold" || block.weight === "medium" || block.weight === "regular" ? block.weight : "regular"} onChange={(weight) => onChange({ ...block, weight })} open={fold === "weight"} onToggle={() => toggle("weight")} />
          <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} open={fold === "align"} onToggle={() => toggle("align")} />
        </>
      ) : null}
      {block.type === "logo" ? (
        <>
          <p className="m-0 text-sm leading-6 text-[#4a4a4a]">הלוגו נמשך מההגדרות הכלליות. <Link href="/admin/settings" className="font-semibold text-[#1a1a1a]">להחלפת הלוגו</Link></p>
          <label className="text-sm">גודל {block.width}
            <input type="range" min={48} max={220} value={block.width} onChange={(event) => onChange({ ...block, width: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} open={fold === "align"} onToggle={() => toggle("align")} />
        </>
      ) : null}
      {block.type === "image" ? (
        <>
          <button type="button" disabled={uploading} onClick={() => file.current?.click()} className="relative grid h-28 place-items-center overflow-hidden rounded-2xl border-0 bg-[#f4f1ee] text-sm font-semibold disabled:cursor-wait">
            {block.src ? <img src={block.src} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
            <span className={`relative flex items-center gap-2 rounded-full px-3 py-1.5 ${block.src ? "bg-white/90" : ""}`}>
              {uploading ? <span className="size-4 animate-spin rounded-full border-2 border-[#1a1a1a]/20 border-t-[#1a1a1a]" /> : null}
              {uploading ? "מעלים את התמונה…" : block.src ? "החלפת תמונה" : "העלאת תמונה"}
            </span>
          </button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void upload(next); event.target.value = ""; }} />
          <label className="text-sm">טקסט חלופי
            <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value.slice(0, 120) })} className={popupFieldClass} />
          </label>
          <label className="text-sm">רוחב {block.width}%
            <input type="range" min={30} max={100} value={block.width} onChange={(event) => onChange({ ...block, width: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="text-sm">עיגול הפינות {block.radius}
            <input type="range" min={0} max={40} value={block.radius} onChange={(event) => onChange({ ...block, radius: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <Fold title="איך התמונה נכנסת" summary={block.fit === "contain" ? "שלמה" : "ממלאת"} open={fold === "fit"} onToggle={() => toggle("fit")}>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" data-on={block.fit !== "contain"} onClick={() => onChange({ ...block, fit: "cover" })} className="rounded-2xl border-0 bg-white p-2.5 text-start shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">
                <span className="mb-2 grid h-8 place-items-center overflow-hidden rounded-md bg-current/10">
                  <span className="h-10 w-full bg-current opacity-80" />
                </span>
                <b className="block text-sm">ממלאת</b>
                <span className="mt-0.5 block text-[11px] leading-4 opacity-70">תופסת את כל המקום, מה שלא נכנס נחתך</span>
              </button>
              <button type="button" data-on={block.fit === "contain"} onClick={() => onChange({ ...block, fit: "contain" })} className="rounded-2xl border-0 bg-white p-2.5 text-start shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">
                <span className="mb-2 grid h-8 place-items-center overflow-hidden rounded-md bg-current/10">
                  <span className="h-5 w-8 rounded-sm bg-current opacity-80" />
                </span>
                <b className="block text-sm">שלמה</b>
                <span className="mt-0.5 block text-[11px] leading-4 opacity-70">רואים את כל התמונה, בלי חיתוך</span>
              </button>
            </div>
          </Fold>
          {block.fit !== "contain" ? (
            <>
              <label className="text-sm">גובה {block.frame > 0 ? block.frame : "טבעי"}
                <input type="range" min={0} max={480} step={10} value={block.frame || 0} onChange={(event) => onChange({ ...block, frame: Number(event.target.value) })} className="mt-1 w-full" />
              </label>
              <Fold title="איזה חלק נשאר גלוי" summary={block.focus === "top" ? "למעלה" : block.focus === "bottom" ? "למטה" : "מרכז"} open={fold === "focus"} onToggle={() => toggle("focus")}>
                <div className="flex flex-col gap-0.5">
                  {(["top", "center", "bottom"] as const).map((focus) => (
                    <MenuRow key={focus} on={(block.focus || "center") === focus} onClick={() => onChange({ ...block, focus })}>{focus === "top" ? "למעלה" : focus === "bottom" ? "למטה" : "מרכז"}</MenuRow>
                  ))}
                </div>
              </Fold>
            </>
          ) : null}
          <button type="button" data-on={block.bleed === true} onClick={() => onChange({ ...block, bleed: !block.bleed })} className="rounded-2xl border-0 bg-[#f6f6f6] px-3 py-2.5 text-start data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">
            <b className="block text-sm">בלי רווח מהשוליים</b>
            <span className="mt-0.5 block text-[11px] leading-4 opacity-70">{block.bleed ? "התמונה נוגעת בקצוות הפופאפ" : "נשאר רווח מסביב לתמונה"}</span>
          </button>
          <label className="text-sm">דהייה למטה {block.fade || 0}
            <input type="range" min={0} max={80} step={5} value={block.fade || 0} onChange={(event) => onChange({ ...block, fade: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="text-sm">דהייה מהצד {block.fadeSide || 0}
            <input type="range" min={0} max={80} step={5} value={block.fadeSide || 0} onChange={(event) => onChange({ ...block, fadeSide: Number(event.target.value) })} className="mt-1 w-full" />
          </label>
          <p className="m-0 text-xs leading-5 text-[#616161]">למטה ממיס את תחתית התמונה. מהצד ממיס את הקצה שפונה לתוכן, שניהם לצבע הרקע.</p>
        </>
      ) : null}
      {block.type === "button" ? (
        <>
          <label className="text-sm">טקסט
            <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value.slice(0, 40) })} className={popupFieldClass} />
          </label>
          <div className="text-sm font-semibold">מה הכפתור עושה</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" data-on={block.action !== "submit"} onClick={() => onChange({ ...block, action: "link" })} className="h-9 rounded-full border-0 bg-[#f6f6f6] text-xs font-semibold data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">קישור</button>
            <button type="button" data-on={block.action === "submit"} onClick={() => onChange({ ...block, action: "submit" })} className="h-9 rounded-full border-0 bg-[#f6f6f6] text-xs font-semibold data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">שליחת הטופס</button>
          </div>
          {block.action === "submit" ? (
            <p className="m-0 text-xs leading-5 text-[#616161]">הלחיצה שולחת את השדות. עם אימייל והסכמה מסומנת הלקוח נרשם לניוזלטר, ואז נפתח המסך שאחרי השליחה עם קוד ההנחה. את הקוד ואת הטקסט קובעים בחלון, תחת «עוד».</p>
          ) : (
            <label className="text-sm">קישור
              <input value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value.slice(0, 300) })} placeholder="/products או https://" className={popupFieldClass} />
            </label>
          )}
          <ColorField label="רקע" value={block.background} onChange={(background) => onChange({ ...block, background })} />
          <ColorField label="טקסט" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <label className="text-sm">
            <span className="flex items-center justify-between">
              <span>עיגול</span>
              <span aria-hidden className="inline-block h-7 w-14 border-2 border-current bg-[#f6f5f3]" style={{ borderRadius: block.radius >= 28 ? 999 : block.radius }} />
            </span>
            <input aria-label="עיגול הכפתור" type="range" min={0} max={28} value={block.radius === 999 ? 28 : block.radius} onChange={(event) => onChange({ ...block, radius: Number(event.target.value) >= 28 ? 999 : Number(event.target.value) })} className="mt-1.5 block w-full" />
          </label>
        </>
      ) : null}
      {block.type === "field" ? <FieldEditor block={block} blocks={blocks} onChange={onChange} fold={fold} onToggle={toggle} /> : null}
      {block.type === "spacer" ? (
        <label className="text-sm">גובה
          <input type="number" min={4} max={80} value={block.height} onChange={(event) => onChange({ ...block, height: Number(event.target.value) })} className={popupFieldClass} />
        </label>
      ) : null}
    </div>
  );
}

function FieldEditor({ block, blocks, onChange, fold, onToggle }: { block: Extract<PopupBlock, { type: "field" }>; blocks: PopupBlock[]; onChange: (next: PopupBlock) => void; fold: string | null; onToggle: (key: string) => void }) {
  const preset = fieldPreset(block);
  const check = preset === "check";
  function choose(nextPreset: FieldPreset) {
    const fresh = blankField(nextPreset, blocks.filter((item) => item.id !== block.id));
    const keepText = nextPreset === preset && (nextPreset === "custom" || nextPreset === "check");
    onChange({
      ...block,
      fieldType: fresh.fieldType,
      label: keepText ? block.label : fresh.label,
      placeholder: keepText ? block.placeholder : fresh.placeholder,
      name: fresh.name,
      required: nextPreset === "check" ? (preset === "check" ? block.required : false) : nextPreset === "custom" ? block.required : true,
    });
  }
  return (
    <>
      <Fold title="סוג השדה" summary={FIELD_PRESET_LABELS[preset]} open={fold === "kind"} onToggle={() => onToggle("kind")}>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(FIELD_PRESET_LABELS) as FieldPreset[]).map((item) => (
            <button key={item} type="button" data-on={preset === item} onClick={() => choose(item)} className="flex items-center gap-2 rounded-xl border-0 bg-white px-2 py-2 text-start text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.05)] data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white data-[on=true]:shadow-none">
              <Glyph d={ADD_GLYPHS[item]} />
              {FIELD_PRESET_LABELS[item]}
            </button>
          ))}
        </div>
      </Fold>
      <label className="text-sm">{check ? "הטקסט ליד התיבה" : preset === "custom" ? "השאלה מעל השדה" : "הכיתוב מעל השדה"}
        <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value.slice(0, 60) })} className={popupFieldClass} />
      </label>
      {check ? null : (
        <label className="text-sm">טקסט לדוגמה בתוך השדה
          <input value={block.placeholder} onChange={(event) => onChange({ ...block, placeholder: event.target.value.slice(0, 80) })} className={popupFieldClass} />
        </label>
      )}
      {preset === "custom" ? (
        <label className="text-sm">שם פנימי באנגלית, ככה זה נשמר בלידים
          <input value={block.name} onChange={(event) => onChange({ ...block, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} className={popupFieldClass} />
        </label>
      ) : null}
      <Fold title={check ? "האם חייבים לסמן?" : "האם חייבים למלא?"} summary={block.required ? "חובה" : "לא חובה"} open={fold === "required"} onToggle={() => onToggle("required")}>
        <div className="flex flex-col gap-0.5">
          <MenuRow on={block.required} onClick={() => onChange({ ...block, required: true })}>חובה</MenuRow>
          <MenuRow on={!block.required} onClick={() => onChange({ ...block, required: false })}>לא חובה</MenuRow>
        </div>
        <p className="m-0 mt-1.5 px-1 text-xs leading-5 text-[#616161]">{check
          ? (block.required ? "אי אפשר לשלוח את הטופס בלי לסמן את התיבה." : "אפשר לשלוח גם בלי לסמן.")
          : (block.required ? "אי אפשר לשלוח בלי למלא את השדה." : "אפשר לשלוח גם בלי למלא.")}</p>
      </Fold>
    </>
  );
}

function blockTitle(block: PopupBlock) {
  if (block.type === "field") return FIELD_PRESET_LABELS[fieldPreset(block)];
  return popupBlockLabel(block.type);
}

function blockHint(block: PopupBlock) {
  if (block.type === "heading" || block.type === "text") return block.text.replace(/\*\*/g, "") || "בלי טקסט";
  if (block.type === "image") return block.src ? "יש תמונה" : "עדיין בלי תמונה";
  if (block.type === "button") return block.label;
  if (block.type === "logo") return "הלוגו של החנות";
  if (block.type === "field") return block.label || "בלי כיתוב";
  if (block.type === "row" || block.type === "columns") return `${block.columns.length} אזורים זה לצד זה`;
  if (block.type === "badge") return block.text;
  if (block.type === "container" || block.type === "stack" || block.type === "overlay" || block.type === "divider" || block.type === "icon" || block.type === "shape") return popupBlockLabel(block.type);
  return "רווח";
}
