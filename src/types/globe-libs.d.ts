declare module "d3-geo" {
  interface GeoProjection {
    scale(value: number): this;
    translate(point: [number, number]): this;
    rotate(angles: [number, number]): this;
    clipAngle(angle: number): this;
    (coordinates: [number, number]): [number, number] | null;
  }

  export function geoEquirectangular(): GeoProjection;
  export function geoOrthographic(): GeoProjection;
  export function geoPath(
    projection: GeoProjection,
    context?: CanvasRenderingContext2D,
  ): (object: unknown) => void;
  export function geoDistance(a: [number, number], b: [number, number]): number;
}

declare module "topojson-client" {
  export function feature(topology: { objects: { land: unknown } }, object: unknown): unknown;
}
