sed -i 's/function MapControls({/function MapControls({\n  map,/g' app/components/address-picker-map.tsx
sed -i 's/const map = useMap();/\/\/ const map = useMap();/g' app/components/address-picker-map.tsx
