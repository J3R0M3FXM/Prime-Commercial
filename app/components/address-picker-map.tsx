'use client';
import MapboxView from './mapbox-view';
interface AddressPickerMapProps {
  lat: number; lon: number; onLocationChange: (lat: number, lon: number) => void;
  onUseMyLocation?: () => void; isLocating?: boolean;
  pinDropArmed: boolean; onPinDropArmedChange: (armed: boolean) => void;
}
export default function AddressPickerMap(props: AddressPickerMapProps) {
  return <div className="w-full h-[200px] rounded-lg overflow-hidden border border-gray-300 relative isolate z-0"><MapboxView {...props} zoom={15} label="Delivery Address Mapbox Map" /></div>;
}
