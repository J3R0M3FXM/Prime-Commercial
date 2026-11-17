// Mapbox public browser token. Deployment may override it with VITE_MAPBOX_ACCESS_TOKEN.
export const MAPBOX_ACCESS_TOKEN = String(import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiamVyb21lYnVzaW5lc3NwbGF0Zm9ybS1sYWIiLCJhIjoiY213bDRjbWExMDczNzJ4cHpwMDA3d2U1cCJ9.buP-R4INoN_QCAA_3YL0Fw').trim();
export const MAPBOX_STYLES = { street: 'mapbox://styles/mapbox/streets-v12', satellite: 'mapbox://styles/mapbox/satellite-streets-v12' };
export function validMapCoordinates(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
}
export function mapCoordinates(lat: unknown, lon: unknown): [number, number] {
  return validMapCoordinates(lat, lon) ? [lon as number, lat as number] : [120.9842, 14.5995];
}
