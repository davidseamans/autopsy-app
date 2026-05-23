import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  generateSupportingBlocks,
  getGatewayPayload,
} from "@/components/autopsy/rpc";
import {
  CHECKLIST_LABELS,
  ChecklistState,
  WorksheetStatus,
  getWorksheetGuidance,
  isStage1Reachable,
  upsertFromVerdict,
  useProgression,
} from "@/lib/progression";

const STATUS_OPTIONS: WorksheetStatus[] = [
  "Not Started",
  "In Progress",
  "Submitted",
  "Accepted",
  "Rejected",
  "Retest Required",
];

function humanize(v: any): string {
  if (v == null) return "";
  return String(v)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function plain(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join("\n");
  if (typeof v === "object") {
    const obj = v as Record<string, any>;
    return (
      obj.body ?? obj.text ?? obj.description ?? JSON.stringify(obj)
    ) as string;
  }
  return String(v);
}

export default function ReadinessWorksheet() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();

  const payloadQ = useQuery({
    queryKey: ["autopsy", "payload", runId],
    queryFn: () => getGatewayPayload(runId),
    enabled: !!runId,
  });
  const blocksQ = useQuery({
    queryKey: ["autopsy", "blocks", runId],
    queryFn: () => generateSupportingBlocks(runId),
    enabled: !!runId,
  });

  const run = (payloadQ.data?.run ?? {}) as Record<string, any>;
  const verdictName = String(run.verdict_name ?? "");
  const primaryRisk = humanize(run.primary_risk ?? run.weakest_dimension);
  const scoreTotal = Number(run.score_total ?? run.total_score ?? NaN);
  const isNotViableBand =
    /not\s*viable/i.test(verdictName) ||
    (Number.isFinite(scoreTotal) && scoreTotal >= 4 && scoreTotal <= 9);

  // Seed / refresh progression record once we have the verdict.
  useEffect(() => {
    if (!runId || !verdictName) return;
    upsertFromVerdict({ runId, verdictName, primaryRisk });
  }, [runId, verdictName, primaryRisk]);

  const { state, update } = useProgression(runId);

  const guidance = useMemo(
    () => getWorksheetGuidance(state?.primaryRisk ?? primaryRisk),
    [state?.primaryRisk, primaryRisk],
  );

  const evidenceRequired =
    plain(blocksQ.data?.evidence_required?.[0]?.body) ||
    plain(run.evidence_required) ||
    guidance.evidenceRequired;
  const failureCondition =
    plain(blocksQ.data?.failure_drivers?.[0]?.body) ||
    plain(run.failure_condition) ||
    guidance.failureCondition;
  const firstAction =
    plain(blocksQ.data?.required_actions?.[0]?.body) ||
    plain(run.first_action) ||
    guidance.firstAction;
  const requirement = plain(run.requirement_to_proceed) || guidance.requirement;
  const retestCondition =
    plain(run.retest_condition) ||
    "Re-run the Autopsy after the required proof is in place.";

  if (!runId) {
    return (
      <div className="container max-w-3xl py-10">
        <p className="text-sm text-muted-foreground">No Autopsy run selected.</p>
      </div>
    );
  }

  const checklistComplete =
    !!state && Object.values(state.checklist).every(Boolean);
  const stage1Unlocked = !!state && isStage1Reachable(state.stagePermission);

  const setChecklist = (key: keyof ChecklistState, value: boolean) => {
    if (!state) return;
    update({ checklist: { ...state.checklist, [key]: value } });
  };

  return (
    <div className="container max-w-3xl py-10 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/autopsy/run/${runId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Diagnostic
        </Link>
        <Link
          to="/autopsy/history"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Run History
        </Link>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Readiness / Repair Worksheet
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNotViableBand
            ? "Repair Gate — Stage 1 Not Yet Open"
            : "Prepare to Enter Stage 1"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isNotViableBand
            ? "This is a repair gate, not a business plan. Complete the required proof and retest before Stage 1 can open."
            : "This is a readiness and repair gate, not a business plan. You must satisfy it before Stage 1 will open."}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diagnostic Summary</CardTitle>
          <CardDescription>Pulled from the Autopsy result for this run.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Row label="Final Verdict" value={humanize(verdictName) || (isNotViableBand ? "Not Viable" : "—")} />
          <Row label="Primary Risk" value={primaryRisk || "—"} />
          <Row label="Failure Condition" value={failureCondition} multiline />
          <Row label="Requirement to Proceed" value={requirement} multiline />
          <Row label="Evidence Required" value={evidenceRequired} multiline />
          <Row label="First Action" value={firstAction} multiline />
          <Row label="Retest Condition" value={retestCondition} multiline />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acceptable & Unacceptable Proof</CardTitle>
          <CardDescription>Based on your primary risk.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border bg-emerald-50/40 p-3">
            <div className="text-xs uppercase tracking-wide text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Acceptable
            </div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
              {guidance.acceptable.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border bg-red-50/40 p-3">
            <div className="text-xs uppercase tracking-wide text-red-800 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Not Acceptable
            </div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
              {guidance.notAcceptable.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Worksheet Status</CardTitle>
              <CardDescription>
                Move to Submitted when your proof is ready for review. Accepted
                unlocks Stage 1 (conditionally for high-risk verdicts).
              </CardDescription>
            </div>
            <Badge variant="outline">{state?.worksheetStatus ?? "Not Started"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Set status
            </Label>
            <Select
              value={state?.worksheetStatus ?? "Not Started"}
              onValueChange={(v) => update({ worksheetStatus: v as WorksheetStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.worksheetStatus === "Rejected" && (
            <div className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              Worksheet rejected. Stage 1 stays locked until the proof is rebuilt
              and the retest condition is satisfied.
            </div>
          )}
          {state?.worksheetStatus === "Retest Required" && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
              Retest required before Stage 1 can be opened.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Readiness Checklist</CardTitle>
          <CardDescription>
            All items must be confirmed before Stage 1 opens. These rules govern
            how Stage 1 will judge your proof.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(CHECKLIST_LABELS) as (keyof ChecklistState)[]).map((key) => (
            <label
              key={key}
              className="flex items-start gap-3 text-sm cursor-pointer"
            >
              <Checkbox
                checked={state?.checklist?.[key] ?? false}
                onCheckedChange={(v) => setChecklist(key, !!v)}
                className="mt-0.5"
              />
              <span>{CHECKLIST_LABELS[key]}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stage Permission</CardTitle>
          <CardDescription>
            Computed from verdict, worksheet status, and checklist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {stage1Unlocked ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">{state?.stagePermission ?? "Locked"}</span>
          </div>
          {!checklistComplete && (
            <p className="text-xs text-muted-foreground">
              Checklist incomplete — finish all items above.
            </p>
          )}
          {state?.worksheetStatus !== "Accepted" && (
            <p className="text-xs text-muted-foreground">
              Worksheet not Accepted — set status above when your proof is ready.
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              disabled={!stage1Unlocked}
              onClick={() => {
                toast({
                  title: "Stage 1 opened",
                  description: `Permission: ${state?.stagePermission}`,
                });
                navigate("/stage-1");
              }}
            >
              Open Stage 1 Dashboard
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/autopsy/run/${runId}`}>View Diagnostic Summary</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div
      className={
        multiline
          ? "space-y-1"
          : "flex justify-between gap-3 items-baseline"
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          multiline
            ? "text-sm whitespace-pre-wrap"
            : "text-sm font-medium text-right"
        }
      >
        {value}
      </div>
    </div>
  );
}
