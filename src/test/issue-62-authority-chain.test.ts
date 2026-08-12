import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";


const migration = readFileSync(
  resolve("supabase/migrations/20260811192225_issue_62_authority_chain.sql"),
  "utf8",
);
const webhookConflictFix = readFileSync(
  resolve("supabase/migrations/20260812014502_fix_paid_checkout_order_conflict.sql"),
  "utf8",
);
const contextReferenceRepair = readFileSync(
  resolve("supabase/migrations/20260812021500_repair_autopsy_context_reference_data.sql"),
  "utf8",
);
const paidAutopsyResume = readFileSync(
  resolve("supabase/migrations/20260812022500_resume_paid_autopsy_before_consuming.sql"),
  "utf8",
);
const canonicalAssessmentSeed = readFileSync(
  resolve("supabase/migrations/20260812024500_seed_canonical_autopsy_assessment.sql"),
  "utf8",
);
const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
const readiness = readFileSync(resolve("src/pages/ReadinessWorksheet.tsx"), "utf8");
const admission = readFileSync(resolve("src/lib/stage1Admission.ts"), "utf8");
const webhook = readFileSync(resolve("api/stripe/webhook.ts"), "utf8");
const checkoutStatus = readFileSync(resolve("api/stripe/checkout-status.ts"), "utf8");
const checkoutPanel = readFileSync(
  resolve("src/components/autopsy/AutopsyCheckoutPanel.tsx"),
  "utf8",
);


describe("Issue #62 governed authority chain", () => {
  it("binds one paid entitlement to one run and resumes only that in-progress run", () => {
    expect(migration).toContain("autopsy_entitlements_autopsy_run_id_key");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("e.status = 'consumed'");
    expect(migration).toContain("r.owner_user_id = v_actor_uid");
    expect(migration).toContain("r.status = 'in_progress'");
    expect(migration).toContain("where id = v_entitlement.id and status = 'active'");
    expect(migration).toContain("Autopsy admission was consumed concurrently");
  });

  it("keeps redirect status informational and webhook authority signed and test-only", () => {
    expect(checkoutStatus).toContain('.eq("user_id", user.id)');
    expect(checkoutStatus).not.toContain("record_paid_autopsy_checkout");
    expect(webhook).toContain("constructEvent(await readRawBody(req), signature");
    expect(webhook).toContain("if (event.livemode)");
    expect(webhook).toContain('session.payment_status !== "paid"');
  });

  it("never caches payment verification while the signed webhook is catching up", () => {
    expect(checkoutStatus).toContain('res.setHeader("Cache-Control", "no-store');
    expect(checkoutPanel).toContain('cache: "no-store"');
    expect(checkoutStatus).toContain("Array.isArray(order.autopsy_entitlements)");
    expect(checkoutStatus).toContain(": order.autopsy_entitlements;");
  });

  it("uses the named order constraint so the webhook return column cannot shadow order_id", () => {
    expect(webhookConflictFix).toContain(
      "on conflict on constraint autopsy_entitlements_order_id_key",
    );
    expect(webhookConflictFix).not.toContain("on conflict (order_id)");
  });

  it("repairs required Autopsy context reference rows after a migration-version collision", () => {
    expect(contextReferenceRepair).toContain("('startup', 'Startup'");
    expect(contextReferenceRepair).toContain("('never', 'Never owned");
    expect(contextReferenceRepair).toContain("on conflict (code) do update");
    expect(contextReferenceRepair).toContain("to authenticated");
  });

  it("resumes an owner-bound in-progress Autopsy before consuming another entitlement", () => {
    expect(paidAutopsyResume).toContain("current_user_can_enter_paid_autopsy");
    expect(paidAutopsyResume).toContain("Resume before consuming");
    expect(paidAutopsyResume.indexOf("select e.autopsy_run_id")).toBeLessThan(
      paidAutopsyResume.indexOf("select e.* into v_entitlement"),
    );
    expect(readiness).toBeDefined();
  });

  it("ships the complete active canonical Autopsy assessment into fresh rebuilds", () => {
    expect(canonicalAssessmentSeed).toContain("Canonical Autopsy question count must be 12");
    expect(canonicalAssessmentSeed).toContain("active-question answer-option count must be 48");
    expect(canonicalAssessmentSeed).toContain("conversation-variant count must be 48");
    expect(canonicalAssessmentSeed).toContain("on conflict (dimension_code) do nothing");
  });

  it("does not mount authenticated First 5 Jobs before Supabase grants it", () => {
    const route = dashboard.slice(dashboard.indexOf("export default function Stage1Dashboard"));
    expect(route).toContain("<GovernedStage1Entry />");
    expect(route).toContain("getAuthorizedStage1Admission(runId)");
    expect(route).not.toContain('rpc("get_stage1_progress_snapshot_by_run"');
    expect(route.indexOf("<GovernedStage1Entry />")).toBeLessThan(
      route.lastIndexOf("return <Stage1DashboardInner />"),
    );
  });

  it("uses one owner-bound Supabase admission contract in both UI consumers", () => {
    expect(admission).toContain('"get_authorized_stage1_admission"');
    expect(admission).toContain("return !error && data === true");
    expect(dashboard).toContain("getAuthorizedStage1Admission(runId)");
    expect(readiness).toContain("getAuthorizedStage1Admission(runId)");
    expect(migration).toContain("ar.owner_user_id = auth.uid()");
    expect(migration).toContain("sp.current_stage_code = 'stage_1_first_five_jobs'");
    expect(migration).toContain("('available', 'in_progress', 'passed')");
    expect(migration).toContain("from public, anon, service_role");
  });

  it("keeps candidate worksheet input submit-only", () => {
    const statuses = readiness.slice(
      readiness.indexOf("const STATUS_OPTIONS"),
      readiness.indexOf("function humanize"),
    );
    expect(statuses).toContain('"Submitted"');
    expect(statuses).not.toContain('"Accepted"');
    expect(statuses).not.toContain('"Rejected"');
    expect(statuses).not.toContain('"Retest Required"');
    expect(readiness).toContain("Browser state cannot");
    expect(readiness).toContain("stage1AdmissionQ.data === true");
  });
});
