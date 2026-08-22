import { describe, expect, it } from "vitest";
import {
  canResumeDiscover,
  createMaturityRecommendation,
  identifyPublicEntryPath,
  qualifyApprenticeForControl,
  qualifyEstablishedBusiness,
  startEstablishedBusinessOrientation,
  type EstablishedBusinessQualification,
} from "../lib/core/entryOrientation";

const established: EstablishedBusinessQualification = {
  prospectId: "prospect-1",
  authorisedRepresentativeConfirmed: true,
  operatingBusinessConfirmed: true,
  jurisdictionConfigurationId: "au-2026-01",
  jurisdictionConfigurationValid: true,
  qboCompanyReady: true,
  qboCompanyReconciledAndApprovedByCustomer: true,
  customerManagedConversionAccepted: true,
  standardConnectionOnlyAccepted: true,
  supportedOperationalBoundaryAccepted: true,
  evidenceRefs: ["preflight-1"],
};

describe("BOS-E07 entry, Orientation and maturity contract", () => {
  it("identifies the two paths without silently starting assessment or identity", () => {
    expect(identifyPublicEntryPath(false)).toEqual({
      path: "apprentice_business_owner",
      assessmentStarted: false,
      accountCreated: false,
      tenantCreated: false,
    });
    expect(identifyPublicEntryPath(true).path).toBe("established_business");
  });

  it("requires verified identity to resume Discover", () => {
    expect(canResumeDiscover(false)).toBe(false);
    expect(canResumeDiscover(true)).toBe(true);
  });

  it("makes Apprentice progression evidence-based and voluntary", () => {
    expect(qualifyApprenticeForControl({
      candidateId: "candidate-1",
      identityVerified: true,
      autopsyOutcome: "pass",
      firstFiveJobsCompleted: true,
      evidenceRefs: ["closeout-1"],
      candidateAcceptedInvitation: true,
    })).toMatchObject({ qualified: true, tenantCreationPermitted: true });
  });

  it("blocks Apprentice progression after not-pass or rejection", () => {
    expect(qualifyApprenticeForControl({
      candidateId: "candidate-1",
      identityVerified: true,
      autopsyOutcome: "not_pass",
      firstFiveJobsCompleted: false,
      evidenceRefs: ["closeout-1"],
      candidateAcceptedInvitation: false,
    }).tenantCreationPermitted).toBe(false);
  });

  it("allows an Established Business to bypass Apprentice only after strict qualification", () => {
    expect(qualifyEstablishedBusiness(established)).toEqual({
      path: "established_business",
      qualified: true,
      missing: [],
      tenantCreationPermitted: true,
    });
  });

  it("requires QBO to be customer-reconciled and approved", () => {
    expect(qualifyEstablishedBusiness({ ...established, qboCompanyReconciledAndApprovedByCustomer: false }).missing).toContain("customer_approved_qbo_company");
  });

  it("requires customer-managed conversion and the standard connection boundary", () => {
    const decision = qualifyEstablishedBusiness({ ...established, customerManagedConversionAccepted: false, standardConnectionOnlyAccepted: false });
    expect(decision.missing).toEqual(expect.arrayContaining(["customer_managed_conversion", "standard_connection_boundary"]));
  });

  it("requires a valid versioned jurisdiction configuration", () => {
    expect(qualifyEstablishedBusiness({ ...established, jurisdictionConfigurationValid: false }).missing).toContain("valid_jurisdiction_configuration");
  });

  it("does not permit Tenant creation while qualification is incomplete", () => {
    expect(qualifyEstablishedBusiness({ ...established, authorisedRepresentativeConfirmed: false }).tenantCreationPermitted).toBe(false);
  });

  it("starts the standard 90-day Orientation only after qualification", () => {
    const orientation = startEstablishedBusinessOrientation({
      tenantId: "tenant-1",
      qualification: qualifyEstablishedBusiness(established),
      startedAt: "2026-08-22T00:00:00Z",
    });
    expect(orientation).toMatchObject({ standardDays: 90, earlyReviewPermitted: true, pricingTreatment: "standard" });
    expect(orientation.reviewDueAt).toBe("2026-11-20T00:00:00.000Z");
  });

  it("rejects Orientation before qualification", () => {
    expect(() => startEstablishedBusinessOrientation({
      tenantId: "tenant-1",
      qualification: qualifyEstablishedBusiness({ ...established, qboCompanyReady: false }),
      startedAt: "2026-08-22T00:00:00Z",
    })).toThrow("completed direct-entry qualification");
  });

  it("keeps maturity recommendations provisional and explains value", () => {
    expect(createMaturityRecommendation({
      tenantId: "tenant-1",
      current: "control_1",
      recommended: "control_2",
      evidenceRefs: ["orientation-review-1"],
      benefits: ["delegated approvals"],
      costs: ["higher standard subscription"],
      ownerAccepted: false,
      provisional: true,
    })).toMatchObject({ provisional: true, ownerAccepted: false });
  });
});
