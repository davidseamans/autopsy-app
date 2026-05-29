// ---------------------------------------------------------------------------
// DEV / SIMULATED ABR lookup.
//
// This module is intentionally isolated. It does NOT contact the real
// Australian Business Register. It fabricates a plausible result so the
// Business Details flow can be exercised end to end during development.
//
// To go live: replace `lookupAbr` with a real call to the ABR ABN Lookup
// web services (requires a registered GUID). Keep the same return shape and
// set `simulated: false`. Nothing else in the app needs to change.
// ---------------------------------------------------------------------------
import { normalizeAbn } from "./abn";

export type AbrLookupResult = {
  abn: string;
  registeredName: string;
  entityStatus: string; // e.g. "Active", "Cancelled"
  gstRegistered: boolean;
  verifiedAt: string; // ISO timestamp
  simulated: boolean;
};

const PART_A = ["Apex", "Coastal", "Summit", "Ironbark", "Harbour", "Redgum", "Brightwater", "Sterling"];
const PART_B = ["Cleaning", "Trades", "Logistics", "Property", "Maintenance", "Civil", "Services", "Solutions"];
const SUFFIX = ["Pty Ltd", "Pty Ltd", "Group Pty Ltd"];

/**
 * Simulated ABR lookup. Returns an Active, GST-registered result for any
 * checksum-valid ABN so the verification flow can complete in development.
 * Always flagged `simulated: true` — never treat as production verification.
 */
export async function lookupAbr(abnInput: string): Promise<AbrLookupResult> {
  const abn = normalizeAbn(abnInput);
  // Simulate network latency.
  await new Promise((r) => setTimeout(r, 650));
  const seed = abn.split("").reduce((a, c) => a + Number(c), 0);
  const name = `${PART_A[seed % PART_A.length]} ${PART_B[(seed >> 1) % PART_B.length]} ${SUFFIX[seed % SUFFIX.length]}`;
  return {
    abn,
    registeredName: name,
    entityStatus: "Active",
    gstRegistered: true,
    verifiedAt: new Date().toISOString(),
    simulated: true,
  };
}
