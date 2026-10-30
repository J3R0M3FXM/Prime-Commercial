"use client";

import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface WarehouseMapProps {
  lat: number;
  lon: number;
  onLocationUpdate: (lat: number, lon: number) => void;
  interactive?: boolean;
  showMarker?: boolean;
}

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(position, Math.max(map.getZoom(), 14), { animate: true }); }, [map, position[0], position[1]]);
  return null;
}

function LocationMarker({
  position,
  onLocationUpdate,
  interactive,
  showMarker,
}: {
  position: [number, number];
  onLocationUpdate: (lat: number, lon: number) => void;
  interactive: boolean;
  showMarker: boolean;
}) {
  useMapEvents({
    ...(interactive ? { click(e: any) { onLocationUpdate(e.latlng.lat, e.latlng.lng); } } : {}),
  });

  return showMarker ? <Marker position={position} /> : null;
}

export default function WarehouseMap({ lat, lon, onLocationUpdate, interactive = true, showMarker = true }: WarehouseMapProps) {
  const position: [number, number] = [lat, lon];

  return (
    <MapContainer
      center={position}
      zoom={14}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter position={position} />
      <LocationMarker position={position} onLocationUpdate={onLocationUpdate} interactive={interactive} showMarker={showMarker} />
    </MapContainer>
  );
}
