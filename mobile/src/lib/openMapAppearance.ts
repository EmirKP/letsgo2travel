import type { Map as TravelMap, StyleSpecification } from 'maplibre-gl';
import type { ResolvedTheme } from './theme';

/** Keep the provider's original style so switching back restores every colour. */
export function openMapAppearanceStyle(style: StyleSpecification, theme: ResolvedTheme): StyleSpecification {
  const next = structuredClone(style);
  for (const layer of next.layers) {
    if (theme === 'light') {
      if (layer.type === 'background') layer.paint = { ...layer.paint, 'background-color': '#f6f4ef' };
      if (layer.type === 'fill' && layer.id === 'water') layer.paint = { ...layer.paint, 'fill-color': '#b6dcee' };
      if (layer.type === 'fill' && /park|landcover_wood/.test(layer.id)) layer.paint = { ...layer.paint, 'fill-color': '#d0e5c9' };
      if (layer.type === 'fill' && layer.id === 'building') layer.paint = { ...layer.paint, 'fill-color': '#e5e2da', 'fill-outline-color': '#d9d6ce' };
    } else {
      if (layer.type === 'background') layer.paint = { ...layer.paint, 'background-color': '#142132' };
      if (layer.type === 'fill') layer.paint = { ...layer.paint, 'fill-color': /water/.test(layer.id) ? '#193e55' : /park|wood|grass|landcover/.test(layer.id) ? '#1e3d37' : /building/.test(layer.id) ? '#2a3b50' : '#18283a' };
      if (layer.type === 'fill' && /building/.test(layer.id)) layer.paint = { ...layer.paint, 'fill-outline-color': '#354558' };
      if (layer.type === 'line' && /road|transportation|highway|aeroway|tunnel/.test(layer.id)) layer.paint = { ...layer.paint, 'line-color': /casing/.test(layer.id) ? '#182b3c' : /motorway|trunk/.test(layer.id) ? '#887c58' : '#425970' };
      if (layer.type === 'line' && /boundary|railway/.test(layer.id)) layer.paint = { ...layer.paint, 'line-color': '#435269' };
      if (layer.type === 'symbol') layer.paint = { ...layer.paint, 'text-color': '#d0dfed', 'text-halo-color': '#142132' };
    }
  }
  return next;
}

const COLOURS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color', 'text-color', 'text-halo-color'] as const;
type PaintName = Parameters<TravelMap['setPaintProperty']>[1];
type PaintValue = Parameters<TravelMap['setPaintProperty']>[2];

/** Update paint only. Preserve the WebGL map, loaded tiles, camera and route. */
export function applyOpenMapAppearance(map: Pick<TravelMap, 'getStyle' | 'setPaintProperty'>, original: StyleSpecification, theme: ResolvedTheme) {
  const existing = new globalThis.Map(map.getStyle().layers.map(layer => [layer.id, layer]));
  for (const layer of openMapAppearanceStyle(original, theme).layers) {
    const previous = existing.get(layer.id);
    if (!previous || previous.type !== layer.type) continue;
    const paint = layer.paint as Record<string, unknown> | undefined;
    const oldPaint = previous.paint as Record<string, unknown> | undefined;
    for (const property of COLOURS) {
      const value = paint?.[property], oldValue = oldPaint?.[property];
      if (JSON.stringify(value) === JSON.stringify(oldValue)) continue;
      map.setPaintProperty<PaintName>(layer.id, property, value as PaintValue);
    }
  }
}
