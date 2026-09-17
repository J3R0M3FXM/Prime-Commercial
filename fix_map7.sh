sed -i '180,200c\
        />\
        <MapInstanceCapture setMap={setMapInstance} />\
      </MapContainer>\
      {mapInstance && (\
        <MapControls\
          map={mapInstance}\
          onUseMyLocation={onUseMyLocation}\
          isLocating={isLocating}\
          onLocationChange={onLocationChange}\
          safeLat={safeLat}\
          safeLon={safeLon}\
        />\
      )}\
    </div>\
  );\
}\
' app/components/address-picker-map.tsx
