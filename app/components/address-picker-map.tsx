"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, Minus, Plus, Loader2 } from "lucide-react";

// Fix standard marker icon issue in react-leaflet
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



function MapControls({
  onUseMyLocation,
  isLocating,
  onLocationChange,
  safeLat,
  safeLon
}: {
  onUseMyLocation?: () => void;
  isLocating?: boolean;
  onLocationChange: (lat: number, lon: number) => void;
  safeLat: number;
  safeLon: number;
}) {
  const map = useMap();
  const handleDropPinAtCenter = () => {
    if (!map) return;
    const center = map.getCenter();
    onLocationChange(center.lat, center.lng);
  };

  return (
    <>
      {/* Zoom Controls on the LEFT */}
      <div className="absolute top-2.5 left-2.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (map) map.setZoom(map.getZoom() + 1);
          }}
          className="w-8 h-8 bg-white/95 hover:bg-white active:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Plus className="w-4 h-4 text-gray-700" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (map) map.setZoom(map.getZoom() - 1);
          }}
          className="w-8 h-8 bg-white/95 hover:bg-white active:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Minus className="w-4 h-4 text-gray-700" />
        </button>
      </div>

      {/* Action Controls on the RIGHT (Same size w-8 h-8, aligned with zoom buttons) */}
      <div className="absolute top-2.5 right-2.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
        {onUseMyLocation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUseMyLocation();
            }}
            disabled={isLocating}
            className="w-8 h-8 bg-white/95 hover:bg-white active:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Use My Current Location"
            aria-label="Use My Current Location"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            ) : (
              <Navigation className="w-4 h-4 text-gray-700" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDropPinAtCenter();
          }}
          className="w-8 h-8 bg-white/95 hover:bg-white active:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Drop Pin at Map Center"
          aria-label="Drop Pin at Map Center"
        >
          <MapPin className="w-4 h-4 text-red-500" />
        </button>
      </div>

      {/* Coordinate status tag at bottom-right */}
      <div className="absolute bottom-2 right-2 z-[1000] pointer-events-none">
        <span className="bg-white/90 backdrop-blur-xs text-[10px] font-mono text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 shadow-xs">
          {safeLat.toFixed(4)}, {safeLon.toFixed(4)}
        </span>
      </div>
    </>
  );
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
    <div className="w-full h-44 sm:h-48 md:h-52 rounded-xl overflow-hidden border border-gray-300 relative shadow-inner bg-gray-100 isolate z-0">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={true}
        zoomControl={false}
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
        <MapControls
          onUseMyLocation={onUseMyLocation}
          isLocating={isLocating}
          onLocationChange={onLocationChange}
          safeLat={safeLat}
          safeLon={safeLon}
        />
      </MapContainer>
    </div>
  );
}
