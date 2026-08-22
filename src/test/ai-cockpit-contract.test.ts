import { describe, expect, it } from "vitest";
import {
  buildCockpitView,
  prepareConversationalAction,
  presentOwnerFinancialPosition,
  recommendTenantMaturity,
  validateAiRecommendation,
  validateCockpitSignal,
  type CockpitSignal,
} from "../lib/core/aiCockpit";

const red: CockpitSignal = {
  id: "signal-red",
  tenantId: "tenant-1",
  severity: "red",
  title: "Cash runway",
  consequence: "Payroll funding may fail.",
  ownerRole: "owner",
  nextAction: "Review collections due today.",
  evidenceRefs: ["qbo:cash-position:1"],
  visibleToRoles: ["owner"],
};

describe("BOS-E06 AI-native cockpit contract", () => {
  it("requires consequence, owner, next action and evidence for red", () => {
    expect(validateCockpitSignal(red)).toEqual(red);
    expect(() => validateCockpitSignal({ ...red, nextAction: null })).toThrow("next action");
  });

  it("applies the same disclosure rule to amber", () => {
    expect(() => validateCockpitSignal({ ...red, severity: "amber", ownerRole: null })).toThrow("owner");
  });

  it("suppresses green detail by default and keeps it drillable", () => {
    const green = { ...red, id: "signal-green", severity: "green" as const, consequence: null, ownerRole: null, nextAction: null, evidenceRefs: [] };
    expect(buildCockpitView({ tenantId: "tenant-1", role: "owner", signals: [red, green] })).toEqual([red]);
    expect(buildCockpitView({ tenantId: "tenant-1", role: "owner", signals: [red, green], includeGreen: true })).toHaveLength(2);
  });

  it("filters signals by Tenant and role", () => {
    expect(buildCockpitView({ tenantId: "tenant-2", role: "owner", signals: [red] })).toEqual([]);
    expect(buildCockpitView({ tenantId: "tenant-1", role: "worker", signals: [red] })).toEqual([]);
  });

  it("sorts red before amber", () => {
    const amber = { ...red, id: "signal-amber", severity: "amber" as const };
    expect(buildCockpitView({ tenantId: "tenant-1", role: "owner", signals: [amber, red] }).map((item) => item.severity)).toEqual(["red", "amber"]);
  });

  it("requires evidence on every AI recommendation", () => {
    expect(() => validateAiRecommendation({ id: "rec-1", tenantId: "tenant-1", statement: "Act now", evidenceRefs: [], uncertainties: [] })).toThrow("supporting evidence");
  });

  it("preserves stated uncertainty", () => {
    const recommendation = validateAiRecommendation({ id: "rec-1", tenantId: "tenant-1", statement: "Review supplier lag", evidenceRefs: ["qbo:bill:2"], uncertainties: ["Invoice not yet received"] });
    expect(recommendation.uncertainties).toEqual(["Invoice not yet received"]);
  });

  it("blocks a conversational action across Tenants", () => {
    const result = prepareConversationalAction(
      { id: "action-1", tenantId: "tenant-1", actionType: "authorise_bill", requiredPermission: "billing.authorise", amount: 200, evidenceRefs: ["proposal-1"], routine: true },
      { actorId: "owner-1", tenantId: "tenant-2", role: "owner", permissions: ["billing.authorise"], approvalLimit: 1000 },
    );
    expect(result.status).toBe("blocked");
  });

  it("blocks a conversational action without permission", () => {
    const result = prepareConversationalAction(
      { id: "action-1", tenantId: "tenant-1", actionType: "authorise_bill", requiredPermission: "billing.authorise", amount: 200, evidenceRefs: ["proposal-1"], routine: true },
      { actorId: "clerk-1", tenantId: "tenant-1", role: "clerk", permissions: [], approvalLimit: 1000 },
    );
    expect(result.status).toBe("blocked");
  });

  it("routes an over-limit action to governed approval", () => {
    const result = prepareConversationalAction(
      { id: "action-1", tenantId: "tenant-1", actionType: "authorise_bill", requiredPermission: "billing.authorise", amount: 1200, evidenceRefs: ["proposal-1"], routine: true },
      { actorId: "manager-1", tenantId: "tenant-1", role: "manager", permissions: ["billing.authorise"], approvalLimit: 1000 },
    );
    expect(result.status).toBe("approval_required");
  });

  it("prepares an authorised routine action without BuildOS staff", () => {
    const result = prepareConversationalAction(
      { id: "action-1", tenantId: "tenant-1", actionType: "authorise_bill", requiredPermission: "billing.authorise", amount: 200, evidenceRefs: ["proposal-1"], routine: true },
      { actorId: "owner-1", tenantId: "tenant-1", role: "owner", permissions: ["billing.authorise"], approvalLimit: 1000 },
    );
    expect(result).toMatchObject({ status: "ready", staffInterventionRequired: false });
  });

  it("allows maturity to advance one proven level only", () => {
    expect(recommendTenantMaturity({
      current: "control_1",
      demonstratedCapabilities: ["delegated_approvals", "daily_cash"],
      requiredCapabilitiesByLevel: { control_2: ["delegated_approvals", "daily_cash"] },
    }).recommended).toBe("control_2");
  });

  it("holds maturity when the next capability is missing", () => {
    expect(recommendTenantMaturity({
      current: "control_1",
      demonstratedCapabilities: ["daily_cash"],
      requiredCapabilitiesByLevel: { control_2: ["delegated_approvals", "daily_cash"] },
    })).toEqual({ recommended: "control_1", missingForNext: ["delegated_approvals"] });
  });

  it("presents the owner hierarchy as cash, contribution, then indicative margin", () => {
    expect(presentOwnerFinancialPosition({
      cashFlow: { amount: 10000, sourceRef: "qbo:cash:1" },
      grossContribution: { amount: 4500, sourceRef: "buildos:jobs:1" },
      indicativeNetMargin: { amount: 1800, sourceRef: "qbo:p-and-l:1", indicative: true },
    }).map((item) => item.metric)).toEqual(["cash_flow", "gross_contribution", "indicative_net_margin"]);
  });
});
