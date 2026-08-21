import { describe, expect, it } from "vitest";
import {
  RosterShiftSchema,
  TimeEntrySchema,
  labourVarianceMinutes,
  plannedLabourMinutes,
  transitionRosterShift,
  type RosterShift,
  type TimeEntry,
} from "@/lib/core/roster";
import {
  buildPayrollTimesheetSubmission,
  toManualPayrollCsv,
} from "@/lib/core/payrollBoundary";

const ids = {
  shift: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  employee: "33333333-3333-4333-8333-333333333333",
  job: "44444444-4444-4444-8444-444444444444",
  site: "55555555-5555-4555-8555-555555555555",
  entry: "66666666-6666-4666-8666-666666666666",
  approver: "77777777-7777-4777-8777-777777777777",
};

const shift: RosterShift = {
  id: ids.shift,
  tenantId: ids.tenant,
  employeeId: ids.employee,
  jobId: ids.job,
  workSiteId: ids.site,
  workDate: "2026-08-18",
  startsAt: "2026-08-18T08:00:00+10:00",
  endsAt: "2026-08-18T16:30:00+10:00",
  breakMinutes: 30,
  timezone: "Australia/Brisbane",
  status: "draft",
  version: 1,
  createdAt: "2026-08-17T20:00:00+10:00",
  updatedAt: "2026-08-17T20:00:00+10:00",
};

const approvedEntry: TimeEntry = {
  id: ids.entry,
  tenantId: ids.tenant,
  shiftId: ids.shift,
  employeeId: ids.employee,
  workDate: "2026-08-18",
  startedAt: "2026-08-18T08:05:00+10:00",
  endedAt: "2026-08-18T16:20:00+10:00",
  breakMinutes: 30,
  status: "approved",
  approvedBy: ids.approver,
  approvedAt: "2026-08-18T17:00:00+10:00",
  version: 2,
};

describe("Core roster contract", () => {
  it("validates UUID authority and exposes planned labour minutes", () => {
    expect(RosterShiftSchema.parse(shift)).toEqual(shift);
    expect(plannedLabourMinutes(shift)).toBe(480);
    expect(() => RosterShiftSchema.parse({ ...shift, tenantId: "tenant-1" })).toThrow();
  });

  it("rejects impossible shifts and breaks", () => {
    expect(() =>
      RosterShiftSchema.parse({
        ...shift,
        endsAt: shift.startsAt,
      }),
    ).toThrow("Shift end must be after shift start");

    expect(() =>
      RosterShiftSchema.parse({
        ...shift,
        breakMinutes: 600,
      }),
    ).toThrow("Breaks must be shorter than the shift");
  });

  it("allows only governed lifecycle transitions", () => {
    const published = transitionRosterShift(
      shift,
      "published",
      "2026-08-17T21:00:00+10:00",
    );
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);
    expect(() =>
      transitionRosterShift(shift, "completed", "2026-08-17T21:00:00+10:00"),
    ).toThrow("Invalid roster transition");
  });

  it("requires explicit authority before payroll submission", () => {
    expect(TimeEntrySchema.parse(approvedEntry)).toEqual(approvedEntry);
    expect(() =>
      TimeEntrySchema.parse({
        ...approvedEntry,
        approvedBy: null,
        approvedAt: null,
      }),
    ).toThrow("Approved time requires approver identity");

    expect(() =>
      buildPayrollTimesheetSubmission(
        {
          ...approvedEntry,
          status: "submitted",
          approvedBy: null,
          approvedAt: null,
        },
        "PAY-17",
      ),
    ).toThrow("Only approved time can be submitted to payroll");
  });

  it("calculates actual-versus-planned variance before payroll", () => {
    expect(labourVarianceMinutes(shift, approvedEntry)).toBe(-15);
    expect(() =>
      labourVarianceMinutes(shift, {
        ...approvedEntry,
        employeeId: ids.approver,
      }),
    ).toThrow("Time entry does not belong to this roster shift");
  });

  it("builds a provider-neutral Standard Payroll handoff and CSV fallback", () => {
    const submission = buildPayrollTimesheetSubmission(approvedEntry, "PAY-17");
    expect(submission.units).toBe(7.75);
    expect(submission.workDate).toBe("2026-08-18");

    const csv = toManualPayrollCsv([submission]);
    expect(csv).toContain("employee_external_id");
    expect(csv).toContain("PAY-17");
    expect(csv).toContain(",7.75,hours");
  });
});
