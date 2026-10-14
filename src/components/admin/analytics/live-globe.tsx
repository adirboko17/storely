"use client";

import { useEffect, useRef } from "react";
import { geoContains, geoDistance, geoEquirectangular, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { COUNTRY_NAMES } from "@/components/admin/analytics/country-names";

const PLACES: Record<string, [number, number]> = {
  "תל אביב": [34.78, 32.08],
  "תל אביב-יפו": [34.78, 32.08],
  "tel aviv": [34.78, 32.08],
  "חיפה": [34.99, 32.79],
  haifa: [34.99, 32.79],
  "ירושלים": [35.21, 31.77],
  jerusalem: [35.21, 31.77],
  "באר שבע": [34.79, 31.25],
  "beer sheva": [34.79, 31.25],
  "נתניה": [34.86, 32.33],
  netanya: [34.86, 32.33],
  "ראשון לציון": [34.79, 31.97],
  "פתח תקווה": [34.89, 32.09],
  "אשדוד": [34.65, 31.8],
  ashdod: [34.65, 31.8],
  "אשקלון": [34.57, 31.67],
  "רחובות": [34.81, 31.89],
  "הרצליה": [34.84, 32.16],
  "רמת גן": [34.82, 32.07],
  "ramat gan": [34.82, 32.07],
  "petah tikva": [34.89, 32.09],
  "rishon lezion": [34.79, 31.97],
  "בת ים": [34.75, 32.02],
  "bat yam": [34.75, 32.02],
  herzliya: [34.84, 32.16],
  rehovot: [34.81, 31.89],
  "כפר סבא": [34.91, 32.18],
  "kfar saba": [34.91, 32.18],
  "רעננה": [34.87, 32.18],
  raanana: [34.87, 32.18],
  "מודיעין": [35.01, 31.9],
  modiin: [35.01, 31.9],
  "בני ברק": [34.83, 32.08],
  "bnei brak": [34.83, 32.08],
  "חולון": [34.78, 32.01],
  holon: [34.78, 32.01],
  "אילת": [34.95, 29.56],
  eilat: [34.95, 29.56],
  "ישראל": [35.0, 31.5],
  israel: [35.0, 31.5],
  "ארצות הברית": [-98.5, 39.8],
  "united states": [-98.5, 39.8],
  usa: [-98.5, 39.8],
  "בריטניה": [-1.5, 52.5],
  "united kingdom": [-1.5, 52.5],
  "צרפת": [2.2, 46.2],
  france: [2.2, 46.2],
  "גרמניה": [10.4, 51.1],
  germany: [10.4, 51.1],
  "קנדה": [-106, 56],
  canada: [-106, 56],
};

export type LiveVisitor = { name: string; coordinates: [number, number] };

function placeKey(label: string) {
  return label.toLowerCase().replace(/['’.\-]/g, " ").replace(/\s+/g, " ").trim();
}

export function visitorCoordinates(label: string): [number, number] | null {
  const key = placeKey(label);
  if (!key || key === "לא ידוע") return null;
  if (PLACES[key]) return PLACES[key];
  for (const part of key.split(",")) {
    const piece = part.trim();
    if (PLACES[piece]) return PLACES[piece];
  }
  const names = Object.keys(PLACES).sort((left, right) => right.length - left.length);
  const match = names.find((name) => key.includes(name));
  return match ? PLACES[match] : null;
}

type LandPoints = { pts: Array<[number, number]>; names: string[]; step: number };

type CountryGeometry = { type: string; coordinates: unknown };
type CountryFeature = { id?: string | number; geometry?: CountryGeometry };

function countryLabel(id: string) {
  if (id === "275") return "ישראל";
  return COUNTRY_NAMES[id] ?? "";
}

function polygonRings(geometry: CountryGeometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates as number[][][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as number[][][][];
  return [];
}

function ringBox(ring: number[][]) {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const point of ring) {
    const lon = point[0] ?? 0;
    const lat = point[1] ?? 0;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function indexCountries(features: CountryFeature[]) {
  const cell = 4;
  const buckets = new Map<string, Array<{ name: string; feature: { type: "Feature"; geometry: CountryGeometry } }>>();
  for (const item of features) {
    const id = String(item.id ?? "").padStart(3, "0");
    const name = countryLabel(id);
    if (!name || !item.geometry) continue;
    const featureShape = { type: "Feature" as const, geometry: item.geometry };
    const record = { name, feature: featureShape };
    for (const polygon of polygonRings(item.geometry)) {
      const ring = polygon[0];
      if (!ring?.length) continue;
      const west = ring.filter((point) => (point[0] ?? 0) < 0);
      const east = ring.filter((point) => (point[0] ?? 0) >= 0);
      const width = Math.max(...ring.map((point) => point[0] ?? 0)) - Math.min(...ring.map((point) => point[0] ?? 0));
      const groups = width > 180 && west.length && east.length ? [west, east] : [ring];
      for (const group of groups) {
        const box = ringBox(group);
        const x0 = Math.floor(box.minLon / cell);
        const x1 = Math.floor(box.maxLon / cell);
        const y0 = Math.floor(box.minLat / cell);
        const y1 = Math.floor(box.maxLat / cell);
        for (let x = x0; x <= x1; x += 1) {
          for (let y = y0; y <= y1; y += 1) {
            const key = `${x},${y}`;
            const list = buckets.get(key);
            if (list) {
              if (!list.includes(record)) list.push(record);
            } else buckets.set(key, [record]);
          }
        }
      }
    }
  }
  return (lon: number, lat: number) => {
    const list = buckets.get(`${Math.floor(lon / cell)},${Math.floor(lat / cell)}`) ?? [];
    const match = list.find((item) => geoContains(item.feature, [lon, lat]));
    return match?.name ?? "";
  };
}

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
      const countriesResponse = await fetch("/globe/countries-110m.json");
      if (!countriesResponse.ok) throw new Error("map");
      const countriesTopo = (await countriesResponse.json()) as { objects: { countries: unknown } };
      const countries = feature(countriesTopo, countriesTopo.objects.countries) as unknown as {
        features: Array<{ id?: string | number; geometry?: { type: string; coordinates: unknown } }>;
      };
      const countryAt = indexCountries(countries.features);
      const step = 0.82;
      const pts: Array<[number, number]> = [];
      const names: string[] = [];
      for (let lat = -84; lat <= 84; lat += step * 0.866) {
        const row = Math.round((lat + 84) / (step * 0.866));
        const lonStep = step / Math.cos((lat * Math.PI) / 180);
        const offset = (row % 2) * (lonStep / 2);
        for (let lon = -180 + offset; lon < 180; lon += lonStep) {
          if (!isLand(lon, lat)) continue;
          pts.push([lon, lat]);
          names.push(countryAt(lon, lat));
        }
      }
      return { pts, names, step };
    })().catch((error: unknown) => {
      landPromise = null;
      throw error;
    });
  }
  return landPromise;
}

export function LiveGlobe({ labels, visitors, store }: { labels: boolean; visitors: LiveVisitor[]; store: LiveVisitor | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);
  const zoomInRef = useRef<HTMLButtonElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);
  const visitorsRef = useRef(visitors);
  const storeRef = useRef(store);
  const apiRef = useRef<{ zoom: (factor: number) => void; setLabels: (value: boolean) => void; redraw: () => void } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!root || !canvas || !overlay) return;

    let rotation: [number, number] = [-34.8, -32];
    let scale = 1;
    let land: LandPoints | null = null;
    let showLabels = false;
    let frame = 0;
    let alive = true;
    let pointer: [number, number] | null = null;
    let hits: Array<{ x: number; y: number; name: string; size: number }> = [];
    let hoverName = "";
    let hoverTimer = 0;
    const bubble = document.createElement("div");
    bubble.className = "live-bubble";
    root.append(bubble);

    const hideBubble = () => {
      bubble.dataset.on = "false";
    };

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
      const terrain = land;
      if (!terrain) return;

      const projection = geoOrthographic().scale(radius).translate([cx, cy]).rotate(rotation).clipAngle(90);
      const center: [number, number] = [-rotation[0], -rotation[1]];
      const hex = radius * ((terrain.step * Math.PI) / 180) * 0.5;
      const active = new Set<string>();
      for (const visitor of visitorsRef.current) {
        let nearest: [number, number] | null = null;
        let nearestDistance = 0.045;
        for (const point of terrain.pts) {
          const distance = geoDistance(point, visitor.coordinates);
          if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
          }
        }
        if (nearest) active.add(`${nearest[0].toFixed(2)},${nearest[1].toFixed(2)}`);
      }
      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, 7);
      context.clip();
      const top = cy - radius;
      const span = 2 * radius;
      const nextHits: Array<{ x: number; y: number; name: string; size: number }> = [];
      terrain.pts.forEach((point, index) => {
        const distance = geoDistance(point, center);
        if (distance > 1.56) return;
        const projected = projection(point);
        if (!projected) return;
        const facing = Math.cos(distance);
        const shade = (projected[1] - top) / span;
        const hot = active.has(`${point[0].toFixed(2)},${point[1].toFixed(2)}`);
        context.fillStyle = hot ? "#1f8ec8" : `rgb(${Math.round(142 + shade * 18)},${Math.round(214 - shade * 10)},${Math.round(224 - shade * 8)})`;
        const size = hex * Math.max(0.42, facing);
        context.setTransform(dpr, 0, 0, dpr, projected[0] * dpr, projected[1] * dpr);
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const hexAngle = Math.PI / 6 + index * (Math.PI / 3);
          const x = Math.cos(hexAngle) * size;
          const y = Math.sin(hexAngle) * size;
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        }
        context.closePath();
        context.fill();
        const name = terrain.names[index];
        if (name) nextHits.push({ x: projected[0], y: projected[1], name, size });
      });
      hits = nextHits;
      context.restore();

      const markers = storeRef.current ? [storeRef.current] : [];
      for (const visitor of markers) {
        if (geoDistance(visitor.coordinates, center) > 1.5) continue;
        const projected = projection(visitor.coordinates);
        if (!projected) continue;
        const pin = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        pin.setAttribute("aria-label", visitor.name);
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
        if (showLabels) {
          const label = document.createElement("span");
          label.className = "live-label";
          label.style.left = `${projected[0]}px`;
          label.style.top = `${projected[1] - 14}px`;
          label.textContent = visitor.name;
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
      redraw: draw,
    };

    const observer = new ResizeObserver(() => draw());
    observer.observe(root);

    const nearest = (x: number, y: number) => {
      let best: { x: number; y: number; name: string; size: number } | null = null;
      let bestDistance = Infinity;
      for (const hit of hits) {
        const distance = Math.hypot(hit.x - x, hit.y - y);
        if (distance <= hit.size && distance < bestDistance) {
          best = hit;
          bestDistance = distance;
        }
      }
      return best;
    };

    const onHover = (event: PointerEvent) => {
      if (pointer) return;
      const bounds = canvas.getBoundingClientRect();
      const hit = nearest(event.clientX - bounds.left, event.clientY - bounds.top);
      if (!hit) {
        window.clearTimeout(hoverTimer);
        hoverName = "";
        hideBubble();
        return;
      }
      if (hit.name === hoverName) {
        if (bubble.dataset.on === "true") {
        bubble.style.left = `${hit.x + hit.size + 10}px`;
        bubble.style.top = `${hit.y}px`;
        }
        return;
      }
      window.clearTimeout(hoverTimer);
      hoverName = hit.name;
      hideBubble();
      const place = hit;
      hoverTimer = window.setTimeout(() => {
        if (!alive || hoverName !== place.name) return;
        bubble.textContent = place.name;
        bubble.style.left = `${place.x + place.size + 10}px`;
        bubble.style.top = `${place.y}px`;
        bubble.dataset.on = "true";
      }, 1200);
    };

    const onDown = (event: PointerEvent) => {
      pointer = [event.clientX, event.clientY];
      window.clearTimeout(hoverTimer);
      hoverName = "";
      hideBubble();
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

    const onLeave = () => {
      window.clearTimeout(hoverTimer);
      hoverName = "";
      hideBubble();
    };
    canvas.addEventListener("pointermove", onHover);
    canvas.addEventListener("pointerleave", onLeave);
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
      window.clearTimeout(hoverTimer);
      bubble.remove();
      canvas.removeEventListener("pointermove", onHover);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    visitorsRef.current = visitors;
    storeRef.current = store;
    apiRef.current?.redraw();
  }, [visitors, store]);

  useEffect(() => {
    apiRef.current?.setLabels(labels);
  }, [labels]);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden" style={{ touchAction: "none" }}>
      <style>{`
        .live-bubble{position:absolute;z-index:5;translate:0 -50%;padding:8px 12px;border-radius:12px;background:#fff;color:#1a1a1a;font:600 14px Assistant,system-ui,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.05);pointer-events:none;opacity:0;scale:.92;transition:opacity .18s ease,scale .22s cubic-bezier(.16,1,.3,1)}
        .live-bubble[data-on="true"]{opacity:1;scale:1}
        .live-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none}
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
