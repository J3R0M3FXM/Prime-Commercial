export function resolveTrustedFingerprint(customer, submitted = {}) {
  const fingerprints = Array.isArray(customer?.fingerprints) ? customer.fingerprints : [];
  const sessionToken = String(submitted.sessionToken || '').trim();
  const submittedDeviceId = String(submitted.deviceId || '').trim();
  const submittedHardwareId = String(submitted.hardwareId || '').trim();
  const submittedFingerprintId = String(submitted.deviceFingerprintId || '').trim();
  let matched = null;

  if (sessionToken) matched = fingerprints.find((fp) => String(fp?.sessionToken || '').trim() === sessionToken) || null;
  if (!matched && submittedDeviceId) matched = fingerprints.find((fp) => String(fp?.deviceId || '').trim() === submittedDeviceId) || null;
  if (!matched && submittedHardwareId) matched = fingerprints.find((fp) => String(fp?.hardwareId || '').trim() === submittedHardwareId) || null;
  if (!matched && submittedFingerprintId) matched = fingerprints.find((fp) => String(fp?.deviceFingerprintId || '').trim() === submittedFingerprintId) || null;

  const source = matched || submitted;
  return {
    sessionToken: String(source?.sessionToken || sessionToken).trim(),
    deviceId: String(source?.deviceId || '').trim(),
    hardwareId: String(source?.hardwareId || '').trim(),
    deviceFingerprintId: String(source?.deviceFingerprintId || '').trim(),
    matched: Boolean(matched),
  };
}
