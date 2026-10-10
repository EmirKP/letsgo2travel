declare module "d3-geo" {
  export function geoContains(object: unknown, point: [number, number]): boolean;
  export function geoBounds(object: unknown): [[number, number], [number, number]];
}
