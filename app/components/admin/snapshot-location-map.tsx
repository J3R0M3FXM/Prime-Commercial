'use client';
import MapboxView from '../mapbox-view';
import { validMapCoordinates } from '@/lib/mapbox-config';
export default function SnapshotLocationMap({ lat, lon, label, approximate = false }: { lat: unknown; lon: unknown; label: string; approximate?: boolean }) {
  if (!validMapCoordinates(lat, lon)) return <p className="text-[11px] text-slate-500">{label}: Coordinates Not Captured</p>;
  return <div className="mt-2 space-y-1"><div className="h-[190px] w-full overflow-hidden border border-slate-200"><MapboxView lat={lat} lon={lon as number} zoom={approximate ? 10 : 15} label={label} /></div>{approximate && <p className="text-[10px] text-slate-500">IPLocate Approximate Network Area · Mapbox Map</p>}</div>;
}
