import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRosterWeek } from "@/lib/core/rosterRepository";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260818095000_core_roster_persistence.sql"),
  "utf8",
);

describe("Core roster persistence", () => {
  it("derives a Monday-to-Sunday operator week", () => {
    expect(getRosterWeek(new Date(2026, 7, 18, 12))).toEqual({
      startsOn: "2026-08-17",
      endsOn: "2026-08-23",
    });
  });

  it("keeps tenant lineage and optimistic concurrency in the database", () => {
    expect(migration).toContain("foreign key (tenant_id, employee_id)");
    expect(migration).toContain("foreign key (tenant_id, job_id)");
    expect(migration).toContain("new.version <> old.version + 1");
  });

  it("exposes read-only tenant-filtered roster data", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("control_tenant_memberships");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("grant select on public.core_weekly_roster to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it("records every governed roster mutation", () => {
    expect(migration).toContain("create table public.core_roster_audit");
    expect(migration).toContain("core_capture_roster_audit");
    expect(migration).toContain("after insert or update or delete");
  });
});
