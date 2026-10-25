"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

export type ImageFrame = { x: number; y: number; scale: number };

export function placeImage(frameW: number, frameH: number, natW: number, natH: number, x: number, y: number, scale: number) {
  if (!frameW || !frameH || !natW || !natH) return null;
  const cover = Math.max(frameW / natW, frameH / natH);
  const contain = Math.min(frameW / natW, frameH / natH);
  const min = contain / cover;
  const zoom = Math.min(3, Math.max(min, scale));
  const width = natW * cover * zoom;
  const height = natH * cover * zoom;
  const left = clampOffset(frameW / 2 - (x / 100) * width, frameW, width);
  const top = clampOffset(frameH / 2 - (y / 100) * height, frameH, height);
  return { width, height, left, top, zoom, min };
}

function clampOffset(offset: number, frame: number, size: number) {
  if (size >= frame) return Math.min(0, Math.max(frame - size, offset));
  return Math.min(Math.max(0, frame - size), Math.max(0, offset));
}

function CroppedPicture({ src, frame, natural, box, onLoad }: { src: string; frame: { w: number; h: number }; natural: { w: number; h: number }; box: ImageFrame; onLoad: (event: SyntheticEvent<HTMLImageElement>) => void }) {
  const placed = placeImage(frame.w, frame.h, natural.w, natural.h, box.x, box.y, box.scale);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onLoad={onLoad}
      className={placed ? "absolute max-w-none select-none" : "size-full object-cover"}
      style={placed ? { width: placed.width, height: placed.height, left: placed.left, top: placed.top } : undefined}
    />
  );
}

export function ImageCrop({ src, x, y, scale, onChange, onReplace, onRemove }: { src: string; x: number; y: number; scale: number; onChange: (next: ImageFrame) => void; onReplace: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const frame = useImageFrame();
  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#ece7e2]">
        <div ref={frame.ref} className="absolute inset-0">
          <CroppedPicture src={src} frame={frame.size} natural={frame.natural} box={{ x, y, scale }} onLoad={frame.onLoad} />
        </div>
        <div className="absolute end-2 top-2 flex gap-2">
          <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => setOpen(true)}>עריכה</button>
          <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={onReplace}>החלפה</button>
          <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={onRemove}>הסרה</button>
        </div>
      </div>
      <span className="mt-2 block text-[12px] text-[#616161]">פתחו עריכה כדי להזיז, להגדיל או להקטין. אותו מיקוד יופיע בעמוד ובכרטיס.</span>
      {open ? <ImageEditor src={src} x={x} y={y} scale={scale} onChange={onChange} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ImageEditor({ src, x, y, scale, onChange, onClose }: { src: string; x: number; y: number; scale: number; onChange: (next: ImageFrame) => void; onClose: () => void }) {
  const frame = useImageFrame();
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const box = { x, y, scale };
  const placed = placeImage(frame.size.w, frame.size.h, frame.natural.w, frame.natural.h, x, y, scale);
  const min = placed?.min ?? 1;

  useEffect(() => {
    function shift(dx: number, dy: number) {
      const node = frame.ref.current;
      const current = placeImage(node?.clientWidth ?? 0, node?.clientHeight ?? 0, frame.natural.w, frame.natural.h, x, y, scale);
      if (!node || !current) return;
      onChange(focusAt(node.clientWidth, node.clientHeight, current.width, current.height, current.left + dx, current.top + dy, scale));
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      const step = event.shiftKey ? 48 : 24;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowUp") shift(0, -step);
      if (event.key === "ArrowDown") shift(0, step);
      if (event.key === "ArrowLeft") shift(-step, 0);
      if (event.key === "ArrowRight") shift(step, 0);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [frame.natural.h, frame.natural.w, onChange, onClose, scale, x, y]);

  function setZoom(next: number) {
    onChange({ x, y, scale: Math.min(3, Math.max(min, Math.round(next * 100) / 100)) });
  }

  function move(clientX: number, clientY: number) {
    const origin = drag.current;
    const node = frame.ref.current;
    if (!origin || !node || !placed) return;
    const dx = clientX - origin.px;
    const dy = clientY - origin.py;
    const start = placeImage(node.clientWidth, node.clientHeight, frame.natural.w, frame.natural.h, origin.x, origin.y, scale);
    if (!start) return;
    onChange(focusAt(node.clientWidth, node.clientHeight, start.width, start.height, start.left + dx, start.top + dy, scale));
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="עריכת התמונה" className="flex w-full max-w-[760px] flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_24px_48px_rgba(0,0,0,.28)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-[15px] font-semibold">עריכת התמונה</h2>
          <button type="button" className="h-8 rounded-lg border-0 bg-[#f3f3f3] px-3 text-sm font-semibold" onClick={onClose}>סיום</button>
        </div>
        <p className="m-0 text-[13px] text-[#616161]">גררו את התמונה, או הזיזו אותה עם החצים. הגדלה מקרבת את מה שחשוב, הקטנה מראה יותר מהתמונה.</p>
        <div
          ref={frame.ref}
          className="relative aspect-[4/3] cursor-grab touch-none overflow-hidden rounded-xl bg-[#ece7e2] active:cursor-grabbing"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button,input")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { px: event.clientX, py: event.clientY, x, y };
          }}
          onPointerMove={(event) => { if (drag.current) move(event.clientX, event.clientY); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onWheel={(event) => { event.preventDefault(); setZoom(scale * (event.deltaY > 0 ? 0.94 : 1.06)); }}
        >
          <CroppedPicture src={src} frame={frame.size} natural={frame.natural} box={box} onLoad={frame.onLoad} />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="הקטנה" className="grid size-8 place-items-center rounded-lg border-0 bg-[#f3f3f3] text-lg font-semibold" onClick={() => setZoom(scale - 0.08)}>−</button>
          <input aria-label="גודל התמונה" type="range" min={Math.round(min * 100)} max={300} value={Math.round(Math.min(3, Math.max(min, scale)) * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} className="min-w-0 flex-1 accent-[#303030]" />
          <button type="button" aria-label="הגדלה" className="grid size-8 place-items-center rounded-lg border-0 bg-[#f3f3f3] text-lg font-semibold" onClick={() => setZoom(scale + 0.08)}>+</button>
          <span className="w-12 text-end text-[13px] text-[#616161]">{Math.round(Math.min(3, Math.max(min, scale)) * 100)}%</span>
          <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => onChange({ x: 50, y: 50, scale: 1 })}>מילוי</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function focusAt(frameW: number, frameH: number, width: number, height: number, left: number, top: number, scale: number): ImageFrame {
  const nextLeft = clampOffset(left, frameW, width);
  const nextTop = clampOffset(top, frameH, height);
  const x = width ? ((frameW / 2 - nextLeft) / width) * 100 : 50;
  const y = height ? ((frameH / 2 - nextTop) / height) * 100 : 50;
  return { x: Math.round(x), y: Math.round(y), scale };
}

export function CoverThumb({ src, x, y, scale }: { src: string; x: number; y: number; scale: number }) {
  const frame = useImageFrame();
  return (
    <span ref={frame.ref} className="absolute inset-0 block overflow-hidden">
      <CroppedPicture src={src} frame={frame.size} natural={frame.natural} box={{ x, y, scale }} onLoad={frame.onLoad} />
    </span>
  );
}

function useImageFrame() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, size, natural, onLoad: (event: SyntheticEvent<HTMLImageElement>) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight }) };
}
