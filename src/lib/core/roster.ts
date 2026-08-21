import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const workDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const ROSTER_SHIFT_STATUSES = [
  "draft",
  "published",
  "accepted",
  "completed",
  "cancelled",
] as const;

export const RosterShiftSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    employeeId: uuid,
    jobId: uuid,
    workSiteId: uuid.nullable(),
    workDate,
    startsAt: timestamp,
    endsAt: timestamp,
    breakMinutes: z.number().int().min(0),
    timezone: z.string().min(1),
    status: z.enum(ROSTER_SHIFT_STATUSES),
    version: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((shift, context) => {
    const elapsedMinutes =
      (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60_000;

    if (elapsedMinutes <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Shift end must be after shift start.",
      });
    }

    if (elapsedMinutes - shift.breakMinutes <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakMinutes"],
        message: "Breaks must be shorter than the shift.",
      });
    }
  });

export type RosterShift = z.infer<typeof RosterShiftSchema>;
export type RosterShiftStatus = RosterShift["status"];

export const TIME_ENTRY_STATUSES = ["submitted", "approved", "rejected"] as const;

export const TimeEntrySchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    shiftId: uuid,
    employeeId: uuid,
    workDate,
    startedAt: timestamp,
    endedAt: timestamp,
    breakMinutes: z.number().int().min(0),
    status: z.enum(TIME_ENTRY_STATUSES),
    approvedBy: uuid.nullable(),
    approvedAt: timestamp.nullable(),
    version: z.number().int().positive(),
  })
  .superRefine((entry, context) => {
    const elapsedMinutes =
      (new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000;

    if (elapsedMinutes <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endedAt"],
        message: "Time entry end must be after its start.",
      });
    }

    if (elapsedMinutes - entry.breakMinutes <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakMinutes"],
        message: "Breaks must be shorter than recorded time.",
      });
    }

    const hasApproval = Boolean(entry.approvedBy && entry.approvedAt);
    if (entry.status === "approved" && !hasApproval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvedBy"],
        message: "Approved time requires approver identity and approval time.",
      });
    }

    if (entry.status !== "approved" && hasApproval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Only approved time may carry approval authority.",
      });
    }
  });

export type TimeEntry = z.infer<typeof TimeEntrySchema>;

const allowedTransitions: Record<RosterShiftStatus, RosterShiftStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["accepted", "cancelled"],
  accepted: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionRosterShift(
  input: RosterShift,
  nextStatus: RosterShiftStatus,
  changedAt: string,
): RosterShift {
  const shift = RosterShiftSchema.parse(input);
  timestamp.parse(changedAt);

  if (!allowedTransitions[shift.status].includes(nextStatus)) {
    throw new Error(`Invalid roster transition: ${shift.status} -> ${nextStatus}`);
  }

  return RosterShiftSchema.parse({
    ...shift,
    status: nextStatus,
    version: shift.version + 1,
    updatedAt: changedAt,
  });
}

function elapsedMinutes(startedAt: string, endedAt: string, breakMinutes: number) {
  return Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000 -
      breakMinutes,
  );
}

export function plannedLabourMinutes(shift: RosterShift) {
  const valid = RosterShiftSchema.parse(shift);
  return elapsedMinutes(valid.startsAt, valid.endsAt, valid.breakMinutes);
}

export function actualLabourMinutes(entry: TimeEntry) {
  const valid = TimeEntrySchema.parse(entry);
  return elapsedMinutes(valid.startedAt, valid.endedAt, valid.breakMinutes);
}

export function labourVarianceMinutes(shift: RosterShift, entry: TimeEntry) {
  const validShift = RosterShiftSchema.parse(shift);
  const validEntry = TimeEntrySchema.parse(entry);

  if (
    validEntry.shiftId !== validShift.id ||
    validEntry.employeeId !== validShift.employeeId ||
    validEntry.tenantId !== validShift.tenantId
  ) {
    throw new Error("Time entry does not belong to this roster shift.");
  }

  return actualLabourMinutes(validEntry) - plannedLabourMinutes(validShift);
}
