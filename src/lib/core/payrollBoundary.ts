import {
  TimeEntrySchema,
  actualLabourMinutes,
  type TimeEntry,
} from "@/lib/core/roster";

export type PayrollTimesheetSubmission = {
  sourceTimeEntryId: string;
  employeeExternalId: string;
  workDate: string;
  units: number;
  unitType: "hours";
  startedAt: string;
  endedAt: string;
  breakMinutes: number;
};

export type PayrollSubmissionResult = {
  sourceTimeEntryId: string;
  externalTimesheetId: string | null;
  status: "accepted" | "rejected";
  message: string | null;
};

export interface PayrollAdapter {
  readonly provider: string;
  submitApprovedTimesheets(
    entries: PayrollTimesheetSubmission[],
  ): Promise<PayrollSubmissionResult[]>;
}

export function buildPayrollTimesheetSubmission(
  input: TimeEntry,
  employeeExternalId: string,
): PayrollTimesheetSubmission {
  const entry = TimeEntrySchema.parse(input);

  if (entry.status !== "approved") {
    throw new Error("Only approved time can be submitted to payroll.");
  }

  if (!employeeExternalId.trim()) {
    throw new Error("Payroll employee mapping is required.");
  }

  return {
    sourceTimeEntryId: entry.id,
    employeeExternalId,
    workDate: entry.workDate,
    units: Number((actualLabourMinutes(entry) / 60).toFixed(4)),
    unitType: "hours",
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    breakMinutes: entry.breakMinutes,
  };
}

export function toManualPayrollCsv(entries: PayrollTimesheetSubmission[]) {
  const header =
    "source_time_entry_id,employee_external_id,work_date,start_time,end_time,break_minutes,units,unit_type";
  const rows = entries.map((entry) =>
    [
      entry.sourceTimeEntryId,
      entry.employeeExternalId,
      entry.workDate,
      entry.startedAt,
      entry.endedAt,
      entry.breakMinutes,
      entry.units,
      entry.unitType,
    ]
      .map(csvCell)
      .join(","),
  );

  return [header, ...rows].join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
