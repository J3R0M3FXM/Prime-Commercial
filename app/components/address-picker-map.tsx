"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Navigation, Loader2, MapPin } from "lucide-react";

// Fix Leaflet's default icon path issues in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface AddressPickerMapProps {
  lat: number;
  lon: number;
  onLocationChange: (lat: number, lon: number) => void;
  onUseMyLocation?: () => void;
  isLocating?: boolean;
}

function MapClickHandler({ onLocationChange }: { onLocationChange: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom() || 15, { animate: true });
    }
  }, [center, map]);
  return null;
}

export default function AddressPickerMap({
  lat,
  lon,
  onLocationChange,
  onUseMyLocation,
  isLocating = false
}: AddressPickerMapProps) {
  const safeLat = typeof lat === 'number' && !isNaN(lat) ? lat : 14.5995;
  const safeLon = typeof lon === 'number' && !isNaN(lon) ? lon : 120.9842;
  const position: [number, number] = [safeLat, safeLon];

  return (
    <div className="w-full h-64 md:h-72 rounded-xl overflow-hidden border border-gray-300 relative shadow-inner bg-gray-100">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapRecenter center={position} />
        <MapClickHandler onLocationChange={onLocationChange} />

        <Marker
          position={position}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              onLocationChange(pos.lat, pos.lng);
            }
          }}
        />
      </MapContainer>

      {/* Floating Action Overlay */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        {onUseMyLocation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUseMyLocation();
            }}
            disabled={isLocating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 hover:bg-black text-white text-xs font-mono uppercase tracking-wider rounded-lg shadow-md backdrop-blur-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isLocating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Locating...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5 text-amber-400" />
                <span>Use My Location</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Helper Footer Badge */}
      <div className="absolute bottom-2 left-2 right-2 z-[400] pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm py-1.5 px-3 rounded-lg shadow-sm border border-gray-200 flex items-center justify-between text-[11px] font-mono text-gray-700">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-red-500 shrink-0" />
            <span className="font-semibold uppercase tracking-tight">Drop a Pin:</span>
            <span className="text-gray-500 hidden sm:inline">Click map or drag marker to adjust delivery spot</span>
          </div>
          <span className="text-gray-500 font-mono text-[10px]">
            {safeLat.toFixed(4)}, {safeLon.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
