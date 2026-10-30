"use client";

import type { CSSProperties, DragEvent } from "react";
import { PopupBlockView } from "@/components/marketing/popup-view";
import { columnGrid, popupHasFields, popupLook, type PopupClosePlace, type PopupDesign } from "@/lib/marketing/popups";

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
}: {
  design: PopupDesign;
  device?: "desktop" | "mobile";
  logoUrl?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, index: number) => void;
  onMoveColumn?: (id: string, index: number) => void;
  onResizeColumn?: (id: string, width: number) => void;
}) {
  const look = popupLook(design, device);
  const hasFields = popupHasFields(design.blocks);
  const hasRow = design.blocks.some((block) => block.type === "row");
  const split = !hasRow && look.media !== "none" && !look.stackMedia && look.layout !== "bar";
  function dropBlock(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("text/plain");
    if (id && !id.startsWith("column:")) onMove?.(id, index);
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
    maxHeight: "100%",
    overflow: "hidden",
    background: design.background,
    backgroundImage: design.backgroundImage ? `url("${design.backgroundImage}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: look.layout === "bar" ? `${look.radius}px ${look.radius}px 0 0` : look.radius,
    boxShadow: "0 18px 50px rgba(20,16,14,.22)",
    color: "#1a1a1a",
  };
  const media = !hasRow && look.media !== "none" ? (
    look.mediaImage ? <img src={look.mediaImage} alt="" style={{ width: split ? "42%" : "100%", flex: split ? "0 0 42%" : "none", height: split ? "auto" : 150, minHeight: split ? 220 : 150, objectFit: "cover" }} /> : <div style={{ width: split ? "42%" : "100%", flex: split ? "0 0 42%" : "none", minHeight: split ? 220 : 120, display: "grid", placeItems: "center", padding: 16, color: "#8a8a8a", fontSize: 13, textAlign: "center" }}>אזור לטקסט, תמונה או כל דבר אחר</div>
  ) : null;
  const stage = (
    <>
      <div className="pointer-events-none absolute inset-x-6 top-6 flex flex-col gap-3 opacity-60">
        <div className="h-3 w-24 rounded-full bg-white" />
        <div className="h-16 rounded-2xl bg-white" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 rounded-2xl bg-white" />
          <div className="h-14 rounded-2xl bg-white" />
        </div>
      </div>
      {look.layout === "modal" ? <div className="absolute inset-0" style={{ background: `rgba(20,16,14,${design.overlay / 100})` }} /> : null}
      <div className={`relative flex h-full ${frame}`}>
        <div style={cardStyle}>
          <span aria-hidden style={{ ...closeStyle(design.closePlace, design.closeSize, design.closeColor), zIndex: 2 }}>×</span>
          {look.media === "right" || look.stackMedia ? media : null}
          <div style={{ flex: 1, minWidth: 0, padding: look.padding, display: "grid", gridTemplateColumns: "1fr 1fr", gap: look.gap, alignContent: "center" }}>
            {design.blocks.map((block, index) => block.type === "row" ? (
              <div key={block.id} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: columnGrid(block.columns, look.stackColumns), gap: look.gap }}>
                {block.columns.map((column, columnIndex) => (
                  <div
                    key={column.id}
                    onClick={() => onSelect?.(column.id)}
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const id = event.dataTransfer.getData("text/plain");
                      if (id.startsWith("column:")) onMoveColumn?.(id.slice("column:".length), columnIndex);
                    }}
                    style={{ minHeight: 88, borderRadius: 12, padding: 8, outline: selectedId === column.id ? "2px solid #1a1a1a" : "1px dashed rgba(0,0,0,.2)", outlineOffset: -1 }}
                  >
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
                      className="mb-1 grid h-5 w-7 cursor-grab place-items-center rounded-md border-0 bg-black/5 text-[11px] text-[#616161] active:cursor-grabbing"
                    >
                      ⋮⋮
                    </button>
                    {column.blocks.length === 0 ? <span className="grid h-16 place-items-center text-xs text-[#8a8a8a]">אזור ריק</span> : column.blocks.map((child) => (
                      <button key={child.id} type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(child.id); }} className="mb-2 block w-full rounded-xl border-0 bg-transparent p-0.5 text-start" style={{ outline: selectedId === child.id ? "2px solid #1a1a1a" : "2px solid transparent", outlineOffset: 2 }}>
                        <PopupBlockView block={child} device={device} logoUrl={logoUrl} stack={look.stackColumns} />
                      </button>
                    ))}
                    {selectedId === column.id && onResizeColumn && !look.stackColumns ? (
                      <label className="mt-2 block text-[11px] font-semibold text-[#616161]" onClick={(event) => event.stopPropagation()}>
                        <span className="mb-1 flex justify-between"><span>רוחב</span><span>{column.width}%</span></span>
                        <input type="range" min={15} max={100 - 15 * (block.columns.length - 1)} value={column.width} onChange={(event) => onResizeColumn(column.id, Number(event.target.value))} className="w-full" />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <button
                key={block.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", block.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropBlock(event, index)}
                onClick={() => onSelect?.(block.id)}
                className="cursor-grab rounded-xl border-0 bg-transparent p-0.5 text-start active:cursor-grabbing"
                style={{ gridColumn: !look.stackColumns && block.span === "half" ? "span 1" : "1 / -1", outline: selectedId === block.id ? "2px solid #1a1a1a" : "2px solid transparent", outlineOffset: 2 }}
              >
                <PopupBlockView block={block} device={device} logoUrl={logoUrl} stack={look.stackColumns} />
              </button>
            ))}
            {hasFields ? (
              <span className="grid h-11 place-items-center text-sm font-bold" style={{ gridColumn: "1 / -1", background: design.submitBackground, color: design.submitColor, borderRadius: 999 }}>{design.submitLabel}</span>
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

