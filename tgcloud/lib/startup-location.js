import { db } from 'sdk';
import { eq } from 'sdk/db';
import { fetch } from 'sdk/fetch';
import { systemSettings } from '../schema.js';
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

async function settingKey(key) {
  const row = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, key)).get();
  const value = row?.value;
  return typeof value === 'string' ? value.trim() : value && typeof value === 'object' ? String(value.apiKey || '').trim() : '';
}

function validIp(value) {
  const ip = String(value || '').trim();
  if (!ip || ip.length > 64 || /[^0-9a-fA-F:.]/.test(ip)) return '';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return '';
  }
  if (ip.includes(':') && !/^[0-9a-fA-F:]+$/.test(ip)) return '';
  return ip;
}

async function reverseGeocodeWithTomTom(lat, lon) {
  const apiKey = await settingKey('tomtom_api_key');
  const latitude = Number(lat), longitude = Number(lon);
  if (!apiKey || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  try {
    const url = 'https://api.tomtom.com/search/2/reverseGeocode/' + latitude + ',' + longitude + '.json?key=' + encodeURIComponent(apiKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const address = data?.addresses?.[0]?.address;
    if (!address?.freeformAddress) return null;
    return {
      formatted: text(address.freeformAddress, 500),
      street: text(address.streetName || address.street, 180),
      houseNumber: text(address.buildingNumber || address.streetNumber, 40),
      postcode: text(address.postalCode, 24),
      city: text(address.municipality || address.municipalitySubdivision, 120),
      subdivision: text(address.countrySubdivision, 120),
      country: text(address.country, 100), provider: 'TomTom',
    };
  } catch { return null; }
}

export async function enrichStartupLocationSignals(fingerprint, deliveryAddress) {
  for (const key of ['deviceGps', 'deviceLocationObservation']) {
    const point = fingerprint?.[key];
    if (!point) continue;
    const geo = await reverseGeocodeWithTomTom(point.lat, point.lon);
    fingerprint[key] = { ...point, reverseGeocodedAddress: geo?.formatted || point.reverseGeocodedAddress || '',
      reverseGeocodingProvider: geo ? 'TomTom' : point.reverseGeocodingProvider || '', reverseGeocodingDetails: geo };
  }
  const addressGeo = await reverseGeocodeWithTomTom(deliveryAddress?.lat, deliveryAddress?.lon);
  deliveryAddress.geocodedAddress = addressGeo?.formatted || deliveryAddress.geocodedAddress || '';
  deliveryAddress.geocodingProvider = addressGeo ? 'TomTom' : deliveryAddress.geocodingProvider || '';
  deliveryAddress.geocodingDetails = addressGeo;

  const ip = validIp(fingerprint?.clientObservedIp);
  const ipLocateKey = ip ? await settingKey('iplocate_api_key') : '';
  if (!ip || !ipLocateKey) {
    fingerprint.ipLocation = { ip, status: ip ? 'IP lookup unavailable' : 'IP not observed', verified: false,
      source: 'Browser-observed IP · approximate only' };
    return;
  }
  try {
    const response = await fetch('https://www.iplocate.io/api/lookup/' + encodeURIComponent(ip) + '?apikey=' + encodeURIComponent(ipLocateKey));
    if (!response.ok) throw new Error('IP lookup failed');
    const data = await response.json();
    const latitude = data?.latitude == null ? NaN : Number(data.latitude);
    const longitude = data?.longitude == null ? NaN : Number(data.longitude);
    const areaGeo = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? await reverseGeocodeWithTomTom(latitude, longitude) : null;
    fingerprint.ipLocation = {
      ip: text(data?.ip || ip, 64), verified: false, provider: 'IPLocate',
      precision: 'Approximate network area', source: 'Browser-observed IP · approximate network location',
      country: text(data?.country, 100), countryCode: text(data?.country_code, 4), city: text(data?.city, 120),
      subdivision: text(data?.subdivision, 120), postalCode: text(data?.postal_code, 24),
      latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null,
      reverseGeocodedAddress: areaGeo?.formatted || '', reverseGeocodingProvider: areaGeo ? 'TomTom' : '',
      timezone: text(data?.time_zone, 80), asn: text(data?.asn?.asn, 40), route: text(data?.asn?.route, 80),
      isp: text(data?.company?.name || data?.asn?.name, 180), ispDomain: text(data?.company?.domain || data?.asn?.domain, 160),
      privacy: {
        isAbuser: Boolean(data?.privacy?.is_abuser), isAnonymous: Boolean(data?.privacy?.is_anonymous),
        isProxy: Boolean(data?.privacy?.is_proxy), isTor: Boolean(data?.privacy?.is_tor),
        isVpn: Boolean(data?.privacy?.is_vpn), isHosting: Boolean(data?.privacy?.is_hosting),
        isIcloudRelay: Boolean(data?.privacy?.is_icloud_relay), isBogon: Boolean(data?.privacy?.is_bogon),
      }, status: 'complete',
    };
  } catch {
    fingerprint.ipLocation = { ip, provider: 'IPLocate', status: 'IP lookup failed', verified: false,
      source: 'Browser-observed IP · approximate only' };
  }
}
