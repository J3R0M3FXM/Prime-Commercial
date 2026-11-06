import { db, EndpointError } from 'sdk';
import { fetch } from 'sdk/fetch';
import { eq } from 'sdk/db';
import { customers, systemSettings } from '../schema.js';
import { isAdminUser } from '../lib/auth.js';

async function getTomTomKey() {
  const row = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, 'tomtom_api_key')).get();
  const value = row?.value;
  const key = typeof value === 'string' ? value.trim() : value && typeof value === 'object' ? String(value.apiKey || '').trim() : '';
  if (!key) throw new EndpointError('Address search is temporarily unavailable. Please use the map pin or try again later.', { code: 'ADDRESS_SEARCH_UNAVAILABLE' });
  return key;
}

function qs(values) { return Object.entries(values).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&'); }

function searchItem(item) {
  if (!item?.position) return null;
  const lat = Number(item.position.lat); const lon = Number(item.position.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = item.address || {}; const poi = item.poi || {};
  const poiName = String(poi.name || '').trim(); const number = String(a.streetNumber || '').trim(); const street = String(a.streetName || '').trim();
  const city = String(a.municipality || a.municipalitySubdivision || '').trim(); const state = String(a.countrySubdivision || '').trim(); const postal = String(a.postalCode || '').trim();
  const line1 = poiName || [number, street].filter(Boolean).join(' ') || a.freeformAddress || 'Selected Location';
  const line2 = [city, state, postal, a.country || 'Philippines'].filter(Boolean).join(', ');
  return { formatted: poiName && a.freeformAddress ? `${poiName}, ${a.freeformAddress}` : (a.freeformAddress || `${line1}, ${line2}`), address_line1: line1, address_line2: line2, lat, lon, result_type: item.type || 'Street', building: poiName || number || undefined, street: street || undefined, city: city || undefined, state: state || undefined, postcode: postal || undefined, confidence: Number(item.score) || undefined };
}

function reverseItem(item, lat, lon) {
  const a = item?.address; if (!a) return null;
  const number = String(a.buildingNumber || a.streetNumber || '').trim(); const street = String(a.streetName || a.street || '').trim();
  const city = String(a.municipality || a.municipalitySubdivision || '').trim(); const state = String(a.countrySubdivision || '').trim(); const postal = String(a.postalCode || '').trim();
  const line1 = [number, street].filter(Boolean).join(' ') || a.freeformAddress || 'Selected Pin Location'; const line2 = [city, state, postal, a.country || 'Philippines'].filter(Boolean).join(', ');
  return { formatted: a.freeformAddress || `${line1}, ${line2}`, address_line1: line1, address_line2: line2, lat, lon, result_type: number ? 'Point Address' : 'Street', building: number || undefined, street: street || undefined, city: city || undefined, state: state || undefined, postcode: postal || undefined };
}

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  const isCustomer = /^[0-9]+$/.test(telegramId) && await db.select({ id: customers.id }).from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!isCustomer && !(await isAdminUser(ctx))) throw new EndpointError('Open the Mini App with your Telegram account before looking up an address.', { code: 'AUTH_REQUIRED' });
  const action = String(input?.action || ''); const key = await getTomTomKey(); let url;
  if (action === 'autocomplete' || action === 'validate') {
    const text = String(input?.text || input?.address || '').trim(); if (text.length < 3 || text.length > 240) throw new EndpointError('Enter an address between 3 and 240 characters.', { code: 'INVALID_INPUT' });
    const params = { key, countrySet: 'PH', limit: action === 'validate' ? 1 : 8, typeahead: action === 'autocomplete' ? 'true' : 'false', language: 'en-US' };
    const lat = Number(input?.lat); const lon = Number(input?.lon); if (Number.isFinite(lat) && Number.isFinite(lon)) { params.lat = lat; params.lon = lon; params.radius = 100000; }
    url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(text)}.json?${qs(params)}`;
  } else if (action === 'reverse') {
    const lat = Number(input?.lat); const lon = Number(input?.lon); if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new EndpointError('Valid coordinates are required.', { code: 'INVALID_INPUT' });
    url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?${qs({ key, radius: input?.type === 'building' ? 100 : 150 })}`;
  } else throw new EndpointError('Unsupported address lookup action.', { code: 'INVALID_ACTION' });
  let response; try { response = await fetch(url); } catch { throw new EndpointError('Could not connect to the address lookup service. Try again shortly.', { code: 'ADDRESS_LOOKUP_NETWORK_ERROR' }); }
  if (!response.ok) throw new EndpointError(response.status === 429 ? 'Address search is busy. Please try again shortly.' : 'Could not complete this address lookup. Please try again shortly.', { code: response.status === 429 ? 'ADDRESS_SEARCH_BUSY' : 'ADDRESS_LOOKUP_FAILED' });
  const data = await response.json().catch(() => null); if (!data) throw new EndpointError('Could not read the address lookup result. Please try again shortly.', { code: 'ADDRESS_LOOKUP_INVALID_RESPONSE' });
  const lat = Number(input?.lat); const lon = Number(input?.lon); const results = action === 'reverse' ? (data.addresses || []).map((x) => reverseItem(x, lat, lon)).filter(Boolean) : (data.results || []).map(searchItem).filter(Boolean);
  if (action === 'validate') return { results, isValid: results.length > 0, status: results.length ? 'verified' : 'unverified', score: results.length ? 'high' : 'low', message: results.length ? 'Address found.' : 'No matching address found.' };
  return { results };
}
