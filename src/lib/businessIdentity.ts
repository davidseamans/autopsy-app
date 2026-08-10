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
  verification_source?: string | null;
};

export type PublicBusinessProfile = {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  abn: string;
  registeredName: string;
  entityStatus: string;
  gstRegistered: boolean;
  verifiedAt: string;
  verified: boolean;
};

export type IdentityAuditRow = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
};

const REQUIRED: (keyof BusinessProfile)[] = ["business_name", "contact_name", "phone", "email", "abn"];

export function isBusinessVerified(p: BusinessProfile | null | undefined): boolean {
  if (!p) return false;
  const filled = REQUIRED.every((key) => String(p[key] ?? "").trim().length > 0);
  return (
    filled &&
    p.abn_checksum_valid === true &&
    String(p.abr_entity_status ?? "").toLowerCase() === "active" &&
    p.abr_gst_registered === true &&
    p.verification_source === "abr_web_services"
  );
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("A valid session is required.");
  return data.session.access_token;
}

async function requestBusinessIdentity<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Business Details request failed.");
  return payload as T;
}

export async function fetchBusinessIdentity(runId: string) {
  return requestBusinessIdentity<{
    profile: PublicBusinessProfile | null;
    history: IdentityAuditRow[];
  }>(`/api/business-identity?runId=${encodeURIComponent(runId)}`);
}

export async function verifyAndSaveBusinessIdentity(input: {
  runId: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  abn: string;
}) {
  return requestBusinessIdentity<{ profile: PublicBusinessProfile }>("/api/business-identity", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBusinessName(input: { runId: string; businessName: string }) {
  return requestBusinessIdentity<{ profile: PublicBusinessProfile }>("/api/business-identity", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
