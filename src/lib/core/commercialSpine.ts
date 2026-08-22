export const COMMERCIAL_ACTIVATION_REQUIREMENTS = [
  "scopeConfirmed",
  "fundingConfirmed",
  "capacityConfirmed",
  "operationalReadinessConfirmed",
] as const;

export type CommercialActivationRequirement =
  (typeof COMMERCIAL_ACTIVATION_REQUIREMENTS)[number];

export interface CommercialActivationEvidence {
  scopeConfirmed: boolean;
  fundingConfirmed: boolean;
  capacityConfirmed: boolean;
  operationalReadinessConfirmed: boolean;
}

export interface CommercialActivationDecision {
  ready: boolean;
  missing: CommercialActivationRequirement[];
}

export function evaluateCommercialActivation(
  evidence: CommercialActivationEvidence,
): CommercialActivationDecision {
  const missing = COMMERCIAL_ACTIVATION_REQUIREMENTS.filter(
    (requirement) => !evidence[requirement],
  );

  return {
    ready: missing.length === 0,
    missing,
  };
}

export const COMMERCIAL_LINEAGE = [
  "account",
  "contact",
  "lead",
  "opportunity",
  "scopeVersion",
  "quoteVersion",
  "acceptance",
  "commercialBaseline",
  "jobActivation",
] as const;
