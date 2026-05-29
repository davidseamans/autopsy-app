// Single source of truth for Business Details verification status.
import { supabase } from "@/lib/supabase";

export type BusinessProfile = {
  id?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  abn?: string | null;
  abn_checksum_valid?: boolean | null;
  abr_registered_name?: string | null;
  abr_entity_status?: string | null;
  abr_gst_registered?: boolean | null;
  abr_verified_at?: string | null;
};

const REQUIRED: (keyof BusinessProfile)[] = ["business_name", "contact_name", "phone", "email", "abn"];

export type IdentityAuditRow = {
  id: string;
  business_identity_profile_id: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
};

/**
 * Fetch the change history for a profile, newest first.
 * Returns [] if the audit table is missing or empty (fails soft).
 */
export async function fetchIdentityAudit(profileId: string): Promise<IdentityAuditRow[]> {
  try {
    const { data, error } = await supabase
      .from("business_identity_audit")
      .select("*")
      .eq("business_identity_profile_id", profileId)
      .order("changed_at", { ascending: false });
    if (error) {
      console.warn("[business_identity_audit] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as IdentityAuditRow[];
  } catch (e) {
    console.warn("[business_identity_audit] fetch threw:", e);
    return [];
  }
}

/** A business is Verified only when every gate passes. */
export function isBusinessVerified(p: BusinessProfile | null | undefined): boolean {
  if (!p) return false;
  const filled = REQUIRED.every((k) => String((p as any)[k] ?? "").trim().length > 0);
  return (
    filled &&
    p.abn_checksum_valid === true &&
    String(p.abr_entity_status ?? "").toLowerCase() === "active" &&
    p.abr_gst_registered === true
  );
}

/**
 * Write an audit record for a tracked field change.
 * Targets the `business_identity_audit` table. Fails soft (logs a warning)
 * so a missing audit table never blocks saving the profile.
 */
export async function writeIdentityAudit(
  profileId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from("business_identity_audit").insert({
      business_identity_profile_id: profileId,
      field_name: fieldName,
      old_value: oldValue,
      new_value: newValue,
      changed_at: new Date().toISOString(),
      changed_by: null,
    });
    if (error) console.warn("[business_identity_audit] insert failed:", error.message);
  } catch (e) {
    console.warn("[business_identity_audit] insert threw:", e);
  }
}
