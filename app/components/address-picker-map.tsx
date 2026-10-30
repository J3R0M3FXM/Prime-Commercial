"use client";

import { useEffect } from "react";
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
  pinDropArmed: boolean;
  onPinDropArmedChange: (armed: boolean) => void;
}

function MapClickHandler({ onLocationChange, pinDropArmed, onPinDropArmedChange }: {
  onLocationChange: (lat: number, lon: number) => void;
  pinDropArmed: boolean;
  onPinDropArmedChange: (armed: boolean) => void;
}) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent.target;
      if (target instanceof Element && target.closest("[data-map-control='true']")) return;
      if (!pinDropArmed) return;
      onLocationChange(e.latlng.lat, e.latlng.lng);
      onPinDropArmedChange(false);
    },
  });
  return null;
}

function SyncMapCenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: false });
  }, [lat, lon, map]);
  return null;
}

function MapControls({
  onUseMyLocation,
  isLocating,
  safeLat,
  safeLon,
  pinDropArmed,
  onPinDropArmedChange,
}: {
  onUseMyLocation?: () => void;
  isLocating?: boolean;
  safeLat: number;
  safeLon: number;
  pinDropArmed: boolean;
  onPinDropArmedChange: (armed: boolean) => void;
}) {
  const map = useMap();

  return (
    <>
      {/* Zoom Controls on the LEFT */}
      <div data-map-control="true" className="absolute top-2.5 left-2.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
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
      <div data-map-control="true" className="absolute top-2.5 right-2.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
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
            onPinDropArmedChange(!pinDropArmed);
          }}
          className={`min-h-8 px-2 bg-white/95 hover:bg-white active:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${pinDropArmed ? "ring-2 ring-amber-500" : ""}`}
          title={pinDropArmed ? "Tap the map to place the pin" : "Enable pin placement"}
          aria-label={pinDropArmed ? "Cancel pin placement" : "Drop Pin"}
          aria-pressed={pinDropArmed}
        >
          <MapPin className="w-4 h-4 text-red-500" />
          <span className="text-[11px] font-semibold">{pinDropArmed ? "Tap Map" : "Drop Pin"}</span>
        </button>
      </div>

      {/* Coordinate status tag at bottom-right */}
      <div className="absolute bottom-2 left-2 z-[1000] pointer-events-none">
        <span className="bg-white/90 backdrop-blur-xs text-[9px] font-mono text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 shadow-xs">
          {pinDropArmed ? "Tap the map to place your pin" : "Move map, then tap Drop Pin"}
        </span>
      </div>
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
  isLocating = false,
  pinDropArmed,
  onPinDropArmedChange,
}: AddressPickerMapProps) {
  const safeLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : 14.5995;
  const safeLon = typeof lon === 'number' && Number.isFinite(lon) ? lon : 120.9842;
  const position: [number, number] = [safeLat, safeLon];
  

  return (
    <div className="w-full h-[180px] sm:h-[200px] rounded-xl overflow-hidden border border-gray-300 relative shadow-inner bg-gray-100 isolate z-0">
      <MapContainer
        center={position}
        zoom={15}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", touchAction: "none" }}
        className="z-0"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SyncMapCenter lat={safeLat} lon={safeLon} />
        <MapClickHandler onLocationChange={onLocationChange} pinDropArmed={pinDropArmed} onPinDropArmedChange={onPinDropArmedChange} />
        <Marker
          position={position}
          draggable={pinDropArmed}
          eventHandlers={{
            dragend: (e) => {
              if (!pinDropArmed) return;
              const marker = e.target;
              const pos = marker.getLatLng();
              onLocationChange(pos.lat, pos.lng);
              onPinDropArmedChange(false);
            }
          }}
        />
        <MapControls
          onUseMyLocation={onUseMyLocation}
          isLocating={isLocating}
          safeLat={safeLat}
          safeLon={safeLon}
          pinDropArmed={pinDropArmed}
          onPinDropArmedChange={onPinDropArmedChange}
        />
      </MapContainer>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-7 right-2 z-[1000] rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
