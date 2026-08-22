import type { TenantMaturity } from "./aiCockpit";

export type PublicEntryPath = "apprentice_business_owner" | "established_business";

export interface PublicConversationResult {
  path: PublicEntryPath;
  assessmentStarted: false;
  accountCreated: false;
  tenantCreated: false;
}

export interface ApprenticeControlInvitation {
  candidateId: string;
  identityVerified: boolean;
  autopsyOutcome: "pass" | "not_pass" | "reject";
  firstFiveJobsCompleted: boolean;
  evidenceRefs: string[];
  candidateAcceptedInvitation: boolean;
}

export interface EstablishedBusinessQualification {
  prospectId: string;
  authorisedRepresentativeConfirmed: boolean;
  operatingBusinessConfirmed: boolean;
  jurisdictionConfigurationId: string | null;
  jurisdictionConfigurationValid: boolean;
  qboCompanyReady: boolean;
  qboCompanyReconciledAndApprovedByCustomer: boolean;
  customerManagedConversionAccepted: boolean;
  standardConnectionOnlyAccepted: boolean;
  supportedOperationalBoundaryAccepted: boolean;
  evidenceRefs: string[];
}

export interface EntryDecision {
  path: PublicEntryPath;
  qualified: boolean;
  missing: string[];
  tenantCreationPermitted: boolean;
}

export interface OrientationPeriod {
  tenantId: string;
  startedAt: string;
  reviewDueAt: string;
  standardDays: 90;
  earlyReviewPermitted: boolean;
  pricingTreatment: "standard";
  status: "orientation" | "review_due" | "completed";
}

export interface MaturityRecommendation {
  tenantId: string;
  current: TenantMaturity;
  recommended: TenantMaturity;
  evidenceRefs: string[];
  benefits: string[];
  costs: string[];
  ownerAccepted: boolean;
  provisional: true;
}

export function identifyPublicEntryPath(hasOperatingBusiness: boolean): PublicConversationResult {
  return {
    path: hasOperatingBusiness ? "established_business" : "apprentice_business_owner",
    assessmentStarted: false,
    accountCreated: false,
    tenantCreated: false,
  };
}

export function canResumeDiscover(identityVerified: boolean): boolean {
  return identityVerified;
}

export function qualifyApprenticeForControl(input: ApprenticeControlInvitation): EntryDecision {
  const missing: string[] = [];
  if (!input.identityVerified) missing.push("verified_identity");
  if (input.autopsyOutcome !== "pass") missing.push("autopsy_pass");
  if (!input.firstFiveJobsCompleted) missing.push("first_five_jobs_completion");
  if (input.evidenceRefs.length === 0) missing.push("progression_evidence");
  if (!input.candidateAcceptedInvitation) missing.push("voluntary_acceptance");
  return {
    path: "apprentice_business_owner",
    qualified: missing.length === 0,
    missing,
    tenantCreationPermitted: missing.length === 0,
  };
}

export function qualifyEstablishedBusiness(input: EstablishedBusinessQualification): EntryDecision {
  const missing: string[] = [];
  if (!input.authorisedRepresentativeConfirmed) missing.push("authorised_representative");
  if (!input.operatingBusinessConfirmed) missing.push("operating_business");
  if (!input.jurisdictionConfigurationId || !input.jurisdictionConfigurationValid) missing.push("valid_jurisdiction_configuration");
  if (!input.qboCompanyReady) missing.push("qbo_company_ready");
  if (!input.qboCompanyReconciledAndApprovedByCustomer) missing.push("customer_approved_qbo_company");
  if (!input.customerManagedConversionAccepted) missing.push("customer_managed_conversion");
  if (!input.standardConnectionOnlyAccepted) missing.push("standard_connection_boundary");
  if (!input.supportedOperationalBoundaryAccepted) missing.push("supported_operational_boundary");
  if (input.evidenceRefs.length === 0) missing.push("qualification_evidence");
  return {
    path: "established_business",
    qualified: missing.length === 0,
    missing,
    tenantCreationPermitted: missing.length === 0,
  };
}

export function startEstablishedBusinessOrientation(input: {
  tenantId: string;
  qualification: EntryDecision;
  startedAt: string;
}): OrientationPeriod {
  if (!input.qualification.qualified || input.qualification.path !== "established_business") {
    throw new Error("Established Business Orientation requires completed direct-entry qualification.");
  }
  if (!input.tenantId.trim()) throw new Error("Tenant identity is required after qualification.");
  const start = Date.parse(input.startedAt);
  if (!Number.isFinite(start)) throw new Error("Orientation start must be a valid timestamp.");
  const reviewDueAt = new Date(start);
  reviewDueAt.setUTCDate(reviewDueAt.getUTCDate() + 90);
  return {
    tenantId: input.tenantId,
    startedAt: input.startedAt,
    reviewDueAt: reviewDueAt.toISOString(),
    standardDays: 90,
    earlyReviewPermitted: true,
    pricingTreatment: "standard",
    status: "orientation",
  };
}

export function createMaturityRecommendation(input: MaturityRecommendation): MaturityRecommendation {
  if (!input.tenantId.trim()) throw new Error("Maturity recommendation requires Tenant identity.");
  if (input.evidenceRefs.length === 0) throw new Error("Maturity recommendation requires evidence.");
  if (input.current === input.recommended) throw new Error("A progression recommendation must propose a different maturity level.");
  if (input.benefits.length === 0 || input.costs.length === 0) {
    throw new Error("A progression recommendation must explain costs and benefits.");
  }
  return { ...input, provisional: true };
}
