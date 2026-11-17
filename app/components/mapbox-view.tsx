'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl/esm';
import { Loader2, MapPin, Navigation, RefreshCw } from 'lucide-react';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLES, mapCoordinates, validMapCoordinates } from '@/lib/mapbox-config';

type Props = {
  lat?: number | null; lon?: number | null; zoom?: number; interactive?: boolean; showMarker?: boolean;
  onLocationChange?: (lat: number, lon: number) => void;
  pinDropArmed?: boolean; onPinDropArmedChange?: (armed: boolean) => void;
  onUseMyLocation?: () => void; isLocating?: boolean; mapStyle?: keyof typeof MAPBOX_STYLES;
  label?: string;
};
export default function MapboxView(props: Props) {
  const {lat, lon, zoom = 15, interactive = true, showMarker = true, pinDropArmed, onPinDropArmedChange, onUseMyLocation, isLocating = false, mapStyle = 'street', label = 'Mapbox Map'} = props;
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<MapboxMap | null>(null), markerRef = useRef<MapboxMarker | null>(null), latest = useRef(props);
  latest.current = props;
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const position = mapCoordinates(lat, lon);
  useEffect(() => {
    let active = true, map: MapboxMap | null = null, marker: MapboxMarker | null = null, observer: ResizeObserver | null = null;
    setLoading(true); setError('');
    void import('mapbox-gl/esm').then(sdk => {
      if (!active || !container.current) return;
      if (!sdk.supported()) throw new Error('WebGL is unavailable.');
      const current = latest.current;
      map = new sdk.Map({ container: container.current, accessToken: MAPBOX_ACCESS_TOKEN, style: MAPBOX_STYLES[current.mapStyle || 'street'], center: mapCoordinates(current.lat, current.lon), zoom: current.zoom ?? 15, interactive: current.interactive !== false, cooperativeGestures: true, attributionControl: false, renderWorldCopies: false });
      mapRef.current = map;
      map.addControl(new sdk.AttributionControl({ compact: true }), 'bottom-right');
      if (current.interactive !== false) map.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-left');
      marker = new sdk.Marker({ color: '#dc2626', draggable: Boolean(current.onLocationChange && current.interactive !== false && current.pinDropArmed !== false) }).setLngLat(mapCoordinates(current.lat, current.lon));
      markerRef.current = marker;
      if (current.showMarker !== false) marker.addTo(map);
      const commit = (point: {lat: number; lng: number; wrap?: () => {lat: number; lng: number}}) => {
        const now = latest.current;
        if (!now.onLocationChange || now.interactive === false || now.pinDropArmed === false) return;
        const coords = point.wrap ? point.wrap() : point;
        if (!validMapCoordinates(coords.lat, coords.lng)) return;
        marker?.setLngLat([coords.lng, coords.lat]);
        now.onLocationChange(coords.lat, coords.lng);
        now.onPinDropArmedChange?.(false);
      };
      map.on('click', event => {
        const target = event.originalEvent?.target;
        if (target instanceof Element && target.closest('.mapboxgl-control-container, .mapboxgl-marker, [data-map-control]')) return;
        commit(event.lngLat);
      });
      marker.on('dragend', () => { if (marker) commit(marker.getLngLat()); });
      map.on('load', () => { if (active) { setLoading(false); setError(''); map?.resize(); } });
      map.on('error', () => { if (active) { setLoading(false); setError('Mapbox Could Not Load Some Map Data. Check Your Connection or Retry.'); } });
      if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => map?.resize()); observer.observe(container.current); }
    }).catch(() => { if (active) { setLoading(false); setError('Mapbox Could Not Start. Check Map Access or WebGL Support, Then Retry.'); } });
    return () => { active = false; observer?.disconnect(); marker?.remove(); map?.remove(); mapRef.current = null; markerRef.current = null; };
  }, [retry]);
  useEffect(() => { mapRef.current?.jumpTo({center: position}); markerRef.current?.setLngLat(position); }, [position[0], position[1]]);
  useEffect(() => { const map = mapRef.current, marker = markerRef.current; if (!map || !marker) return; if (showMarker) marker.addTo(map); else marker.remove(); }, [showMarker]);
  useEffect(() => { markerRef.current?.setDraggable(Boolean(props.onLocationChange && interactive && pinDropArmed !== false)); }, [interactive, pinDropArmed, props.onLocationChange]);
  useEffect(() => { mapRef.current?.setStyle(MAPBOX_STYLES[mapStyle]); }, [mapStyle]);
  return <div className="prime-mapbox" aria-label={label}>
    <div className="prime-mapbox__surface"><div ref={container} className="prime-mapbox__canvas" />
      {loading && <span className="prime-mapbox__loading" role="status"><Loader2 className="animate-spin" />Loading Map…</span>}
      {(onUseMyLocation || onPinDropArmedChange) && <div data-map-control="true" className="prime-mapbox__actions">
        {onUseMyLocation && <button type="button" onClick={onUseMyLocation} disabled={isLocating} aria-label="Use My Current Location" title="Use My Current Location">{isLocating ? <Loader2 className="animate-spin" /> : <Navigation />}</button>}
        {onPinDropArmedChange && <button type="button" onClick={() => onPinDropArmedChange(!pinDropArmed)} aria-pressed={Boolean(pinDropArmed)} aria-label={pinDropArmed ? 'Cancel Pin Placement' : 'Drop Pin'} title={pinDropArmed ? 'Tap the Map to Place the Pin' : 'Drop Pin'}><MapPin /></button>}
      </div>}
    </div>
    <div className="prime-mapbox__footer"><span>{props.onLocationChange ? pinDropArmed === false ? 'Tap Drop Pin to Choose a Location' : 'Tap the Map or Drag the Pin' : 'Saved Location'}</span><span>{position[1].toFixed(4)}, {position[0].toFixed(4)}</span></div>
    {error && <div className="prime-mapbox__error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)} aria-label="Retry Map"><RefreshCw />Retry</button></div>}
  </div>;
}
