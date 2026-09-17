const fs = require('fs');
let code = fs.readFileSync('app/components/address-picker-map.tsx', 'utf8');

// Remove MapInstanceCapture definition
code = code.replace(/function MapInstanceCapture[\s\S]*?return null;\n}/, '');

// Remove MapInstanceCapture usage
code = code.replace(/<MapInstanceCapture setMap={setMapInstance} \/>/g, '');

// Remove mapInstance and setMapInstance
code = code.replace(/const \[mapInstance, setMapInstance\] = useState<any>\(null\);/g, '');

// Replace MapControls
code = code.replace(/\{mapInstance && \([\s\S]*?<MapControls[\s\S]*?safeLon=\{safeLon\}\n\s*\/>\n\s*\)\}/, `<MapControls
          map={null}
          onUseMyLocation={onUseMyLocation}
          isLocating={isLocating}
          onLocationChange={onLocationChange}
          safeLat={safeLat}
          safeLon={safeLon}
        />`);

fs.writeFileSync('app/components/address-picker-map.tsx', code);
