import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { authenticateRequest, createServiceClient } from "./_lib/supabase-server.js";
import { lookupAbr } from "./_lib/abr-lookup.js";
import { isValidAbnChecksum, normalizeAbn } from "../src/lib/abn.js";

const READY_VERDICT = "Ready for Test Run";

const requestSchema = z.object({
  runId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(320),
  abn: z.string().trim().min(1).max(30),
});

const tradingNameSchema = z.object({
  runId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(200),
});

function publicProfile(row: Record<string, unknown> | null) {
  if (!row) return null;
  const verified =
    row.abn_checksum_valid === true &&
    String(row.abr_entity_status ?? "").toLowerCase() === "active" &&
    row.abr_gst_registered === true &&
    row.verification_source === "abr_web_services";
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    abn: row.abn,
    registeredName: row.abr_registered_name,
    entityStatus: row.abr_entity_status,
    gstRegistered: row.abr_gst_registered === true,
    verifiedAt: row.abr_verified_at,
    verified,
  };
}

async function requireEligibleRun(
  service: ReturnType<typeof createServiceClient>,
  runId: string,
  userId: string,
) {
  const { data, error } = await service
    .from("autopsy_runs")
    .select("id,status,verdict_name,final_verdict,hard_fail_triggered")
    .eq("id", runId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false as const, status: 404, error: "Autopsy run not found." };
  const verdict = data.final_verdict || data.verdict_name;
  if (data.status !== "completed" || data.hard_fail_triggered || verdict !== READY_VERDICT) {
    return {
      ok: false as const,
      status: 403,
      error: "This Autopsy run is not cleared for First 5 Jobs.",
    };
  }
  return { ok: true as const };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });

    const requestBody = (req.body ?? {}) as Record<string, unknown>;
    const queryRunId = Array.isArray(req.query.runId) ? req.query.runId[0] : req.query.runId;
    const runId = String(req.method === "GET" ? queryRunId ?? "" : requestBody.runId ?? "");
    if (!z.string().uuid().safeParse(runId).success) {
      return res.status(400).json({ error: "A valid Autopsy run is required." });
    }

    const service = createServiceClient();
    const eligibility = await requireEligibleRun(service, runId, user.id);
    if (!eligibility.ok) return res.status(eligibility.status).json({ error: eligibility.error });

    if (req.method === "GET") {
      const { data, error } = await service
        .from("business_identity_profile")
        .select("*")
        .eq("owner_user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      let history: unknown[] = [];
      if (data?.id) {
        const audit = await service
          .from("business_identity_audit")
          .select("id,field_name,old_value,new_value,changed_at")
          .eq("business_identity_profile_id", data.id)
          .order("changed_at", { ascending: false });
        if (audit.error) throw audit.error;
        history = audit.data ?? [];
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ profile: publicProfile(data), history });
    }

    if (req.method === "PATCH") {
      const parsedName = tradingNameSchema.safeParse(requestBody);
      if (!parsedName.success) {
        return res.status(400).json({ error: "Enter the business name you will show customers." });
      }
      const { data: existing, error: existingError } = await service
        .from("business_identity_profile")
        .select("*")
        .eq("owner_user_id", user.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing || !publicProfile(existing)?.verified) {
        return res.status(409).json({ error: "Verify the complete Business Details before changing the business name." });
      }
      const { data, error } = await service
        .from("business_identity_profile")
        .update({ business_name: parsedName.data.businessName, updated_at: new Date().toISOString() })
        .eq("owner_user_id", user.id)
        .select("*")
        .single();
      if (error) throw error;
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ profile: publicProfile(data) });
    }

    const parsed = requestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return res.status(400).json({ error: "Complete all required Business Details." });
    }

    const { data: existing, error: existingError } = await service
      .from("business_identity_profile")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return res.status(409).json({
        error: "Business identity is locked after verification. Only the customer-facing business name can be changed.",
      });
    }

    const abn = normalizeAbn(parsed.data.abn);
    if (!isValidAbnChecksum(abn)) {
      return res.status(422).json({ error: "That ABN is not valid. Check the number and try again." });
    }

    const guid = process.env.ABR_AUTHENTICATION_GUID;
    if (!guid) {
      return res.status(503).json({ error: "ABN verification is temporarily unavailable." });
    }

    const abr = await lookupAbr(abn, guid);
    if (abr.entityStatus.toLowerCase() !== "active") {
      return res.status(422).json({ error: "This ABN is not active." });
    }
    if (!abr.gstRegistered) {
      return res.status(422).json({
        error: "First 5 Jobs currently requires an active ABN that is registered for GST.",
      });
    }

    const payload = {
      owner_user_id: user.id,
      source_autopsy_run_id: runId,
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      abn,
      gst_registered_confirmed: true,
      abn_checksum_valid: true,
      abr_registered_name: abr.registeredName,
      abr_entity_status: abr.entityStatus,
      abr_gst_registered: true,
      abr_verified_at: abr.verifiedAt,
      verification_source: abr.source,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await service
      .from("business_identity_profile")
      .upsert(payload, { onConflict: "owner_user_id" })
      .select("*")
      .single();
    if (error) throw error;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ profile: publicProfile(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "abn_not_found") return res.status(422).json({ error: "That ABN was not found." });
    if (message === "abr_service_unavailable") {
      return res.status(503).json({ error: "ABN Lookup did not respond. Please try again." });
    }
    console.error("Business identity request failed", error);
    return res.status(500).json({ error: "Business Details could not be verified." });
  }
}
