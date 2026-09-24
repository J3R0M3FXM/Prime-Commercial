"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
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
}

function LocationMarker({
  position,
  onLocationUpdate,
}: {
  position: [number, number];
  onLocationUpdate: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationUpdate(e.latlng.lat, e.latlng.lng);
    },
  });

  return <Marker position={position} />;
}

export default function WarehouseMap({ lat, lon, onLocationUpdate }: WarehouseMapProps) {
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
      <LocationMarker position={position} onLocationUpdate={onLocationUpdate} />
    </MapContainer>
  );
}
