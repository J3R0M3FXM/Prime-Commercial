'use client';
import MapboxView from '../mapbox-view';
interface WarehouseMapProps {
  lat: number; lon: number; onLocationUpdate: (lat: number, lon: number) => void;
  interactive?: boolean; showMarker?: boolean;
}
export default function WarehouseMap({lat, lon, onLocationUpdate, interactive = true, showMarker = true}: WarehouseMapProps) {
  return <MapboxView lat={lat} lon={lon} zoom={14} interactive={interactive} showMarker={showMarker} onLocationChange={interactive ? onLocationUpdate : undefined} label="Warehouse Mapbox Map" />;
}
