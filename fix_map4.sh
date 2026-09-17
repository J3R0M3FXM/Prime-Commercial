sed -i 's/<MapControls/<MapInstanceCapture setMap={setMapInstance} \/><\/MapContainer>{mapInstance \&\& (<MapControls map={mapInstance} /g' app/components/address-picker-map.tsx
sed -i 's/safeLon={safeLon}/safeLon={safeLon}/g' app/components/address-picker-map.tsx
