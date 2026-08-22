import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const OPERATIONAL_LINEAGE = [
  "job",
  "scheduleVersion",
  "serviceEvent",
  "shift",
  "timeEntry",
  "closeout",
] as const;

export const WORK_ALLOCATION_TYPES = ["job", "overhead"] as const;
export type WorkAllocationType = (typeof WORK_ALLOCATION_TYPES)[number];

export const WorkAllocationSchema = z
  .object({
    type: z.enum(WORK_ALLOCATION_TYPES),
    jobId: uuid.nullable(),
    overheadClassId: uuid.nullable(),
  })
  .superRefine((allocation, context) => {
    const hasJob = allocation.jobId !== null;
    const hasOverhead = allocation.overheadClassId !== null;

    if (hasJob === hasOverhead) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Work must belong to exactly one Job or governed overhead class.",
      });
    }
    if (allocation.type === "job" && !hasJob) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobId"],
        message: "Job work requires a Job UUID.",
      });
    }
    if (allocation.type === "overhead" && !hasOverhead) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overheadClassId"],
        message: "Overhead work requires a governed overhead class UUID.",
      });
    }
  });

export const ExtraChargeCandidateSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  evidenceReference: z.string().trim().min(1).nullable(),
});

export type ExtraChargeCandidate = z.infer<typeof ExtraChargeCandidateSchema>;

export const QualityCaseSchema = z
  .object({
    type: z.enum(["quality_defect", "rectification"]),
    description: z.string().trim().min(1),
    rectifiesCaseId: uuid.nullable(),
  })
  .superRefine((qualityCase, context) => {
    if (qualityCase.type === "rectification" && !qualityCase.rectifiesCaseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rectifiesCaseId"],
        message: "Rectification must identify the quality defect it addresses.",
      });
    }
    if (qualityCase.type === "quality_defect" && qualityCase.rectifiesCaseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rectifiesCaseId"],
        message: "A quality defect cannot itself be a rectification.",
      });
    }
  });

export interface ServiceEventState {
  id: string;
  scheduleVersionId: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
}

export function canReplaceServiceEvent(event: ServiceEventState) {
  uuid.parse(event.id);
  uuid.parse(event.scheduleVersionId);
  timestamp.parse(event.startsAt);
  timestamp.parse(event.endsAt);
  return event.status === "planned";
}

export function assertCloseoutMayBegin(endedAt: string | null) {
  if (!endedAt) {
    throw new Error("Clock-off must stop paid time before closeout begins.");
  }
  timestamp.parse(endedAt);
}

export function assertAssignmentReady(input: {
  missingCredentials: string[];
  hasCapacityConflict: boolean;
}) {
  if (input.missingCredentials.length > 0) {
    throw new Error(`Missing credentials: ${input.missingCredentials.join(", ")}`);
  }
  if (input.hasCapacityConflict) {
    throw new Error("Worker has a conflicting assignment.");
  }
}
