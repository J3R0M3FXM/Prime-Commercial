"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { 
  MapPin, 
  Compass, 
  ExternalLink, 
  Layers, 
  Navigation, 
  Maximize2, 
  Minimize2, 
  Check, 
  Copy,
  Building,
  Route
} from "lucide-react";

const MapboxView = dynamic(() => import('./mapbox-view'), { ssr: false });
import { validMapCoordinates } from '@/lib/mapbox-config';

interface StaticOrderMapProps {
  lat?: number | null;
  lon?: number | null;
  addressText?: string;
  receiverName?: string;
  orderNumber?: string;
  distanceKm?: number | null;
}

export function StaticOrderMap({
  lat,
  lon,
  addressText,
  receiverName,
  orderNumber,
  distanceKm
}: StaticOrderMapProps) {
  const [mounted, setMounted] = useState(false);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default coordinates: Metro Manila, Philippines (14.5995, 120.9842) if none provided
  const hasValidCoords = validMapCoordinates(lat, lon);
  const validLat = hasValidCoords ? lat! : 14.5995;
  const validLon = hasValidCoords ? lon! : 120.9842;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${validLat},${validLon}`;
  const wazeUrl = `https://waze.com/ul?ll=${validLat},${validLon}&navigate=yes`;

  const handleCopyCoords = () => {
    const text = `${validLat.toFixed(6)}, ${validLon.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  if (!mounted) {
    return (
      <div className="w-full h-48 bg-slate-100 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1 font-mono text-xs">
        <MapPin className="w-5 h-5 animate-pulse text-slate-400" />
        <span>Loading Delivery Map View...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 transition-all duration-300 ${isExpanded ? "fixed inset-y-4 left-1/2 -translate-x-1/2 w-[calc(100%-16px)] max-w-[430px] z-50 bg-white p-3 rounded-lg shadow-2xl border border-slate-300 flex flex-col" : "relative"}`}>
      {/* Map Header & Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <Route className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-bold text-[11px] uppercase tracking-wider text-slate-900 truncate">
              Delivery GPS Location &amp; Route Map
            </h4>
            <p className="text-[10px] font-mono text-slate-500 truncate">
              {hasValidCoords ? `${validLat.toFixed(5)}, ${validLon.toFixed(5)}` : "Approximate Location"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Map Style Toggle */}
          <button
            type="button"
            onClick={() => setMapType(prev => prev === "standard" ? "satellite" : "standard")}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer border border-slate-200"
            title="Toggle between standard street map and satellite imagery"
          >
            <Layers className="w-3 h-3 text-slate-600" />
            <span>{mapType === "standard" ? "Satellite" : "Street Map"}</span>
          </button>

          {/* External Directions */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
            title="Open Google Maps Route Navigation"
          >
            <Navigation className="w-3 h-3 text-blue-600" />
            <span>Google Maps</span>
          </a>

          {/* Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-mono transition-colors border border-slate-200 cursor-pointer"
            title={isExpanded ? "Minimize Map" : "Expand Map Full View"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Map Container View */}
      <div className={`relative overflow-hidden rounded-xl border border-slate-200 shadow-2xs ${isExpanded ? "flex-1 min-h-[350px]" : "h-56"}`}>
        <MapboxView lat={validLat} lon={validLon} mapStyle={mapType === 'satellite' ? 'satellite' : 'street'} showMarker={hasValidCoords} label="Order Delivery Mapbox Map" />

        {/* Floating Route Info Badge */}
        <div className="absolute top-12 left-2 right-2 z-10 pointer-events-none">
          <div className="p-2.5 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-md pointer-events-auto flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-red-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-heading font-bold text-[10.5px] uppercase tracking-wider text-slate-900 truncate">
                  {addressText || "Delivery Address Pinpoint"}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>GPS: {validLat.toFixed(5)}, {validLon.toFixed(5)}</span>
                  {distanceKm && distanceKm > 0 && (
                    <span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                      {distanceKm} km route
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyCoords}
              className="px-2 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
              title="Copy GPS coordinates"
            >
              {copiedCoords ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-300" />
                  <span>Copy GPS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
