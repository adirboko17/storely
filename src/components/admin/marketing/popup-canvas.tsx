"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { PopupBackdrop, PopupBlockView } from "@/components/marketing/popup-view";
import { blockOnDevice, columnGrid, FIELD_PRESET_LABELS, fieldPreset, popupBlockLabel, popupLook, type PopupBlock, type PopupClosePlace, type PopupDesign, type PopupMotion } from "@/lib/marketing/popups";

const POPUP_MOTION_CSS = `
@keyframes storely-rise-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes storely-rise-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(12px); } }
@keyframes storely-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes storely-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes storely-scale-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes storely-scale-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(.98); } }
@keyframes storely-slide-in { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes storely-slide-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(22px); } }
@keyframes storely-bloom-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes storely-bloom-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { [data-popup-move] { animation: none !important; } }
`;

function motionAnimation(motion: PopupMotion, phase: "in" | "out") {
  const time = phase === "in" ? ".56s cubic-bezier(.22,1,.36,1)" : ".42s cubic-bezier(.4,0,.2,1)";
  return `storely-${motion}-${phase} ${time} both`;
}

function closeStyle(place: PopupClosePlace, size: number, color: string): CSSProperties {
  const edge = 8;
  const box = size + 10;
  const corner = place === "top-right"
    ? { top: edge, right: edge }
    : place === "bottom-left"
      ? { bottom: edge, left: edge }
      : place === "bottom-right"
        ? { bottom: edge, right: edge }
        : { top: edge, left: edge };
  return { position: "absolute", width: box, height: box, display: "grid", placeItems: "center", color, fontSize: size, lineHeight: 1, ...corner };
}

export function PopupCanvas({
  design,
  device = "desktop",
  logoUrl = "",
  selectedId = "",
  onSelect,
  onMove,
  onMoveColumn,
  onResizeColumn,
  onInsert,
  onMoveInto,
  onFillSlot,
  onAddBeside,
  onAddAt,
  onAddInColumn,
  onRemove,
  preview = false,
  motionPlay = { id: 0, kind: "in" as const },
}: {
  design: PopupDesign;
  device?: "desktop" | "mobile";
  logoUrl?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, index: number) => void;
  onMoveColumn?: (id: string, index: number) => void;
  onResizeColumn?: (id: string, width: number) => void;
  onInsert?: (token: string, index: number, columnId?: string) => void;
  onMoveInto?: (id: string, columnId: string, index: number) => void;
  onFillSlot?: (source: string, index: number) => void;
  onAddBeside?: (index: number) => void;
  onAddAt?: (index: number) => void;
  onAddInColumn?: (columnId: string) => void;
  onRemove?: (id: string) => void;
  preview?: boolean;
  motionPlay?: { id: number; kind: "in" | "both" };
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<number | null>(null);
  const [columnMark, setColumnMark] = useState<{ columnId: string; index: number } | null>(null);
  const [phase, setPhase] = useState<"still" | "in" | "out">("still");
  const look = popupLook(design, device);
  useEffect(() => {
    if (!motionPlay.id || look.motion === "none") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancel = false;
    let first = 0;
    let second = 0;
    if (motionPlay.kind === "both") {
      setPhase("out");
      first = window.setTimeout(() => { if (!cancel) setPhase("in"); }, 460);
      second = window.setTimeout(() => { if (!cancel) setPhase("still"); }, 1080);
    } else {
      setPhase("in");
      second = window.setTimeout(() => { if (!cancel) setPhase("still"); }, 620);
    }
    return () => {
      cancel = true;
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [motionPlay.id, motionPlay.kind, look.motion]);
  const hasRow = design.blocks.some((block) => block.type === "row");
  const split = !hasRow && look.media !== "none" && !look.stackMedia && look.layout !== "bar";
  function dropBlock(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setLine(null);
    const id = event.dataTransfer.getData("text/plain");
    if (id.startsWith("add:")) {
      onInsert?.(id, index);
      return;
    }
    if (id && !id.startsWith("column:")) onMove?.(id, index);
  }
  function landing(event: DragEvent<HTMLElement>, index: number) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }
  function showLine(event: DragEvent<HTMLElement>) {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const edge = event.clientY > rect.top + rect.height / 2 ? rect.bottom : rect.top;
    setLine(edge - gridRect.top + grid.scrollTop);
  }
  const frame = look.layout === "bar"
    ? "items-end justify-center"
    : look.layout === "corner"
      ? "items-end justify-start p-4"
      : "items-center justify-center px-4";
  const cardStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: look.stackMedia ? "column" : "row",
    width: look.layout === "bar" ? "100%" : `min(${look.width}px, 100%)`,
    height: look.height > 0 ? look.height : undefined,
    maxHeight: "100%",
    overflow: "hidden",
    background: look.background,
    borderRadius: look.layout === "bar" ? `${look.radius}px ${look.radius}px 0 0` : look.radius,
    boxShadow: "0 18px 50px rgba(20,16,14,.22)",
    color: "#1a1a1a",
    animation: phase === "still" || look.motion === "none" ? undefined : motionAnimation(look.motion, phase),
  };
  const media = !hasRow && look.media !== "none" ? (
    look.mediaImage ? <img src={look.mediaImage} alt="" style={{ width: split ? "42%" : "100%", flex: split ? "0 0 42%" : "none", height: split ? "auto" : 150, minHeight: split ? 220 : 150, objectFit: "cover" }} /> : <div style={{ width: split ? "42%" : "100%", flex: split ? "0 0 42%" : "none", minHeight: split ? 220 : 120, display: "grid", placeItems: "center", padding: 16, color: "#8a8a8a", fontSize: 13, textAlign: "center" }}>אזור לטקסט, תמונה או כל דבר אחר</div>
  ) : null;
  const first = design.blocks[0] ? blockOnDevice(design.blocks[0], device) : null;
  const sideBleed = first?.type === "row" && first.columns.some((column, columnIndex) => isPosterColumn(column, columnIndex, first.columns.length, look.stackColumns));
  function homeColumn(columns: { id: string; blocks: PopupBlock[] }[]) {
    return columns.find((column, columnIndex) => !isPosterColumn(column, columnIndex, columns.length, look.stackColumns));
  }
  const stage = (
    <>
      <style>{POPUP_MOTION_CSS}</style>
      <div className="pointer-events-none absolute inset-x-6 top-6 flex flex-col gap-3 opacity-60">
        <div className="h-3 w-24 rounded-full bg-white" />
        <div className="h-16 rounded-2xl bg-white" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 rounded-2xl bg-white" />
          <div className="h-14 rounded-2xl bg-white" />
        </div>
      </div>
      {look.layout === "modal" ? <div data-popup-move className="absolute inset-0" style={{ background: `rgba(20,16,14,${look.overlay / 100})`, animation: phase === "still" || look.motion === "none" ? undefined : motionAnimation("fade", phase) }} /> : null}
      <div className={`relative flex h-full ${frame}`}>
        <div data-popup-move style={cardStyle}>
          <PopupBackdrop image={look.backgroundImage} fade={look.imageFade} wash={look.imageWash} washOpacity={look.imageWashOpacity} />
          <span aria-hidden style={{ ...closeStyle(look.closePlace, look.closeSize, look.closeColor), zIndex: 2 }}>×</span>
          {look.media === "right" || look.stackMedia ? media : null}
          <div
            ref={gridRef}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setLine(null);
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData("text/plain");
              const home = sideBleed && first?.type === "row" ? homeColumn(first.columns) : null;
              if (home && id.startsWith("add:")) onInsert?.(id, home.blocks.length, home.id);
              else if (home && id && !id.startsWith("column:")) onMoveInto?.(id, home.id, home.blocks.length);
              else if (id.startsWith("add:")) onInsert?.(id, design.blocks.length);
              setLine(null);
            }}
            style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, minHeight: 0, overflow: look.height > 0 ? "auto" : undefined, padding: look.padding, display: "grid", gridTemplateColumns: "1fr 1fr", gap: look.gap, alignContent: (first?.type === "image" && first.bleed) || sideBleed ? "start" : "center" }}
          >
            {!preview && line != null ? (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 z-30 flex items-center" style={{ top: line, transform: "translateY(-50%)" }}>
                <span className="h-1 flex-1 rounded-full bg-[#1a1a1a]" />
                <span className="mx-1 rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-bold text-white">כאן</span>
                <span className="h-1 flex-1 rounded-full bg-[#1a1a1a]" />
              </span>
            ) : null}
            {canvasCells(design.blocks, device, look.stackColumns).map((cell) => {
              if (cell.kind === "slot") {
                if (preview) return null;
                return <BesideSlot key={cell.key} onArm={() => setLine(null)} onFill={(source) => onFillSlot?.(source, cell.index)} onAdd={() => onAddBeside?.(cell.index)} />;
              }
              const { block, index } = cell;
              return block.type === "row" ? (
              <div
                key={block.id}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!preview) showLine(event); }}
                onDrop={(event) => {
                  const parked = block.columns.some((entry, entryIndex) => isPosterColumn(entry, entryIndex, block.columns.length, look.stackColumns));
                  const home = parked ? homeColumn(block.columns) : null;
                  if (home) {
                    event.preventDefault();
                    event.stopPropagation();
                    const id = event.dataTransfer.getData("text/plain");
                    setLine(null);
                    if (id.startsWith("add:")) onInsert?.(id, home.blocks.length, home.id);
                    else if (id && !id.startsWith("column:")) onMoveInto?.(id, home.id, home.blocks.length);
                    return;
                  }
                  dropBlock(event, landing(event, index));
                }}
                style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: columnGrid(block.columns, look.stackColumns), gap: look.gap }}
              >
                {block.columns.map((column, columnIndex) => {
                  const across = look.stackColumns || block.columns.length < 2;
                  const poster = isPosterColumn(column, columnIndex, block.columns.length, across);
                  const home = homeColumn(block.columns);
                  const bleedStart = column.blocks.some((child) => child.type === "image" && child.bleed) && (across || columnIndex === 0);
                  const bleedEnd = column.blocks.some((child) => child.type === "image" && child.bleed) && (across || columnIndex === block.columns.length - 1);
                  const bleedTop = index === 0 && column.blocks[0]?.type === "image" && column.blocks[0].bleed;
                  const photo = poster && column.blocks[0]?.type === "image" ? column.blocks[0] : null;
                  return (
                  <div
                    key={column.id}
                    onClick={() => onSelect?.(column.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setLine(null);
                      setColumnMark({ columnId: column.id, index: column.blocks.length });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const id = event.dataTransfer.getData("text/plain");
                      const target = poster && home ? home : column;
                      setColumnMark(null);
                      if (id.startsWith("add:")) onInsert?.(id, target.blocks.length, target.id);
                      else if (id.startsWith("column:")) onMoveColumn?.(id.slice("column:".length), columnIndex);
                      else if (id) onMoveInto?.(id, target.id, target.blocks.length);
                    }}
                    style={{ position: "relative", alignSelf: "stretch", minHeight: photo ? Math.max(photo.frame, 160) : 88, borderRadius: preview || poster || bleedStart || bleedEnd ? 0 : 12, paddingTop: preview || poster || bleedTop ? 0 : 8, paddingBottom: preview || poster ? 0 : 8, paddingInlineStart: preview || poster || bleedStart ? 0 : 8, paddingInlineEnd: preview || poster || bleedEnd ? 0 : 8, outline: preview || poster ? "none" : columnMark?.columnId === column.id || selectedId === column.id ? "2px solid #1a1a1a" : "1px dashed rgba(0,0,0,.28)", outlineOffset: -1, background: !preview && columnMark?.columnId === column.id ? "rgba(255,255,255,.45)" : undefined }}
                  >
                    {preview ? null : (
                    <button
                      type="button"
                      draggable
                      aria-label="גרירה להחלפת אזור"
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData("text/plain", `column:${column.id}`);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className={`${bleedTop || poster ? "absolute start-1 top-1 z-20" : "mb-1"} grid h-5 w-7 cursor-grab place-items-center rounded-md border-0 bg-white/80 text-[11px] text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.06)] active:cursor-grabbing`}
                    >
                      ⋮⋮
                    </button>
                    )}
                    {!preview && column.blocks.length === 0 ? <span className="grid h-16 place-items-center text-center text-xs font-semibold text-[#6f6a66]">גרור או הוסף לכאן</span> : column.blocks.map((child, childIndex) => {
                      const filling = poster && childIndex === 0;
                      const edges = { start: across || columnIndex === 0, end: across || columnIndex === block.columns.length - 1 };
                      return (
                      <div key={child.id}>
                        {!preview && !poster && columnMark?.columnId === column.id && columnMark.index === childIndex ? <ColumnHere /> : null}
                        <BlockHit
                          block={child}
                          quiet={preview}
                          frame={filling ? { position: "absolute", top: index === 0 ? -look.padding : 0, bottom: -look.padding, insetInlineStart: edges.start ? -look.padding : 0, insetInlineEnd: edges.end ? -look.padding : 0, zIndex: 1 } : undefined}
                          selected={selectedId === child.id}
                          className="mb-2"
                          style={!filling && poster ? { position: "relative", zIndex: 2 } : undefined}
                          onEdit={() => onSelect?.(child.id)}
                          onRemove={onRemove ? () => onRemove(child.id) : undefined}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.setData("text/plain", child.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setColumnMark(null)}
                          onDragOver={(event) => {
                            if (poster) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setLine(null);
                            const rect = event.currentTarget.getBoundingClientRect();
                            setColumnMark({ columnId: column.id, index: event.clientY > rect.top + rect.height / 2 ? childIndex + 1 : childIndex });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const id = event.dataTransfer.getData("text/plain");
                            const rect = event.currentTarget.getBoundingClientRect();
                            const at = event.clientY > rect.top + rect.height / 2 ? childIndex + 1 : childIndex;
                            const target = poster && home ? home.id : column.id;
                            const place = poster && home ? home.blocks.length : at;
                            setColumnMark(null);
                            if (id.startsWith("add:")) onInsert?.(id, place, target);
                            else if (id && !id.startsWith("column:")) onMoveInto?.(id, target, place);
                          }}
                        >
                          <PopupBlockView block={child} device={device} logoUrl={logoUrl} stack={look.stackColumns} pad={look.padding} flushTop={index === 0 && childIndex === 0} edges={edges} fill={filling} surface={look.background} />
                        </BlockHit>
                      </div>
                      );
                    })}
                    {!preview && !poster && columnMark?.columnId === column.id && columnMark.index === column.blocks.length ? <ColumnHere /> : null}
                    {!preview && !poster && block.columns.some((entry, entryIndex) => isPosterColumn(entry, entryIndex, block.columns.length, across)) ? (
                      <div className="mt-3">
                        <EndSlot onAdd={() => onAddInColumn?.(column.id)} onOver={() => setLine(null)} onDropSource={(source) => {
                          setLine(null);
                          if (source.startsWith("add:")) onInsert?.(source, column.blocks.length, column.id);
                          else if (!source.startsWith("column:")) onMoveInto?.(source, column.id, column.blocks.length);
                        }} />
                      </div>
                    ) : null}
                    {!preview && selectedId === column.id && onResizeColumn && !look.stackColumns ? (
                      <label className="mt-2 block text-[11px] font-semibold text-[#616161]" onClick={(event) => event.stopPropagation()}>
                        <span className="mb-1 flex justify-between"><span>רוחב</span><span>{column.width}%</span></span>
                        <input type="range" min={15} max={100 - 15 * (block.columns.length - 1)} value={column.width} onChange={(event) => onResizeColumn(column.id, Number(event.target.value))} className="w-full" />
                      </label>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : (
              <BlockHit
                key={block.id}
                block={block}
                selected={selectedId === block.id}
                style={{ gridColumn: !look.stackColumns && block.span === "half" ? "span 1" : "1 / -1" }}
                onEdit={() => onSelect?.(block.id)}
                onRemove={onRemove ? () => onRemove(block.id) : undefined}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", block.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setLine(null)}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); showLine(event); }}
                onDrop={(event) => dropBlock(event, landing(event, index))}
              >
                <PopupBlockView block={block} device={device} logoUrl={logoUrl} stack={look.stackColumns} pad={look.padding} flushTop={index === 0} surface={look.background} />
              </BlockHit>
            );
            })}
            {!preview && !sideBleed ? (
            <EndSlot
              onAdd={() => onAddAt?.(design.blocks.length)}
              onOver={() => setLine(null)}
              onDropSource={(source) => {
                setLine(null);
                if (source.startsWith("add:")) onInsert?.(source, design.blocks.length);
                else if (!source.startsWith("column:")) onMove?.(source, design.blocks.length);
              }}
            />
            ) : null}
          </div>
          {look.media === "left" && !look.stackMedia ? media : null}
        </div>
      </div>
    </>
  );

  if (device === "mobile") {
    return (
      <div className="grid h-[min(720px,calc(100dvh-160px))] place-items-center rounded-[18px] bg-[#ece7e2]">
        <div className="relative h-[min(640px,100%)] w-[330px] overflow-hidden rounded-[36px] border-8 border-[#1a1a1a] bg-[#e7e1db] shadow-[0_18px_40px_rgba(0,0,0,.16)]">
          <div className="absolute left-1/2 top-1.5 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-[#1a1a1a]" />
          {stage}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[min(720px,calc(100dvh-160px))] overflow-hidden rounded-[18px] bg-[#e7e1db] shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]">
      {stage}
    </div>
  );
}

function isPosterColumn(column: { blocks: PopupBlock[] }, columnIndex: number, count: number, across: boolean) {
  if (across || count < 2) return false;
  const first = column.blocks[0];
  return (columnIndex === 0 || columnIndex === count - 1) && first?.type === "image" && first.bleed;
}

function canvasCells(blocks: PopupBlock[], device: "desktop" | "mobile", stack: boolean) {
  const cells: Array<{ kind: "block"; block: PopupBlock; index: number } | { kind: "slot"; index: number; key: string }> = [];
  let waiting = false;
  blocks.forEach((raw, index) => {
    const block = blockOnDevice(raw, device);
    const half = !stack && block.type !== "row" && block.span === "half";
    if (!half && waiting) {
      cells.push({ kind: "slot", index, key: `slot-${index}` });
      waiting = false;
    }
    cells.push({ kind: "block", block, index });
    if (half) waiting = !waiting;
  });
  if (waiting) cells.push({ kind: "slot", index: blocks.length, key: "slot-end" });
  return cells;
}

function ColumnHere() {
  return (
    <span className="pointer-events-none my-1 flex items-center">
      <span className="h-1 flex-1 rounded-full bg-[#1a1a1a]" />
      <span className="mx-1 rounded-full bg-[#1a1a1a] px-1.5 text-[10px] font-bold leading-4 text-white">כאן</span>
      <span className="h-1 flex-1 rounded-full bg-[#1a1a1a]" />
    </span>
  );
}

function EndSlot({ onAdd, onOver, onDropSource }: { onAdd: () => void; onOver: () => void; onDropSource: (source: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(true); onOver(); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const source = event.dataTransfer.getData("text/plain");
        if (source) onDropSource(source);
      }}
      onClick={(event) => { event.stopPropagation(); onAdd(); }}
      className="grid min-h-20 w-full place-items-center rounded-2xl border border-dashed px-3 text-center text-xs font-semibold leading-5"
      style={{ gridColumn: "1 / -1", borderColor: over ? "#1a1a1a" : "rgba(26,26,26,.35)", background: over ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.28)", color: over ? "#1a1a1a" : "#6f6a66" }}
    >
      גרור או הוסף לכאן
    </button>
  );
}

function BesideSlot({ onFill, onAdd, onArm }: { onFill: (source: string) => void; onAdd: () => void; onArm?: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(true); onArm?.(); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const source = event.dataTransfer.getData("text/plain");
        if (source && !source.startsWith("column:")) onFill(source);
      }}
      onClick={(event) => { event.stopPropagation(); onAdd(); }}
      className="grid h-full min-h-24 place-items-center rounded-2xl border border-dashed px-3 text-center text-xs font-semibold leading-5"
      style={{ gridColumn: "span 1", borderColor: over ? "#1a1a1a" : "rgba(26,26,26,.35)", background: over ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.28)", color: over ? "#1a1a1a" : "#6f6a66" }}
    >
      גרור או הוסף לכאן
    </button>
  );
}

function blockName(block: PopupBlock) {
  if (block.type === "field") return FIELD_PRESET_LABELS[fieldPreset(block)];
  return popupBlockLabel(block.type);
}

function BlockHit({
  block,
  selected,
  className,
  style,
  onEdit,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  quiet,
  frame,
  children,
}: {
  block: PopupBlock;
  selected: boolean;
  className?: string;
  style?: CSSProperties;
  quiet?: boolean;
  frame?: CSSProperties;
  onEdit: () => void;
  onRemove?: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const image = block.type === "image";
  if (quiet) return <div style={frame ?? style}>{children}</div>;
  return (
    <div className={frame ? "group absolute" : `group relative ${className ?? ""}`} style={frame ?? style}>
      <button
        type="button"
        draggable={Boolean(onDragStart)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={(event) => { event.stopPropagation(); onEdit(); }}
        className={frame ? "absolute inset-0 cursor-pointer rounded-none border-0 bg-transparent p-0 text-start focus:outline-none" : "block w-full cursor-pointer rounded-none border-0 bg-transparent p-0 text-start focus:outline-none"}
      >
        {children}
      </button>
      {image ? null : (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg opacity-0 shadow-[inset_0_0_0_1px_rgba(26,26,26,.55)] transition group-hover:opacity-100" style={selected ? { opacity: 1 } : undefined} />
      )}
      <div className={`absolute left-1.5 top-1.5 z-20 transition ${selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"}`}>
        <div className="flex items-center gap-0.5 rounded-full bg-white/95 py-0.5 pe-0.5 ps-2.5 text-[#1a1a1a] shadow-[0_8px_22px_rgba(20,16,14,.16),0_0_0_1px_rgba(0,0,0,.06)] backdrop-blur-sm" onMouseDown={(event) => event.stopPropagation()}>
          <span className="max-w-24 truncate text-[11px] font-semibold">{blockName(block)}</span>
          <button type="button" aria-label="עריכה" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="grid size-6 place-items-center rounded-full text-[#1a1a1a] hover:bg-black/5">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13.2 3.4l3.4 3.4L7.2 16.2H3.8v-3.4z" /></svg>
          </button>
          {onRemove ? (
            <button type="button" aria-label="מחיקה" onClick={(event) => { event.stopPropagation(); onRemove(); }} className="grid size-6 place-items-center rounded-full text-[#8a1f11] hover:bg-[#f8ece9]">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

