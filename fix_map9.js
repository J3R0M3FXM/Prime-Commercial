const fs = require('fs');
let content = fs.readFileSync('app/components/address-picker-map.tsx', 'utf8');
content = content.replace(/return \(\s*<div[\s\S]*?\);\s*\}/m, 
`return (
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
        <MapInstanceCapture setMap={setMapInstance} />
      </MapContainer>
      {mapInstance && (
        <MapControls
          map={mapInstance}
          onUseMyLocation={onUseMyLocation}
          isLocating={isLocating}
          onLocationChange={onLocationChange}
          safeLat={safeLat}
          safeLon={safeLon}
        />
      )}
    </div>
  );
}`);
fs.writeFileSync('app/components/address-picker-map.tsx', content);
