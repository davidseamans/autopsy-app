import { isValidAbnChecksum, normalizeAbn } from "../../src/lib/abn.js";

const ABR_JSON_ENDPOINT = "https://abr.business.gov.au/json/AbnDetails.aspx";

export type VerifiedAbrRecord = {
  abn: string;
  registeredName: string;
  entityStatus: string;
  gstRegistered: boolean;
  verifiedAt: string;
  source: "abr_web_services";
};

type AbrJsonResponse = {
  Abn?: string;
  AbnStatus?: string;
  BusinessName?: string[];
  EntityName?: string;
  Gst?: string;
  Message?: string;
};

function parseJsonp(body: string): AbrJsonResponse {
  const trimmed = body.trim();
  const match = trimmed.match(/^[^(]+\((.*)\);?$/s);
  const json = match?.[1] ?? trimmed;
  return JSON.parse(json) as AbrJsonResponse;
}

export async function lookupAbr(
  abnInput: string,
  authenticationGuid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedAbrRecord> {
  const abn = normalizeAbn(abnInput);
  if (!isValidAbnChecksum(abn)) {
    throw new Error("invalid_abn_checksum");
  }
  if (!authenticationGuid.trim()) {
    throw new Error("abr_not_configured");
  }

  const url = new URL(ABR_JSON_ENDPOINT);
  url.searchParams.set("abn", abn);
  url.searchParams.set("callback", "abrCallback");
  url.searchParams.set("guid", authenticationGuid.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/javascript, application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error("abr_service_unavailable");

  const record = parseJsonp(await response.text());
  if (record.Message?.trim()) throw new Error("abn_not_found");

  const returnedAbn = normalizeAbn(record.Abn ?? "");
  if (returnedAbn !== abn) throw new Error("abn_not_found");

  return {
    abn,
    registeredName:
      record.EntityName?.trim() || record.BusinessName?.find(Boolean)?.trim() || "",
    entityStatus: record.AbnStatus?.trim() || "Unknown",
    gstRegistered: Boolean(record.Gst?.trim()),
    verifiedAt: new Date().toISOString(),
    source: "abr_web_services",
  };
}
