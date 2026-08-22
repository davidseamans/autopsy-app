import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExtraChargeCandidateSchema,
  OPERATIONAL_LINEAGE,
  QualityCaseSchema,
  WorkAllocationSchema,
  assertAssignmentReady,
  assertCloseoutMayBegin,
  canReplaceServiceEvent,
} from "@/lib/core/operationalSpine";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822093000_core_operational_spine.sql"),
  "utf8",
);

const ids = {
  job: "11111111-1111-4111-8111-111111111111",
  overhead: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  version: "44444444-4444-4444-8444-444444444444",
  defect: "55555555-5555-4555-8555-555555555555",
};

describe("BOS-E02 Core operational spine", () => {
  it("preserves one universal operational lineage", () => {
    expect(OPERATIONAL_LINEAGE).toEqual([
      "job",
      "scheduleVersion",
      "serviceEvent",
      "shift",
      "timeEntry",
      "closeout",
    ]);
  });

  it("requires every shift to be Job work or governed overhead work", () => {
    expect(WorkAllocationSchema.parse({
      type: "job",
      jobId: ids.job,
      overheadClassId: null,
    }).jobId).toBe(ids.job);

    expect(() => WorkAllocationSchema.parse({
      type: "job",
      jobId: ids.job,
      overheadClassId: ids.overhead,
    })).toThrow("exactly one Job or governed overhead class");
  });

  it("stops paid time before operational closeout", () => {
    expect(() => assertCloseoutMayBegin(null)).toThrow("Clock-off must stop paid time");
    expect(() => assertCloseoutMayBegin("2026-08-22T17:00:00+10:00")).not.toThrow();
  });

  it("allows schedule replacement only for unstarted events", () => {
    const event = {
      id: ids.event,
      scheduleVersionId: ids.version,
      startsAt: "2026-08-24T08:00:00+10:00",
      endsAt: "2026-08-24T10:00:00+10:00",
    } as const;
    expect(canReplaceServiceEvent({ ...event, status: "planned" })).toBe(true);
    expect(canReplaceServiceEvent({ ...event, status: "completed" })).toBe(false);
  });

  it("gates assignment on credentials and capacity", () => {
    expect(() => assertAssignmentReady({
      missingCredentials: ["site-induction"],
      hasCapacityConflict: false,
    })).toThrow("Missing credentials");
    expect(() => assertAssignmentReady({
      missingCredentials: [],
      hasCapacityConflict: true,
    })).toThrow("conflicting assignment");
  });

  it("captures Extra Charges as evidence without pricing authority", () => {
    expect(ExtraChargeCandidateSchema.parse({
      description: "Five additional consumable units",
      quantity: 5,
      unit: "roll",
      evidenceReference: "photo://closeout/1",
    }).quantity).toBe(5);
    expect(migration).not.toMatch(/unit_price|sell_price|customer_price|margin_percent/i);
  });

  it("keeps defects, rectification and additional scope separate", () => {
    expect(QualityCaseSchema.parse({
      type: "rectification",
      description: "Return visit completed",
      rectifiesCaseId: ids.defect,
    }).type).toBe("rectification");
    expect(() => QualityCaseSchema.parse({
      type: "rectification",
      description: "Return visit required",
      rectifiesCaseId: null,
    })).toThrow("must identify the quality defect");
    expect(migration).toContain("create table public.core_additional_scope_candidates");
  });

  it("keeps operational writes behind governed functions", () => {
    for (const fn of [
      "core_create_schedule_version",
      "core_create_service_event",
      "core_assign_worker_to_event",
      "core_create_overhead_shift",
      "core_clock_off_shift",
      "core_record_shift_closeout",
      "core_record_rectification",
    ]) {
      expect(migration).toContain(fn);
    }
    expect(migration).not.toMatch(/grant\s+(insert|update|delete).*to authenticated/i);
  });

  it("contains no payroll, QBO, billing or Cleaning interpretation", () => {
    expect(migration).not.toMatch(/quickbooks|qbo|employment hero|payroll journal|award interpretation/i);
    expect(migration).not.toMatch(/toilet paper|chemical|cleaning task/i);
  });
});
