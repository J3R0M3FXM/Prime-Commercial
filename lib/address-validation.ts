export interface AddressValidationResult {
  isValid: boolean;
  score: "high" | "medium" | "low" | "invalid";
  status: "verified" | "warning" | "error";
  message: string;
  formattedAddress?: string;
  missingFields: string[];
}

/**
 * Perform client-side validation on address, unit details, and pin coordinates.
 */
export function validateAddressLocally(
  address: string,
  unitDetails?: string,
  coords?: { lat: number; lon: number }
): AddressValidationResult {
  const missingFields: string[] = [];
  const cleanAddr = (address || "").trim();

  // 1. Check if empty
  if (!cleanAddr) {
    return {
      isValid: false,
      score: "invalid",
      status: "error",
      message: "Delivery address cannot be empty. Please search or select an address.",
      missingFields: ["address", "coords"],
    };
  }

  // 2. Check minimum length
  if (cleanAddr.length < 6) {
    return {
      isValid: false,
      score: "low",
      status: "error",
      message: "Address is too short. Please include street name, village, building, or landmark.",
      missingFields: ["street_name"],
    };
  }

  // 3. Check coordinates validity (Philippines bounds roughly: Lat 4.5 to 21.5, Lon 116.0 to 127.0)
  if (!coords || !coords.lat || !coords.lon || (coords.lat === 14.5995 && coords.lon === 120.9842 && !cleanAddr)) {
    return {
      isValid: false,
      score: "low",
      status: "error",
      message: "Location pin missing. Please drop a pin on the map or select a suggested address.",
      missingFields: ["coords"],
    };
  }

  const isWithinPH = coords.lat >= 4.5 && coords.lat <= 21.5 && coords.lon >= 116.0 && coords.lon <= 127.0;
  if (!isWithinPH) {
    return {
      isValid: false,
      score: "invalid",
      status: "error",
      message: "Selected location is outside supported delivery coverage (Philippines).",
      missingFields: ["ph_location"],
    };
  }

  // 4. Check for house / unit / building details
  const hasUnitOrBuilding = (unitDetails || "").trim().length > 0;
  const hasNumbers = /\d/.test(cleanAddr) || /\d/.test(unitDetails || "");

  if (!hasNumbers && !hasUnitOrBuilding) {
    missingFields.push("unit_building");
  }

  if (missingFields.length > 0) {
    return {
      isValid: true,
      score: "medium",
      status: "warning",
      message: "Address pin is confirmed. Adding house/unit number or building name helps ensure fast courier delivery.",
      missingFields,
      formattedAddress: cleanAddr,
    };
  }

  return {
    isValid: true,
    score: "high",
    status: "verified",
    message: "Address verified with high delivery precision.",
    missingFields: [],
    formattedAddress: cleanAddr,
  };
}
