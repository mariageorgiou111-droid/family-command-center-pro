import { immutable, invariant } from './records.mjs';

const keys = Object.freeze([
  'fccProDataV7_6_QA', 'fccProDataV7', 'fccFamilyName', 'fccUserName',
  'fccCurrency', 'fccDateFmt', 'fccThemeMode', 'fccSeasonTheme', 'fccOnboardingV681'
]);

// Only an explicit caller-provided reader is accepted. No browser storage is
// discovered on import, parsed, normalized, repaired or written. Auth keys excluded.
export function captureLocalSnapshot(readValue) {
  invariant(typeof readValue === 'function', 'INVALID_READER', 'An explicit read-only value reader is required.');
  const values = Object.create(null);
  for (const key of keys) {
    const value = readValue(key);
    invariant(value === null || typeof value === 'string', 'INVALID_SOURCE', 'Storage values must be raw strings or null.');
    values[key] = value;
  }
  return immutable({ format: 'fcc-raw-local-snapshot', version: 1, values });
}
