"use client";

import { useEffect, useRef } from "react";
import { geoDistance, geoEquirectangular, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const CITIES: Array<{ name: string; coordinates: [number, number]; main?: boolean }> = [
  { name: "תל אביב", coordinates: [34.78, 32.08], main: true },
  { name: "חיפה", coordinates: [34.99, 32.79] },
  { name: "ירושלים", coordinates: [35.21, 31.77] },
  { name: "באר שבע", coordinates: [34.79, 31.25] },
];

type LandPoints = { pts: Array<[number, number]>; step: number };

let landPromise: Promise<LandPoints> | null = null;

function loadLand() {
  if (!landPromise) {
    landPromise = (async () => {
      const response = await fetch("/globe/land-50m.json");
      if (!response.ok) throw new Error("map");
      const topo = (await response.json()) as { objects: { land: unknown } };
      const land = feature(topo, topo.objects.land);
      const width = 2048;
      const height = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("map");
      const projection = geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]);
      context.fillStyle = "#000";
      context.beginPath();
      geoPath(projection, context)(land);
      context.fill();
      const pixels = context.getImageData(0, 0, width, height).data;
      const isLand = (lon: number, lat: number) => {
        const column = Math.floor(((lon + 180) / 360) * width) % width;
        const row = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
        return pixels[(row * width + column) * 4 + 3] > 100;
      };
      const step = 1.15;
      const pts: Array<[number, number]> = [];
      for (let lat = -84; lat <= 84; lat += step * 0.866) {
        const row = Math.round((lat + 84) / (step * 0.866));
        const lonStep = step / Math.cos((lat * Math.PI) / 180);
        const offset = (row % 2) * (lonStep / 2);
        for (let lon = -180 + offset; lon < 180; lon += lonStep) {
          if (isLand(lon, lat)) pts.push([lon, lat]);
        }
      }
      return { pts, step };
    })().catch((error: unknown) => {
      landPromise = null;
      throw error;
    });
  }
  return landPromise;
}

export function LiveGlobe({ labels }: { labels: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);
  const zoomInRef = useRef<HTMLButtonElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);
  const apiRef = useRef<{ zoom: (factor: number) => void; setLabels: (value: boolean) => void } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!root || !canvas || !overlay) return;

    let rotation: [number, number] = [-35, -27];
    let scale = 1;
    let land: LandPoints | null = null;
    let showLabels = false;
    let frame = 0;
    let alive = true;
    let pointer: [number, number] | null = null;

    const render = () => {
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.48 * scale;
      const cx = width / 2;
      const cy = height / 2;

      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, 7);
      context.shadowColor = "rgba(120,230,190,.6)";
      context.shadowBlur = radius * 0.25;
      context.shadowOffsetX = -radius * 0.08 * dpr;
      context.shadowOffsetY = -radius * 0.08 * dpr;
      context.fillStyle = "#dbeaf3";
      context.fill();
      context.restore();

      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, 7);
      context.shadowColor = "rgba(150,150,255,.5)";
      context.shadowBlur = radius * 0.25;
      context.shadowOffsetX = radius * 0.08 * dpr;
      context.shadowOffsetY = radius * 0.08 * dpr;
      context.fillStyle = "#dbeaf3";
      context.fill();
      context.restore();

      const gradient = context.createRadialGradient(cx - radius * 0.3, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
      gradient.addColorStop(0, "#eef7f6");
      gradient.addColorStop(0.6, "#dbeaf3");
      gradient.addColorStop(1, "#c3def4");
      context.beginPath();
      context.arc(cx, cy, radius, 0, 7);
      context.fillStyle = gradient;
      context.fill();

      overlay.replaceChildren();
      if (!land) return;

      const projection = geoOrthographic().scale(radius).translate([cx, cy]).rotate(rotation).clipAngle(90);
      const center: [number, number] = [-rotation[0], -rotation[1]];
      const hex = radius * ((land.step * Math.PI) / 180) * 0.56;
      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, 7);
      context.clip();
      const top = cy - radius;
      const span = 2 * radius;
      for (const point of land.pts) {
        const distance = geoDistance(point, center);
        if (distance > 1.56) continue;
        const projected = projection(point);
        if (!projected) continue;
        const facing = Math.cos(distance);
        const shade = (projected[1] - top) / span;
        context.fillStyle = `rgb(${Math.round(70 + shade * 55)},${Math.round(214 - shade * 30)},${Math.round(196 + shade * 44)})`;
        const angle = Math.atan2(projected[1] - cy, projected[0] - cx);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.translate(projected[0], projected[1]);
        context.rotate(angle);
        context.scale(Math.max(0.12, facing), 1);
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const hexAngle = Math.PI / 6 + index * (Math.PI / 3);
          const x = Math.cos(hexAngle) * hex;
          const y = Math.sin(hexAngle) * hex;
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        }
        context.closePath();
        context.fill();
      }
      context.restore();

      for (const city of CITIES) {
        if (geoDistance(city.coordinates, center) > 1.5) continue;
        const projected = projection(city.coordinates);
        if (!projected) continue;
        if (city.main) {
          const pin = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          pin.setAttribute("aria-label", city.name);
          pin.setAttribute("width", "18");
          pin.setAttribute("height", "24");
          pin.setAttribute("viewBox", "0 0 18 24");
          pin.setAttribute("class", "live-pin");
          pin.style.left = `${projected[0]}px`;
          pin.style.top = `${projected[1]}px`;
          const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
          shape.setAttribute("d", "M9 23s7-7.6 7-13A7 7 0 0 0 2 10c0 5.4 7 13 7 13z");
          shape.setAttribute("fill", "#6b3fe0");
          const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          hole.setAttribute("cx", "9");
          hole.setAttribute("cy", "9.5");
          hole.setAttribute("r", "3");
          hole.setAttribute("fill", "#cdbdff");
          pin.append(shape, hole);
          overlay.append(pin);
        } else {
          const dot = document.createElement("span");
          dot.className = "live-dot";
          dot.style.left = `${projected[0]}px`;
          dot.style.top = `${projected[1]}px`;
          overlay.append(dot);
        }
        if (showLabels) {
          const label = document.createElement("span");
          label.className = "live-label";
          label.style.left = `${projected[0]}px`;
          label.style.top = `${projected[1] - (city.main ? 14 : 0)}px`;
          label.textContent = city.name;
          overlay.append(label);
        }
      }
    };

    const draw = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (alive) render();
      });
    };

    const zoom = (factor: number) => {
      scale = Math.max(1, Math.min(3.5, scale * factor));
      if (zoomInRef.current) zoomInRef.current.disabled = scale >= 3.5;
      if (zoomOutRef.current) zoomOutRef.current.disabled = scale <= 1;
      draw();
    };

    apiRef.current = {
      zoom,
      setLabels(value) {
        showLabels = value;
        draw();
      },
    };

    const observer = new ResizeObserver(() => draw());
    observer.observe(root);

    const onDown = (event: PointerEvent) => {
      pointer = [event.clientX, event.clientY];
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("cursor-grabbing");
    };
    const onMove = (event: PointerEvent) => {
      if (!pointer) return;
      const dx = event.clientX - pointer[0];
      const dy = event.clientY - pointer[1];
      pointer = [event.clientX, event.clientY];
      rotation = [rotation[0] + (dx * 0.3) / scale, Math.max(-80, Math.min(80, rotation[1] - (dy * 0.3) / scale))];
      draw();
    };
    const onUp = () => {
      pointer = null;
      canvas.classList.remove("cursor-grabbing");
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    loadLand()
      .then((points) => {
        if (!alive) return;
        land = points;
        loadRef.current?.remove();
        draw();
      })
      .catch(() => {
        if (loadRef.current) loadRef.current.textContent = "המפה לא נטענה";
      });

    draw();

    return () => {
      alive = false;
      apiRef.current = null;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    apiRef.current?.setLabels(labels);
  }, [labels]);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden" style={{ touchAction: "none" }}>
      <style>{`
        .live-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none}
        .live-dot{position:absolute;width:8px;height:8px;border-radius:50%;background:#7fd0f2;box-shadow:0 0 0 4px rgba(127,208,242,.3);transform:translate(-50%,-50%);animation:live-pulse 2.2s ease-in-out infinite;pointer-events:none}
        @keyframes live-pulse{0%,100%{box-shadow:0 0 0 3px rgba(127,208,242,.35)}50%{box-shadow:0 0 0 8px rgba(127,208,242,0)}}
        .live-label{position:absolute;transform:translate(-50%,-150%);white-space:nowrap;font:600 11px Assistant,system-ui,sans-serif;background:#fff;color:#303030;padding:1px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.15);pointer-events:none}
      `}</style>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute bottom-11 left-4 z-10 flex flex-col gap-1.5">
        <button ref={zoomInRef} type="button" aria-label="הגדלה" className="grid size-7 place-items-center rounded-full border-0 bg-[#ebebeb] text-lg leading-none font-semibold text-ink enabled:cursor-pointer enabled:hover:bg-[#e3e3e3] disabled:cursor-default disabled:bg-[#f3f3f3] disabled:text-[#b5b5b5]" onClick={() => apiRef.current?.zoom(1.35)}>
          +
        </button>
        <button ref={zoomOutRef} type="button" aria-label="הקטנה" disabled className="grid size-7 place-items-center rounded-full border-0 bg-[#ebebeb] text-lg leading-none font-semibold text-ink enabled:cursor-pointer enabled:hover:bg-[#e3e3e3] disabled:cursor-default disabled:bg-[#f3f3f3] disabled:text-[#b5b5b5]" onClick={() => apiRef.current?.zoom(1 / 1.35)}>
          −
        </button>
      </div>
      <div ref={loadRef} className="absolute inset-0 grid place-items-center text-sm text-[#8a8a8a]">
        טוען מפה…
      </div>
    </div>
  );
}
