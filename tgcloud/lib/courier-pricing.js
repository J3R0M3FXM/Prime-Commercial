import { db } from 'sdk';
const key=(id)=>`courier_pricing_${String(id)}`;
export async function getCourierPricing(id){const row=await db.get('SELECT value FROM system_settings WHERE key=:key',{':key':key(id)});try{return row?.value?JSON.parse(row.value):{};}catch{return {};}}
export async function saveCourierPricing(id,value){const pricing={maxDistanceKm:value?.maxDistanceKm==null||value.maxDistanceKm===''?null:Number(value.maxDistanceKm),pricingBands:Array.isArray(value?.pricingBands)?value.pricingBands:[]};await db.run(`INSERT INTO system_settings(key,value,updated_at) VALUES(:key,:value,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=:value,updated_at=unixepoch()`,{':key':key(id),':value':JSON.stringify(pricing)});return pricing;}
