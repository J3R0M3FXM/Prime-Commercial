"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, MapPin, Building2, Truck, Check, Search, X, Loader2, Star, Settings, AlertCircle, Trash2, Sparkles } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet's default icon path issues with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationMarkerProps {
  position: [number, number] | null;
  setPosition: (pos: [number, number]) => void;
  onLocationUpdate: (lat: number, lon: number) => void;
}

function LocationMarker({ position, setPosition, onLocationUpdate }: LocationMarkerProps) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      onLocationUpdate(e.latlng.lat, e.latlng.lng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export default function LogisticsModule() {
  const [activeTab, setActiveTab] = useState<"warehouse" | "courier">("warehouse");
  
  // Warehouse State
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  
  // Warehouse Form State
  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whLat, setWhLat] = useState<number | null>(14.5995); // Default Manila
  const [whLon, setWhLon] = useState<number | null>(120.9842);
  const [isDefaultWh, setIsDefaultWh] = useState(false);
  const [isSavingWh, setIsSavingWh] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  
  // Autocomplete State
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Couriers State
  const [couriers, setCouriers] = useState<any[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(true);

  // Courier Config Modal State
  const [showCourierModal, setShowCourierModal] = useState(false);
  const [editingCourier, setEditingCourier] = useState<any>(null);
  
  // Courier Form State
  const [courierName, setCourierName] = useState("");
  const [courierLogo, setCourierLogo] = useState<string>("");
  const [courierType, setCourierType] = useState("Standard");
  const [baseFare, setBaseFare] = useState<number>(0);
  const [firstMile, setFirstMile] = useState<number>(0);
  const [firstMileFee, setFirstMileFee] = useState<number>(0);
  const [exceedingKmFee, setExceedingKmFee] = useState<number>(0);
  const [surcharge, setSurcharge] = useState<number>(0);
  const [nightDifferential, setNightDifferential] = useState<number>(0);
  const [isSavingCourier, setIsSavingCourier] = useState(false);
  const [isCompressingLogo, setIsCompressingLogo] = useState(false);
  const [courierError, setCourierError] = useState<string | null>(null);
  
  const courierFileInputRef = useRef<HTMLInputElement>(null);

  const compressCourierLogo = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 256;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const isPng = file.type === 'image/png';
            resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
          } else {
            resolve(e.target?.result as string || "");
          }
        };
        img.onerror = () => resolve(e.target?.result as string || "");
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  const handleCourierLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCourierError(null);
      setIsCompressingLogo(true);
      try {
        const compressed = await compressCourierLogo(file);
        setCourierLogo(compressed);
      } catch (err) {
        console.error("Failed to process courier logo", err);
        setCourierError("Failed to process logo image. Please try another file.");
      } finally {
        setIsCompressingLogo(false);
      }
    }
  };

  const applyCourierPreset = (preset: {
    name: string;
    type: string;
    baseFare: number;
    firstMile: number;
    firstMileFee: number;
    exceedingKmFee: number;
    surcharge: number;
    nightDifferential: number;
  }) => {
    setCourierName(preset.name);
    setCourierType(preset.type);
    setBaseFare(preset.baseFare);
    setFirstMile(preset.firstMile);
    setFirstMileFee(preset.firstMileFee);
    setExceedingKmFee(preset.exceedingKmFee);
    setSurcharge(preset.surcharge);
    setNightDifferential(preset.nightDifferential);
    setCourierError(null);
  };

  const resetCourierForm = () => {
    setCourierName("");
    setCourierLogo("");
    setCourierType("Standard");
    setBaseFare(0);
    setFirstMile(0);
    setFirstMileFee(0);
    setExceedingKmFee(0);
    setSurcharge(0);
    setNightDifferential(0);
    setEditingCourier(null);
    setCourierError(null);
    if (courierFileInputRef.current) courierFileInputRef.current.value = "";
  };

  const saveCourier = async () => {
    const trimmedName = courierName.trim();
    if (!trimmedName) {
      setCourierError("Courier Name is required.");
      return;
    }
    
    setIsSavingCourier(true);
    setCourierError(null);
    try {
      const formData: any = {
        name: trimmedName,
        logo: courierLogo || "",
        type: courierType || "Standard",
        baseFare: Number(baseFare) || 0,
        firstMile: Number(firstMile) || 0,
        firstMileFee: Number(firstMileFee) || 0,
        exceedingKmFee: Number(exceedingKmFee) || 0,
        surcharge: Number(surcharge) || 0,
        nightDifferential: Number(nightDifferential) || 0,
      };

      const method = editingCourier ? "PUT" : "POST";
      if (editingCourier) formData.id = editingCourier.id;

      const res = await fetch("/api/admin/couriers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || `Server responded with status ${res.status}`);
      }
      
      await fetchCouriers();
      setShowCourierModal(false);
      resetCourierForm();
    } catch (e: any) {
      console.error("Save courier error:", e);
      setCourierError(e.message || "Failed to save courier. Please check connection and try again.");
    } finally {
      setIsSavingCourier(false);
    }
  };

  const deleteCourier = async (id: string) => {
    if (!confirm("Delete this courier?")) return;
    try {
      const res = await fetch(`/api/admin/couriers?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to delete courier");
        return;
      }
      fetchCouriers();
    } catch (e: any) {
      console.error("Delete courier error:", e);
      alert(e.message || "Failed to delete courier");
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchCouriers();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const res = await fetch("/api/admin/warehouses", { cache: "no-store" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `Failed to load warehouses (HTTP ${res.status})`);
      if (!Array.isArray(data)) throw new Error("Invalid warehouse response from server");
      setWarehouses(data);
    } catch (e: any) {
      console.error("Load warehouses error:", e);
      setWarehouseError(e.message || "Failed to load warehouses.");
      setWarehouses([]);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const fetchCouriers = async () => {
    try {
      const res = await fetch("/api/admin/couriers", { cache: "no-store" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `Failed to load couriers (HTTP ${res.status})`);
      if (!Array.isArray(data)) throw new Error("Invalid courier response from server");
      setCouriers(data);
    } catch (e: any) {
      console.error("Load couriers error:", e);
      setCourierError(e.message || "Failed to load couriers.");
      setCouriers([]);
    } finally {
      setLoadingCouriers(false);
    }
  };

  // Autocomplete logic
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setWarehouseError(null);
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/geoapify/autocomplete?text=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Address search failed (HTTP ${res.status})`);
        const results = Array.isArray(data.results) ? data.results : [];
        setSuggestions(results);
        if (!results.length && data?.error) setWarehouseError(data.error);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.error("Warehouse address search:", e);
          setSuggestions([]);
          setWarehouseError(e?.message || "Address search failed.");
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleSelectSuggestion = (sg: any) => {
    setWhAddress(sg.formatted);
    setWhLat(sg.lat);
    setWhLon(sg.lon);
    setSearchQuery("");
    setSuggestions([]);
  };

  const handleMapClick = async (lat: number, lon: number) => {
    setWhLat(lat);
    setWhLon(lon);
    try {
      const res = await fetch(`/api/geoapify/reverse?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setWhAddress(data.results[0].formatted);
      }
    } catch (e) {
      console.error("Reverse geocoding failed", e);
    }
  };

  const resetWarehouseForm = () => {
    setWhName("");
    setWhAddress("");
    setWhLat(14.5995);
    setWhLon(120.9842);
    setIsDefaultWh(false);
    setSearchQuery("");
    setEditingWarehouse(null);
    setWarehouseError(null);
  };

  const saveWarehouse = async () => {
    if (!whName.trim()) { setWarehouseError("Warehouse name is required."); return; }
    if (!whAddress.trim()) { setWarehouseError("Warehouse address is required."); return; }
    if (whLat === null || whLon === null || !Number.isFinite(whLat) || !Number.isFinite(whLon)) { setWarehouseError("Please select a map location or address result so coordinates can be assigned."); return; }
    setIsSavingWh(true);
    setWarehouseError(null);
    try {
      const formData = {
        name: whName,
        address: whAddress,
        lat: whLat,
        lon: whLon,
        isDefault: isDefaultWh,
      };

      const method = editingWarehouse ? "PUT" : "POST";
      if (editingWarehouse) (formData as any).id = editingWarehouse.id;

      const res = await fetch("/api/admin/warehouses", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.error || `Failed to save warehouse (HTTP ${res.status})`);
      
      await fetchWarehouses();
      setShowWarehouseModal(false);
      resetWarehouseForm();
    } catch (e: any) {
      console.error("Save warehouse error:", e);
      setWarehouseError(e.message || "Failed to save warehouse. Please try again.");
    } finally {
      setIsSavingWh(false);
    }
  };

  const deleteWarehouse = async (id: string) => {
    if (!confirm("Delete this warehouse?")) return;
    try {
      const res = await fetch(`/api/admin/warehouses?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to delete warehouse (HTTP ${res.status})`);
      await fetchWarehouses();
    } catch (e: any) {
      console.error("Delete warehouse error:", e);
      setWarehouseError(e.message || "Failed to delete warehouse. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("warehouse")}
          className={`flex items-center gap-2 px-6 py-3 font-heading font-bold text-sm tracking-wide uppercase transition-colors border-b-2 ${
            activeTab === "warehouse" ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" /> Warehouses
        </button>
        <button
          onClick={() => setActiveTab("courier")}
          className={`flex items-center gap-2 px-6 py-3 font-heading font-bold text-sm tracking-wide uppercase transition-colors border-b-2 ${
            activeTab === "courier" ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="w-4 h-4" /> Couriers
        </button>
      </div>

      {/* Warehouse View */}
      {activeTab === "warehouse" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-heading font-black text-lg text-slate-900">Fulfillment Centers</h3>
              <p className="text-xs font-mono text-slate-500 mt-1">Manage physical locations where deliveries originate.</p>
            </div>
            <button
              onClick={() => {
                resetWarehouseForm();
                setShowWarehouseModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Warehouse
            </button>
          </div>

          {warehouseError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{warehouseError}</span>
            </div>
          )}

          {loadingWarehouses ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h4 className="text-slate-900 font-bold mb-2">No Warehouses Found</h4>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">You haven't configured any origin locations for your deliveries yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {warehouses.map((wh) => (
                <div key={wh.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative group overflow-hidden">
                  {wh.isDefault && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" /> Default Origin
                    </div>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-heading font-black text-lg text-slate-900 flex items-center gap-2">
                        {wh.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5 leading-relaxed max-w-sm">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                        {wh.address}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex items-center gap-2 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setEditingWarehouse(wh);
                        setWhName(wh.name);
                        setWhAddress(wh.address);
                        setWhLat(wh.lat);
                        setWhLon(wh.lon);
                        setIsDefaultWh(wh.isDefault);
                        setShowWarehouseModal(true);
                      }}
                      className="text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:text-emerald-600 transition-colors bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-md"
                    >
                      Edit Details
                    </button>
                    {!wh.isDefault && (
                      <button
                        onClick={() => deleteWarehouse(wh.id)}
                        className="text-[11px] font-bold uppercase tracking-wider text-red-500 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Courier View */}
      {activeTab === "courier" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-heading font-black text-lg text-slate-900">Courier Services</h3>
              <p className="text-xs font-mono text-slate-500 mt-1">Configure logistics partners and delivery fee calculators.</p>
            </div>
            <button
              onClick={() => {
                resetCourierForm();
                setShowCourierModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Courier
            </button>
          </div>

          {courierError && !showCourierModal && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{courierError}</span>
            </div>
          )}

          {loadingCouriers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : couriers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <Truck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h4 className="text-slate-900 font-bold mb-2">No Couriers Configured</h4>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">
                Add courier services to enable the dynamic delivery fee calculator engine.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {couriers.map((courier) => (
                <div key={courier.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative group overflow-hidden">
                  <div className="flex items-center gap-4 mb-4">
                    {courier.logo ? (
                      <img src={courier.logo} alt={courier.name} className="w-12 h-12 rounded-lg object-contain bg-slate-50 border border-slate-100 p-1 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-heading font-black text-base text-slate-900 uppercase">
                        {courier.name}
                      </h4>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {courier.type}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 text-xs font-mono text-slate-600 mb-6">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Base Fare:</span>
                      <span className="font-bold text-slate-900">₱{courier.baseFare}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">First Mile:</span>
                      <span className="font-bold text-slate-900">{courier.firstMile} km @ ₱{courier.firstMileFee}/km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Excess /km:</span>
                      <span className="font-bold text-slate-900">₱{courier.exceedingKmFee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Surcharge:</span>
                      <span className="font-bold text-slate-900">₱{courier.surcharge}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Night Diff:</span>
                      <span className="font-bold text-slate-900">₱{courier.nightDifferential}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setEditingCourier(courier);
                        setCourierName(courier.name);
                        setCourierLogo(courier.logo || "");
                        setCourierType(courier.type);
                        setBaseFare(courier.baseFare);
                        setFirstMile(courier.firstMile);
                        setFirstMileFee(courier.firstMileFee);
                        setExceedingKmFee(courier.exceedingKmFee);
                        setSurcharge(courier.surcharge);
                        setNightDifferential(courier.nightDifferential);
                        setShowCourierModal(true);
                      }}
                      className="text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:text-emerald-600 transition-colors bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-md"
                    >
                      Edit Config
                    </button>
                    <button
                      onClick={() => deleteCourier(courier.id)}
                      className="text-[11px] font-bold uppercase tracking-wider text-red-500 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warehouse Modal */}
      {showWarehouseModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[430px] overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-heading font-black text-lg uppercase tracking-wide text-slate-900">
                {editingWarehouse ? "Edit Warehouse" : "New Warehouse"}
              </h3>
              <button onClick={() => setShowWarehouseModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Col: Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Internal Name</label>
                  <input
                    type="text"
                    value={whName}
                    onChange={e => setWhName(e.target.value)}
                    placeholder="e.g. Main Distribution Center"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                
                <div className="relative">
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Search Address</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search location in Metro Manila..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-emerald-500" />}
                  </div>
                  
                  {/* Autocomplete Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {suggestions.map((sg, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectSuggestion(sg)}
                          className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 truncate"
                        >
                          <span className="font-bold">{sg.address_line1}</span>
                          <span className="text-slate-500 text-xs block truncate">{sg.address_line2}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Final Mapped Address</label>
                  <textarea
                    value={whAddress}
                    onChange={e => setWhAddress(e.target.value)}
                    rows={3}
                    readOnly
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 focus:outline-none"
                  />
                  <p className="text-[10px] font-mono text-slate-400 mt-1">Automatically populated via Map pin or Search.</p>
                </div>

                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={isDefaultWh}
                    onChange={e => setIsDefaultWh(e.target.checked)}
                    className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-900">Set as Default Origin</span>
                    <span className="block text-[10px] text-slate-500">Other warehouses will be overridden.</span>
                  </div>
                </label>
              </div>

              {/* Right Col: Map */}
              <div className="flex flex-col">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Map Location</label>
                <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-200 relative">
                  {(whLat && whLon) ? (
                    <MapContainer 
                      center={[whLat, whLon]} 
                      zoom={14} 
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <LocationMarker 
                        position={[whLat, whLon]} 
                        setPosition={(pos) => { setWhLat(pos[0]); setWhLon(pos[1]); }}
                        onLocationUpdate={handleMapClick}
                      />
                    </MapContainer>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 text-sm">
                      Loading Map...
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 z-[400] bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-slate-200 text-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-600">CLICK MAP TO DROP PIN</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowWarehouseModal(false)}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveWarehouse}
                disabled={isSavingWh || !whName || !whAddress}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingWh ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Warehouse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Courier Modal */}
      {showCourierModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[430px] overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-heading font-black text-lg uppercase tracking-wide text-slate-900">
                {editingCourier ? "Edit Courier Config" : "New Courier Config"}
              </h3>
              <button onClick={() => setShowCourierModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {courierError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{courierError}</span>
                </div>
              )}

              {/* Quick Presets */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Quick Rate Presets (Philippines)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: "Grab Express", type: "Express", baseFare: 60, firstMile: 3, firstMileFee: 10, exceedingKmFee: 12, surcharge: 0, nightDifferential: 0 },
                    { name: "Lalamove", type: "Express", baseFare: 50, firstMile: 3, firstMileFee: 10, exceedingKmFee: 10, surcharge: 0, nightDifferential: 0 },
                    { name: "Borzo", type: "Express", baseFare: 49, firstMile: 3, firstMileFee: 8, exceedingKmFee: 9, surcharge: 0, nightDifferential: 0 },
                    { name: "J&T Express", type: "Standard", baseFare: 80, firstMile: 5, firstMileFee: 15, exceedingKmFee: 15, surcharge: 0, nightDifferential: 0 },
                    { name: "Standard In-House", type: "Standard", baseFare: 45, firstMile: 2, firstMileFee: 5, exceedingKmFee: 8, surcharge: 0, nightDifferential: 0 },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyCourierPreset(preset)}
                      className="text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                    Logo <span className="text-[10px] font-normal text-slate-400 lowercase">(optional)</span>
                  </label>
                  <div 
                    className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative group"
                    onClick={() => courierFileInputRef.current?.click()}
                  >
                    {isCompressingLogo ? (
                      <div className="text-center p-2">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                        <span className="text-[9px] text-slate-500 font-bold uppercase block mt-1">Optimizing</span>
                      </div>
                    ) : courierLogo ? (
                      <>
                        <img src={courierLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold uppercase">
                          Change
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <Plus className="w-6 h-6 text-slate-300 mx-auto" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mt-1">Upload</span>
                      </div>
                    )}
                  </div>
                  {courierLogo && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCourierLogo("");
                        if (courierFileInputRef.current) courierFileInputRef.current.value = "";
                      }}
                      className="mt-1.5 text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors mx-auto"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                  <input type="file" accept="image/*" ref={courierFileInputRef} onChange={handleCourierLogoUpload} className="hidden" />
                </div>
                
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                      Courier Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={courierName}
                      onChange={e => {
                        setCourierName(e.target.value);
                        if (courierError) setCourierError(null);
                      }}
                      placeholder="e.g. Lalamove, Grab Express"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Service Type</label>
                    <select
                      value={courierType}
                      onChange={e => setCourierType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Express">Express</option>
                      <option value="Priority">Priority</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <h4 className="font-heading font-black text-sm uppercase tracking-wider text-slate-800 mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" /> Delivery Fee Engine
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Base Fare (₱)</label>
                    <input
                      type="number"
                      value={baseFare}
                      onChange={e => setBaseFare(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">First Mile Inc. (KM)</label>
                    <input
                      type="number"
                      value={firstMile}
                      onChange={e => setFirstMile(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">First Mile Fee (₱ / KM)</label>
                    <input
                      type="number"
                      value={firstMileFee}
                      onChange={e => setFirstMileFee(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Exceeding Fee (₱ / KM)</label>
                    <input
                      type="number"
                      value={exceedingKmFee}
                      onChange={e => setExceedingKmFee(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Surcharge (₱)</label>
                    <input
                      type="number"
                      value={surcharge}
                      onChange={e => setSurcharge(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Night Diff. (₱)</label>
                    <input
                      type="number"
                      value={nightDifferential}
                      onChange={e => setNightDifferential(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCourierModal(false)}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCourier}
                disabled={isSavingCourier || isCompressingLogo || !courierName.trim()}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingCourier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isSavingCourier ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
