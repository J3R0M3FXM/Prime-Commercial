"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Edit2, Loader2, Plus, RefreshCw, Save, Trash2, Upload, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession, resolveTelegramMedia, uploadStaffImage } from "@/lib/telegram-serverless-client";
import dynamic from "@/lib/browser-dynamic";

const WarehouseMap = dynamic(() => import("./warehouse-map"), { ssr: false });

type Row = Record<string, any>;
type CourierBandForm = { toKm: string; ratePerKm: string };
type CourierForm = { name: string; logo: string; type: string; baseFare: string; surcharge: string; nightDifferential: string; timeBasedFeePerMinute: string; maxDistanceKm: string; pricingBands: CourierBandForm[] };
const emptyCourier = (): CourierForm => ({ name: "", logo: "", type: "Standard", baseFare: "0", surcharge: "0", nightDifferential: "0", timeBasedFeePerMinute: "0", maxDistanceKm: "", pricingBands: [{ toKm: "", ratePerKm: "0" }] });

function courierBandsFromRow(row: Row): CourierBandForm[] {
  if (Array.isArray(row.pricingBands) && row.pricingBands.length) {
    return row.pricingBands.map((band: Row) => ({ toKm: band.toKm == null ? "" : String(band.toKm), ratePerKm: String(band.ratePerKm ?? "") }));
  }
  const firstKm = Number(row.firstMile) || 0;
  return firstKm > 0
    ? [{ toKm: String(firstKm), ratePerKm: String(row.firstMileFee ?? 0) }, { toKm: "", ratePerKm: String(row.exceedingKmFee ?? 0) }]
    : [{ toKm: "", ratePerKm: String(row.exceedingKmFee ?? 0) }];
}

function courierPricingFromForm(form: CourierForm) {
  const maxDistanceKm = form.maxDistanceKm.trim() === "" ? null : Number(form.maxDistanceKm);
  if (maxDistanceKm !== null && (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0)) throw new Error("Maximum distance must be greater than zero.");
  let fromKm = 0;
  const pricingBands = form.pricingBands.map((band, index) => {
    const toKm = band.toKm.trim() === "" ? null : Number(band.toKm);
    const ratePerKm = band.ratePerKm.trim() === "" ? NaN : Number(band.ratePerKm);
    if ((toKm !== null && (!Number.isFinite(toKm) || toKm <= fromKm)) ||
        (toKm === null && index !== form.pricingBands.length - 1) || !Number.isFinite(ratePerKm) || ratePerKm < 0) {
      throw new Error(`Check distance band ${index + 1}: enter a valid end distance and rate.`);
    }
    const result = { fromKm, toKm, ratePerKm };
    if (toKm !== null) fromKm = toKm;
    return result;
  });
  if (!pricingBands.length) throw new Error("Add at least one distance band.");
  const lastEnd = pricingBands[pricingBands.length - 1].toKm;
  if (maxDistanceKm === null && lastEnd !== null) throw new Error("Leave the last band open when there is no maximum distance.");
  if (maxDistanceKm !== null && lastEnd !== null && lastEnd < maxDistanceKm) throw new Error("Bands must cover the maximum distance.");
  return { maxDistanceKm, pricingBands };
}

function previewCourierFare(form: CourierForm, distanceText: string) {
  try {
    const distanceKm = Number(distanceText);
    if (distanceText.trim() === "" || !Number.isFinite(distanceKm) || distanceKm < 0) return "Enter a distance";
    const { maxDistanceKm, pricingBands } = courierPricingFromForm(form);
    if (maxDistanceKm !== null && distanceKm > maxDistanceKm) return "Outside coverage";
    const base = Number(form.baseFare);
    const surcharge = Number(form.surcharge);
    const night = Number(form.nightDifferential);
    if (![base, surcharge, night].every((n) => Number.isFinite(n) && n >= 0)) return "Check charges";
    const distanceFare = pricingBands.reduce((sum, band) => sum + Math.max(0, Math.min(distanceKm, band.toKm ?? distanceKm) - band.fromKm) * band.ratePerKm, 0);
    return `₱${Math.round(base + distanceFare + surcharge + night).toLocaleString("en-PH")}`;
  } catch { return "Complete the distance bands"; }
}

export default function TelegramServerlessLogisticsPanel({ onBack, initialSection = "warehouse" }: { onBack: () => void; initialSection?: "warehouse" | "courier" }) {
  const isWarehouseModule = initialSection === "warehouse";
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warehouses, setWarehouses] = useState<Row[]>([]);
  const [couriers, setCouriers] = useState<Row[]>([]);
  const [warehouseSuggestions, setWarehouseSuggestions] = useState<Row[]>([]);
  const [searchingWarehouseAddress, setSearchingWarehouseAddress] = useState(false);
  const [warehouseAddressError, setWarehouseAddressError] = useState("");
  const [warehouseSearchTimer, setWarehouseSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const warehouseSearchSequence = useRef(0);
  const warehouseReverseSequence = useRef(0);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "", address: "", latitude: "", longitude: "", isDefault: false });
  const [warehouseEditingId, setWarehouseEditingId] = useState("");
  const [courierEditingId, setCourierEditingId] = useState("");
  const [warehouseFormOpen, setWarehouseFormOpen] = useState(false);
  const [courierFormOpen, setCourierFormOpen] = useState(false);
  const [courierForm, setCourierForm] = useState<CourierForm>(emptyCourier);
  const [previewKm, setPreviewKm] = useState("7");

  const load = async () => {
    setBusy(true); setError("");
    try {
      if (isWarehouseModule) {
        const warehouseRows = await callServerless<Row[]>("manageWarehouses", { action: "list" });
        setWarehouses(Array.isArray(warehouseRows) ? warehouseRows : []);
      } else {
        const courierRows = await callServerless<Row[]>("manageCouriers", { action: "list" });
        setCouriers(Array.isArray(courierRows) ? courierRows : []);
      }
    } catch (err: any) { setError(err?.message || "Could not load delivery settings."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then((session) => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open Admin from the Telegram Mini App."); });
    return () => { current = false; };
  }, []);
  useEffect(() => { if (authorized) void load(); }, [authorized, isWarehouseModule]);

  const run = async (work: () => Promise<void>, successText: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await work(); setMessage(successText); }
    catch (err: any) { setError(err?.message || "Could not save delivery settings."); }
    finally { setBusy(false); }
  };
  const saveWarehouse = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await callServerless("manageWarehouses", { action: warehouseEditingId ? "update" : "create", ...(warehouseEditingId ? { id: warehouseEditingId } : {}), ...warehouseForm, latitude: Number(warehouseForm.latitude), longitude: Number(warehouseForm.longitude), isActive: true, sortOrder: warehouses.length });
      setWarehouseEditingId("");
      setWarehouseFormOpen(false);
      setWarehouseForm({ name: "", code: "", address: "", latitude: "", longitude: "", isDefault: false });
      const rows = await callServerless<Row[]>("manageWarehouses", { action: "list" }); setWarehouses(rows);
    }, warehouseEditingId ? "Warehouse updated." : "Warehouse added.");
  };
  const searchWarehouseAddress = (value: string) => {
    const sequence = ++warehouseSearchSequence.current;
    warehouseReverseSequence.current += 1;
    setWarehouseForm((current) => ({ ...current, address: value, latitude: "", longitude: "" }));
    setWarehouseSuggestions([]);
    setWarehouseAddressError("");
    if (warehouseSearchTimer) clearTimeout(warehouseSearchTimer);
    if (value.trim().length < 3) { setSearchingWarehouseAddress(false); return; }
    setSearchingWarehouseAddress(true);
    const timer = setTimeout(async () => {
      try {
        const result = await callServerless<{ results?: Row[] }>("geoapifyAddress", { action: "autocomplete", text: value.trim() }, 20_000);
        if (sequence !== warehouseSearchSequence.current) return;
        setWarehouseSuggestions(Array.isArray(result?.results) ? result.results : []);
        if (!result?.results?.length) setWarehouseAddressError("No matching Philippine addresses. You can enter the address and coordinates manually.");
      } catch (err: any) {
        if (sequence !== warehouseSearchSequence.current) return;
        setWarehouseAddressError(err?.message || "Address suggestions could not be loaded.");
      } finally { if (sequence === warehouseSearchSequence.current) setSearchingWarehouseAddress(false); }
    }, 350);
    setWarehouseSearchTimer(timer);
  };
  const selectWarehouseAddress = (item: Row) => {
    warehouseSearchSequence.current += 1;
    warehouseReverseSequence.current += 1;
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setWarehouseAddressError("This suggestion has no usable coordinates. Choose another result.");
      return;
    }
    if (warehouseSearchTimer) clearTimeout(warehouseSearchTimer);
    setWarehouseForm((current) => ({ ...current, address: String(item.formatted || item.address_line1 || ""), latitude: String(latitude), longitude: String(longitude) }));
    setWarehouseSuggestions([]);
    setWarehouseAddressError("");
    setSearchingWarehouseAddress(false);
  };
  const selectWarehousePin = async (latitude: number, longitude: number) => {
    const sequence = ++warehouseReverseSequence.current;
    warehouseSearchSequence.current += 1;
    if (warehouseSearchTimer) clearTimeout(warehouseSearchTimer);
    setSearchingWarehouseAddress(false);
    setWarehouseForm((current) => ({ ...current, address: "", latitude: String(latitude), longitude: String(longitude) }));
    setWarehouseSuggestions([]);
    setWarehouseAddressError("Looking up this pin with TomTom…");
    try {
      const result = await callServerless<{ results?: Row[] }>("geoapifyAddress", { action: "reverse", lat: latitude, lon: longitude }, 20_000);
      if (sequence !== warehouseReverseSequence.current) return;
      const match = result?.results?.[0];
      if (match) {
        setWarehouseForm((current) => ({ ...current, address: String(match.formatted || match.address_line1 || "") }));
        setWarehouseAddressError("");
      } else {
        setWarehouseAddressError("Pin selected. TomTom returned no street address; the coordinates are retained and you can enter an address.");
      }
    } catch {
      if (sequence === warehouseReverseSequence.current) setWarehouseAddressError("Pin selected, but TomTom could not resolve an address. The coordinates are retained; you can enter an address.");
    }
  };
  const warehouseLat = Number(warehouseForm.latitude);
  const warehouseLon = Number(warehouseForm.longitude);
  const hasWarehouseCoordinates = Number.isFinite(warehouseLat) && warehouseLat >= -90 && warehouseLat <= 90
    && Number.isFinite(warehouseLon) && warehouseLon >= -180 && warehouseLon <= 180
    && Boolean(warehouseForm.latitude && warehouseForm.longitude);
  const saveCourier = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const pricing = courierPricingFromForm(courierForm);
      await callServerless("manageCouriers", { action: courierEditingId ? "update" : "create", ...(courierEditingId ? { id: courierEditingId } : {}),
        name: courierForm.name.trim(), logo: courierForm.logo, type: courierForm.type,
        baseFare: Number(courierForm.baseFare), surcharge: Number(courierForm.surcharge), nightDifferential: Number(courierForm.nightDifferential),
        timeBasedFeePerMinute: Number(courierForm.timeBasedFeePerMinute),
        firstMile: 0, firstMileFee: 0, exceedingKmFee: 0,
        ...pricing, ...(courierEditingId ? {} : { isActive: true, sortOrder: couriers.length }) });
      setCourierEditingId("");
      setCourierFormOpen(false);
      setCourierForm(emptyCourier());
      const rows = await callServerless<Row[]>("manageCouriers", { action: "list" }); setCouriers(rows);
    }, courierEditingId ? "Courier updated." : "Courier added.");
  };
  const updateWarehouse = (row: Row, changes: Row) => run(async () => {
    await callServerless("manageWarehouses", { action: "update", id: row.id, ...changes });
    const rows = await callServerless<Row[]>("manageWarehouses", { action: "list" }); setWarehouses(rows);
  }, "Warehouse updated.");
  const updateCourier = (row: Row, changes: Row) => run(async () => {
    await callServerless("manageCouriers", { action: "update", id: row.id, ...changes });
    const rows = await callServerless<Row[]>("manageCouriers", { action: "list" }); setCouriers(rows);
  }, "Courier updated.");
  const editWarehouse = (row: Row) => {
    setWarehouseFormOpen(true); setError("");
    setWarehouseEditingId(row.id);
    setWarehouseForm({ name: row.name || "", code: row.code || "", address: row.address || "", latitude: String(row.latitude ?? ""), longitude: String(row.longitude ?? ""), isDefault: Boolean(row.isDefault) });
    setMessage("Editing warehouse. Save the form to apply changes.");
  };
  const editCourier = (row: Row) => {
    setCourierFormOpen(true); setError("");
    setCourierEditingId(row.id);
    setCourierForm({ name: row.name || "", logo: row.logo || "", type: row.type || "Standard", baseFare: String(row.baseFare ?? 0), surcharge: String(row.surcharge ?? 0), nightDifferential: String(row.nightDifferential ?? 0), timeBasedFeePerMinute: String(row.timeBasedFeePerMinute ?? 0), maxDistanceKm: row.maxDistanceKm == null ? "" : String(row.maxDistanceKm), pricingBands: courierBandsFromRow(row) });
    setMessage("Editing courier. Save the form to apply changes.");
  };
  const uploadCourierLogo = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try { const logo = await uploadStaffImage(file, "courier-logos"); setCourierForm((current) => ({ ...current, logo })); setMessage("Courier logo uploaded."); }
    catch (err: any) { setError(err?.message || "Could not upload courier logo."); }
    finally { setBusy(false); }
  };
  const remove = (type: "manageWarehouses" | "manageCouriers", id: string) => run(async () => {
    await callServerless(type, { action: "delete", id });
    if (type === "manageWarehouses") setWarehouses(await callServerless<Row[]>(type, { action: "list" }));
    else setCouriers(await callServerless<Row[]>(type, { action: "list" }));
  }, "Entry removed.");

  const emptyWarehouse = () => ({name:"",code:"",address:"",latitude:"",longitude:"",isDefault:false});
  const openNewWarehouse = () => {setWarehouseEditingId("");setWarehouseForm(emptyWarehouse());setWarehouseSuggestions([]);setError("");setWarehouseFormOpen(true);};
  const openNewCourier = () => {setCourierEditingId("");setCourierForm(emptyCourier());setError("");setCourierFormOpen(true);};

  return <main className="serverless-admin-panel" aria-label={isWarehouseModule ? "Warehouse module" : "Courier module"}>
    <header className="serverless-panel-header"><button onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button><div className="serverless-panel-header__copy"><h1>{isWarehouseModule ? "Warehouse" : "Couriers"}</h1><p>{isWarehouseModule ? "Dispatch locations and address search" : "Courier services and delivery rates"}</p></div><button disabled={busy} onClick={()=>void load()} className="serverless-action" aria-label="Refresh list"><RefreshCw className="h-4 w-4"/></button></header>
    {error&&!warehouseFormOpen&&!courierFormOpen&&<div role="alert" className="my-2 border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</div>}{message&&<div role="status" className="my-2 border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">{message}</div>}
    {!authorized?<div className="my-2 border bg-white p-5 text-center text-xs">{busy?<Loader2 className="mx-auto animate-spin"/>:"Checking Telegram admin access…"}</div>:<>
      {isWarehouseModule && <section className="mb-3"><p className="mb-2 text-xs text-slate-600">Manage dispatch addresses and map coordinates used to calculate delivery routes.</p><div className="serverless-panel-toolbar"><strong className="flex-1 text-xs uppercase">Warehouse Locations · {warehouses.length}</strong><button type="button" onClick={openNewWarehouse} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Add</button></div>{warehouses.length===0?<p className="border bg-white p-3 text-xs text-slate-600">No warehouses configured.</p>:<div className="serverless-record-list">{warehouses.map((row)=><article className="serverless-record" key={row.id}><div className="serverless-record__summary"><div className="serverless-record__copy"><strong>{row.name}{row.isDefault?" · Default":""}</strong><small>{row.address||"No address"} · {row.latitude}, {row.longitude}</small></div><button disabled={busy} onClick={()=>editWarehouse(row)} className="serverless-action" aria-label={`Edit ${row.name}`}><Edit2 className="h-4 w-4"/></button><button disabled={busy} onClick={()=>void remove("manageWarehouses",row.id)} className="serverless-action serverless-action--danger" aria-label={`Delete ${row.name}`}><Trash2 className="h-4 w-4"/></button></div><div className="serverless-record__summary border-t border-slate-100"><label className="serverless-switch flex-1"><span>Active</span><input type="checkbox" checked={row.isActive!==false} disabled={busy} onChange={()=>void updateWarehouse(row,{isActive:row.isActive===false})}/><span className="serverless-switch__track"/></label><label className="serverless-switch flex-1"><span>Default</span><input type="checkbox" checked={Boolean(row.isDefault)} disabled={busy} onChange={()=>void updateWarehouse(row,{isDefault:!row.isDefault})}/><span className="serverless-switch__track"/></label></div></article>)}</div>}</section>}

      {!isWarehouseModule && <section><p className="mb-2 text-xs text-slate-600">Configure courier services, delivery rates, and customer-facing options.</p><div className="serverless-panel-toolbar"><strong className="flex-1 text-xs uppercase">Courier Rates · {couriers.length}</strong><button type="button" onClick={openNewCourier} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Add</button></div>{couriers.length===0?<p className="border bg-white p-3 text-xs text-slate-600">No couriers configured.</p>:<div className="serverless-record-list">{couriers.map((row)=><article key={row.id} className="serverless-record"><div className="serverless-record__summary"><CourierLogo reference={String(row.logo||"")}/><div className="serverless-record__copy"><strong>{row.name} · {row.type}</strong><small>Base ₱{row.baseFare} · {courierBandsFromRow(row).map((band, index) => `${index === 0 ? 0 : courierBandsFromRow(row)[index - 1].toKm}–${band.toKm || "∞"} km @ ₱${band.ratePerKm}/km`).join(" · ")} · {row.maxDistanceKm ? `max ${row.maxDistanceKm} km` : "no distance limit"}</small></div><button disabled={busy} onClick={()=>editCourier(row)} className="serverless-action" aria-label={`Edit ${row.name}`}><Edit2 className="h-4 w-4"/></button><button disabled={busy} onClick={()=>void remove("manageCouriers",row.id)} className="serverless-action serverless-action--danger" aria-label={`Delete ${row.name}`}><Trash2 className="h-4 w-4"/></button></div><div className="serverless-record__summary border-t border-slate-100"><label className="serverless-switch flex-1"><span>Active</span><input type="checkbox" checked={row.isActive!==false} disabled={busy} onChange={()=>void updateCourier(row,{isActive:row.isActive===false})}/><span className="serverless-switch__track"/></label></div></article>)}</div>}</section>}
    </>}


    {warehouseFormOpen&&isWarehouseModule&&<div className="serverless-dialog-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setWarehouseFormOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="warehouse-dialog-title" className="serverless-dialog"><header className="serverless-dialog__header"><h2 id="warehouse-dialog-title">{warehouseEditingId?"Edit Warehouse":"Add Warehouse"}</h2><button onClick={()=>setWarehouseFormOpen(false)} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></header><form onSubmit={saveWarehouse} className="serverless-dialog__form"><div className="serverless-dialog__body space-y-2">{error&&<p role="alert" className="text-xs text-red-700">{error}</p>}<div className="serverless-fields"><label className="serverless-field">Warehouse Name<input required value={warehouseForm.name} onChange={(e)=>setWarehouseForm({...warehouseForm,name:e.target.value})}/></label><label className="serverless-field">Code · Optional<input value={warehouseForm.code} onChange={(e)=>setWarehouseForm({...warehouseForm,code:e.target.value})}/></label></div><div className="relative"><label className="serverless-field">Search Address<input autoComplete="off" role="combobox" aria-expanded={warehouseSuggestions.length>0} aria-controls="warehouse-address-suggestions" value={warehouseForm.address} onChange={(e)=>searchWarehouseAddress(e.target.value)} placeholder="Street or place"/></label>{searchingWarehouseAddress&&<span className="text-[9px] text-slate-500">Searching…</span>}{warehouseSuggestions.length>0&&<ul id="warehouse-address-suggestions" role="listbox" className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto border bg-white">{warehouseSuggestions.map((item,index)=><li key={`${item.place_id||item.formatted}-${index}`} role="option" aria-selected="false"><button type="button" className="w-full border-b p-2 text-left text-xs" onClick={()=>selectWarehouseAddress(item)}>{item.formatted||item.address_line1||"Address result"}</button></li>)}</ul>}{warehouseAddressError&&<p className="mt-1 text-[9px] text-amber-700">{warehouseAddressError}</p>}</div><div className="serverless-fields"><label className="serverless-field">Latitude<input type="number" step="any" required value={warehouseForm.latitude} onChange={(e)=>setWarehouseForm({...warehouseForm,latitude:e.target.value})}/></label><label className="serverless-field">Longitude<input type="number" step="any" required value={warehouseForm.longitude} onChange={(e)=>setWarehouseForm({...warehouseForm,longitude:e.target.value})}/></label></div><label className="serverless-switch"><span>Default Dispatch Warehouse</span><input type="checkbox" checked={warehouseForm.isDefault} onChange={(e)=>setWarehouseForm({...warehouseForm,isDefault:e.target.checked})}/><span className="serverless-switch__track"/></label><div className="serverless-disclosure"><strong className="block px-3 pt-2 text-xs">Drop or adjust the warehouse pin</strong><p className="px-3 pb-2 text-[10px] text-slate-600">Tap the map to select coordinates. TomTom will look up the pin address; map tiles are provided by OpenStreetMap.</p><div className="serverless-disclosure__body h-44 overflow-hidden"><WarehouseMap lat={hasWarehouseCoordinates?warehouseLat:14.5995} lon={hasWarehouseCoordinates?warehouseLon:120.9842} showMarker={hasWarehouseCoordinates} interactive onLocationUpdate={(lat: number,lon: number)=>void selectWarehousePin(lat,lon)}/></div></div></div><footer className="serverless-dialog__footer"><button type="button" onClick={()=>setWarehouseFormOpen(false)} className="serverless-action">Cancel</button><button disabled={busy||!warehouseForm.name.trim()||!hasWarehouseCoordinates} className="serverless-action serverless-action--primary"><Save className="h-4 w-4"/>Save Warehouse</button></footer></form></section></div>}

    {courierFormOpen&&!isWarehouseModule&&<div className="serverless-dialog-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setCourierFormOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="courier-dialog-title" className="serverless-dialog">
        <header className="serverless-dialog__header"><h2 id="courier-dialog-title">{courierEditingId?"Edit Courier":"Add Courier"}</h2><button onClick={()=>setCourierFormOpen(false)} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></header>
        <form onSubmit={saveCourier} className="serverless-dialog__form">
          <div className="serverless-dialog__body space-y-3">
            {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
            <div className="serverless-fields">
              <label className="serverless-field">Courier Name<input required value={courierForm.name} onChange={(e)=>setCourierForm({...courierForm,name:e.target.value})}/></label>
              <label className="serverless-field">Service Type<select value={courierForm.type} onChange={(e)=>setCourierForm({...courierForm,type:e.target.value})}><option>Standard</option><option>Express</option><option>Same Day</option><option>Next Day</option></select></label>
              <label className="serverless-field">Base Fare · ₱<input required type="number" min="0" step="0.01" value={courierForm.baseFare} onChange={(e)=>setCourierForm({...courierForm,baseFare:e.target.value})}/></label>
              <label className="serverless-field">Maximum Distance · km<input type="number" min="0.01" step="0.01" placeholder="No limit" value={courierForm.maxDistanceKm} onChange={(e)=>setCourierForm({...courierForm,maxDistanceKm:e.target.value})}/></label>
            </div>
            <div className="serverless-disclosure">
              <div className="flex items-center justify-between gap-2 px-3 py-2"><strong className="text-xs">Distance Rates</strong><button type="button" className="serverless-action" onClick={()=>setCourierForm((current)=>{
                const bands=[...current.pricingBands];
                let start=0;
                for(let i=0;i<bands.length-1;i++) start=Number(bands[i].toKm)||start;
                const last=bands[bands.length-1];
                bands[bands.length-1]={...last,toKm:last.toKm||String(start+1)};
                return {...current,pricingBands:[...bands,{toKm:"",ratePerKm:""}]};
              })}><Plus className="h-3 w-3"/>Band</button></div>
              <div className="space-y-2 px-3 pb-3">
                {courierForm.pricingBands.map((band,index)=>{
                  const fromKm=index===0?"0":courierForm.pricingBands[index-1].toKm;
                  return <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5">
                    <label className="serverless-field">From · km<input value={fromKm} readOnly aria-label={`Band ${index+1} start distance`}/></label>
                    <label className="serverless-field">To · km<input type="number" min="0.01" step="0.01" placeholder={index===courierForm.pricingBands.length-1?"No end":"Required"} value={band.toKm} onChange={(e)=>setCourierForm((current)=>({...current,pricingBands:current.pricingBands.map((item,i)=>i===index?{...item,toKm:e.target.value}:item)}))}/></label>
                    <label className="serverless-field">₱ / km<input required type="number" min="0" step="0.01" value={band.ratePerKm} onChange={(e)=>setCourierForm((current)=>({...current,pricingBands:current.pricingBands.map((item,i)=>i===index?{...item,ratePerKm:e.target.value}:item)}))}/></label>
                    <button type="button" disabled={courierForm.pricingBands.length===1} onClick={()=>setCourierForm((current)=>({ ...current,pricingBands:current.pricingBands.filter((_,i)=>i!==index).map((item,i,array)=>i===array.length-1?{...item,toKm:""}:item) }))} className="serverless-action" aria-label={`Remove band ${index+1}`}><Trash2 className="h-3 w-3"/></button>
                  </div>;
                })}
                <p className="text-[10px] text-slate-600">Each rate applies only to kilometres inside that band. Use ₱0/km for distance included in the base fare.</p>
              </div>
            </div>
            <div className="serverless-fields">
              <label className="serverless-field">Surcharge · ₱<input required type="number" min="0" step="0.01" value={courierForm.surcharge} onChange={(e)=>setCourierForm({...courierForm,surcharge:e.target.value})}/></label>
              <label className="serverless-field">Night Add-On · ₱<input required type="number" min="0" step="0.01" value={courierForm.nightDifferential} onChange={(e)=>setCourierForm({...courierForm,nightDifferential:e.target.value})}/></label>
              <label className="serverless-field">Time Fee · ₱/min<input required type="number" min="0" step="0.01" value={courierForm.timeBasedFeePerMinute} onChange={(e)=>setCourierForm({...courierForm,timeBasedFeePerMinute:e.target.value})}/></label>
              <label className="serverless-field">Preview Distance · km<input type="number" min="0" step="0.01" value={previewKm} onChange={(e)=>setPreviewKm(e.target.value)}/></label>
            </div>
            <p className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs">Distance fare: <strong>{previewCourierFare(courierForm,previewKm)}</strong><span className="block text-[10px] text-slate-600">Preview excludes the time fee.</span></p>
            <details className="serverless-disclosure"><summary>Courier Logo</summary><div className="serverless-disclosure__body flex items-center gap-2"><CourierLogo reference={courierForm.logo}/><label className="serverless-action flex-1 cursor-pointer justify-center"><Upload className="h-4 w-4"/>{busy?"Uploading…":courierForm.logo?"Replace Logo":"Upload Logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e)=>{const file=e.target.files?.[0];e.currentTarget.value="";void uploadCourierLogo(file);}}/></label></div></details>
          </div>
          <footer className="serverless-dialog__footer"><button type="button" onClick={()=>setCourierFormOpen(false)} className="serverless-action">Cancel</button><button disabled={busy||!courierForm.name.trim()} className="serverless-action serverless-action--primary"><Save className="h-4 w-4"/>Save Courier</button></footer>
        </form>
      </section>
    </div>}
  </main>;
}

function CourierLogo({ reference }: { reference: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let live = true; resolveTelegramMedia(reference).then((url)=>{if(live)setSrc(url);}).catch(()=>{if(live)setSrc("");});return()=>{live=false;}; }, [reference]);
  return src ? <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-sm"><img src={src} alt="Courier logo" className="h-full w-full object-fill"/></span> : <span className="grid h-10 w-16 shrink-0 place-items-center border border-slate-200 bg-white text-[8px] text-slate-500 shadow-sm">No Logo</span>;
}
