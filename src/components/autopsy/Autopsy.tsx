import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ROUTING_COPY,
  upsertFromVerdict,
  useProgression,
  deriveBand,
} from "@/lib/progression";
import {
  Skull,
  ArrowLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  Target,
  Wrench,
  HelpCircle,
} from "lucide-react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isDebug } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  GatewayPayload,
  GatewayQuestion,
  createAutopsyRun,
  extractRunId,
  finalizeAutopsyRun,
  getGatewayPayload,
  recordAutopsyAnswer,
  generateSupportingBlocks,
  SupportingBlocks,
  SupportingBlockItem,
} from "./rpc";

type View = "start" | "question" | "verdict";

interface RpcError {
  rpc: string;
  message: string;
  step: string;
  runId: string | null;
}

const INDUSTRIES = [
  "Cleaning",
  "Trades",
  "Hospitality",
  "Retail",
  "Professional Services",
  "Other",
];

const SCENARIOS: Array<{ value: string; label: string }> = [
  { value: "startup", label: "Startup" },
  { value: "existing_business", label: "Existing business" },
  { value: "acquisition", label: "Acquisition" },
  { value: "franchise", label: "Franchise" },
];

const OPERATOR_CLASSES: Array<{ value: string; label: string }> = [
  { value: "unproven", label: "1 — Unproven (first-time operator, no prior traction)" },
  { value: "developing", label: "2 — Developing (some experience, limited proof)" },
  { value: "experienced", label: "3 — Experienced (has operated before)" },
  { value: "operator", label: "4 — Operator (proven operator with delivery discipline)" },
  { value: "advanced_operator", label: "5 — Advanced operator (system builder / scaling experience)" },
];

function normalizeOption(opt: any, idx: number) {
  if (typeof opt === "string") {
    return { value: opt, label: opt, key: `${idx}-${opt}`, selected: false };
  }
  const value = opt.value ?? opt.option_id ?? opt.id ?? opt.label ?? idx;
  const label = opt.label ?? opt.text ?? String(value);
  return { value, label, key: `${idx}-${value}`, selected: !!opt.selected };
}

function sortedQuestions(payload: GatewayPayload | undefined): GatewayQuestion[] {
  const qs = payload?.questions ?? [];
  return [...qs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function humanize(value: any): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function hasContent(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).length > 2;
    } catch {
      return false;
    }
  }
  return true;
}

function humanizeDeep(value: any): any {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, (m) => humanize(m));
  }
  if (Array.isArray(value)) return value.map(humanizeDeep);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[humanize(k)] = humanizeDeep(v);
    return out;
  }
  return value;
}

function translatePermissionState(value: any): string {
  if (!hasContent(value)) return "—";
  const key = String(value).trim().toUpperCase().replace(/[\s\-/]+/g, "_");
  const map: Record<string, string> = {
    PROCEED_ONLY_IF: "Proceed only if the required proof is produced.",
    STOP: "Stop. Do not proceed.",
    STOP_UNLESS_REBUILT: "Stop until the business is rebuilt and retested.",
    STOP_PROOF_REQUIRED: "Stop until the required proof is produced.",
    PROCEED_WITH_CONSTRAINTS: "Proceed with controls in place.",
    CONTROLLED_PROGRESSION: "Proceed under controlled conditions.",
    PROCEED: "Proceed with disciplined execution.",
  };
  return map[key] ?? humanize(value);
}

function translateSeverityLabel(value: any): string {
  if (!hasContent(value)) return "—";
  const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    BLOCKING: "Blocking",
    CRITICAL: "Critical",
    HIGH: "High",
    ELEVATED: "Elevated",
    MODERATE: "Moderate",
    LOW: "Low",
    STABLE: "Stable",
  };
  return map[key] ?? humanize(value);
}

export function Autopsy({ initialRunId }: { initialRunId?: string } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(initialRunId ? "verdict" : "start");
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  const [error, setError] = useState<RpcError | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [localAnswers, setLocalAnswers] = useState<Record<string, string | number>>({});
  const [pendingSelection, setPendingSelection] = useState<string | number | null>(null);
  const [loadingStuck, setLoadingStuck] = useState(false);
  const [manualIndex, setManualIndex] = useState<number | null>(null);

  const [industry, setIndustry] = useState(
    () => localStorage.getItem("autopsy_intake_industry") || "Cleaning",
  );
  const [scenario, setScenario] = useState(
    () => localStorage.getItem("autopsy_intake_scenario") || "startup",
  );
  const [operatorClass, setOperatorClass] = useState(
    () => localStorage.getItem("autopsy_intake_operator") || "unproven",
  );
  const [runName, setRunName] = useState("");
  const [testerEmail, setTesterEmail] = useState(
    () => localStorage.getItem("autopsy_intake_email") || "",
  );

  useEffect(() => {
    localStorage.setItem("autopsy_intake_industry", industry);
  }, [industry]);
  useEffect(() => {
    localStorage.setItem("autopsy_intake_scenario", scenario);
  }, [scenario]);
  useEffect(() => {
    localStorage.setItem("autopsy_intake_operator", operatorClass);
  }, [operatorClass]);
  useEffect(() => {
    localStorage.setItem("autopsy_intake_email", testerEmail);
  }, [testerEmail]);

  // Persist active runId so standalone /worksheet route can recover it.
  useEffect(() => {
    if (runId) localStorage.setItem("autopsy_active_run_id", runId);
  }, [runId]);

  const payloadQuery = useQuery({
    queryKey: ["autopsy", "payload", runId],
    queryFn: () => getGatewayPayload(runId as string),
    enabled: !!runId,
  });

  useEffect(() => {
    if (payloadQuery.error) {
      const e = payloadQuery.error as any;
      setError({
        rpc: "get_autopsy_gateway_payload",
        message: e?.message ?? String(e),
        step: view,
        runId,
      });
    }
  }, [payloadQuery.error, runId, view]);

  const startMutation = useMutation({
    mutationFn: createAutopsyRun,
    onSuccess: (data) => {
      const id = extractRunId(data);
      if (!id) {
        setError({
          rpc: "create_autopsy_run",
          message: "No run_id returned from create_autopsy_run",
          step: "start",
          runId: null,
        });
        return;
      }
      setError(null);
      setRunId(id);
      setView("question");
    },
    onError: (e: any) =>
      setError({
        rpc: "create_autopsy_run",
        message: e?.message ?? String(e),
        step: "start",
        runId: null,
      }),
  });

  const answerMutation = useMutation({
    mutationFn: recordAutopsyAnswer,
    onSuccess: async (_d, vars) => {
      setError(null);
      const justAnsweredId = String(vars.question_id);
      let nextSize = 0;
      setAnsweredIds((prev) => {
        const next = new Set(prev);
        next.add(justAnsweredId);
        nextSize = next.size;
        return next;
      });
      setLocalAnswers((prev) => ({
        ...prev,
        [String(vars.question_id)]: vars.selected_option,
      }));
      setPendingSelection(null);
      await qc.invalidateQueries({ queryKey: ["autopsy", "payload", runId] });
      // Auto-finalize when last question was just answered.
      if (questions.length > 0 && nextSize >= questions.length && runId) {
        finalizeMutation.mutate(runId);
      }
    },
    onError: (e: any) =>
      setError({
        rpc: "record_autopsy_answer",
        message: e?.message ?? String(e),
        step: "question",
        runId,
      }),
  });

  const finalizeMutation = useMutation({
    mutationFn: finalizeAutopsyRun,
    onSuccess: async () => {
      setError(null);
      const fresh = await qc.fetchQuery({
        queryKey: ["autopsy", "payload", runId],
        queryFn: () => getGatewayPayload(runId as string),
      });
      const status = (fresh as any)?.run?.status;
      const hasVerdict = !!(fresh as any)?.run?.verdict_name;
      if (status === "completed" || hasVerdict) {
        setLoadingStuck(false);
        setView("verdict");
      } else {
        setView("verdict");
      }
    },
    onError: (e: any) =>
      setError({
        rpc: "finalize_autopsy_run",
        message: e?.message ?? String(e),
        step: "question",
        runId,
      }),
  });

  const questions = useMemo(() => sortedQuestions(payloadQuery.data), [payloadQuery.data]);
  const isAnswered = (q: GatewayQuestion) =>
    !!q.answered || q.selected_option != null || answeredIds.has(String(q.question_id));

  const currentIndex = useMemo(() => {
    if (manualIndex != null) {
      return Math.max(0, Math.min(manualIndex, Math.max(0, questions.length - 1)));
    }
    const idx = questions.findIndex((q) => !isAnswered(q));
    return idx === -1 ? Math.max(0, questions.length - 1) : idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answeredIds, manualIndex]);
  const currentQuestion = questions[currentIndex];
  const allAnswered = questions.length > 0 && questions.every(isAnswered);

  // Deterministic flip to verdict whenever backend payload says completed.
  useEffect(() => {
    const run: any = payloadQuery.data?.run;
    if (!run) return;
    if ((run.status === "completed" || !!run.verdict_name) && view !== "verdict") {
      setLoadingStuck(false);
      setView("verdict");
    }
  }, [payloadQuery.data, view]);

  // 8s timeout fallback when sitting on the post-Q10 spinner.
  useEffect(() => {
    if (view !== "question") {
      setLoadingStuck(false);
      return;
    }
    if (!allAnswered && !finalizeMutation.isPending) {
      setLoadingStuck(false);
      return;
    }
    const t = window.setTimeout(async () => {
      if (!runId) return;
      try {
        const fresh = await qc.fetchQuery({
          queryKey: ["autopsy", "payload", runId],
          queryFn: () => getGatewayPayload(runId),
        });
        const run: any = (fresh as any)?.run;
        if (run?.status === "completed" || run?.verdict_name) {
          setView("verdict");
          setLoadingStuck(false);
        } else {
          setLoadingStuck(true);
        }
      } catch {
        setLoadingStuck(true);
      }
    }, 8000);
    return () => window.clearTimeout(t);
  }, [view, allAnswered, finalizeMutation.isPending, runId, qc]);

  // Score so far (display only — sums numeric option values when available)
  const { scoreSoFar, scoreMax, scoreNumeric } = useMemo(() => {
    let sum = 0;
    let max = 0;
    let anyNumeric = false;
    for (const q of questions) {
      const opts = (q.options ?? []).map(normalizeOption);
      const numericOpts = opts
        .map((o) => (typeof o.value === "number" ? o.value : Number(o.value)))
        .filter((n) => Number.isFinite(n));
      if (numericOpts.length) {
        anyNumeric = true;
        max += Math.max(...numericOpts);
      }
      const sel =
        q.selected_option ?? localAnswers[String(q.question_id)] ?? null;
      if (sel != null) {
        const n = Number(sel);
        if (Number.isFinite(n)) sum += n;
      }
    }
    const integrity = (payloadQuery.data as any)?.integrity ?? {};
    const liveScore = Number(integrity.score_total_live);
    const backendScore = Number((payloadQuery.data?.run as any)?.score_total);
    const finalScore = Number.isFinite(liveScore)
      ? liveScore
      : Number.isFinite(backendScore)
        ? backendScore
        : sum;
    return { scoreSoFar: finalScore, scoreMax: max, scoreNumeric: anyNumeric };
  }, [questions, localAnswers, payloadQuery.data]);

  // Preselect previously saved answer when the current question changes.
  useEffect(() => {
    if (view !== "question" || !currentQuestion) return;
    const qid = String(currentQuestion.question_id);
    const prior =
      currentQuestion.selected_option ?? localAnswers[qid] ?? null;
    setPendingSelection(prior as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.question_id, view]);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startMutation.mutate({
      industry,
      scenario,
      run_name: runName.trim(),
      tester_email: testerEmail.trim(),
      operator_class: operatorClass,
    });
  }

  async function handleNext() {
    if (!runId || !currentQuestion || pendingSelection == null) return;
    const isFinal = currentIndex >= questions.length - 1;
    // Advance past the manually navigated index on Next.
    if (manualIndex != null) {
      setManualIndex(manualIndex + 1 >= questions.length ? null : manualIndex + 1);
    }
    try {
      await answerMutation.mutateAsync({
        run_id: runId,
        question_id: currentQuestion.question_id,
        selected_option: pendingSelection,
      });
    } catch {
      return; // onError captured it
    }
    if (isFinal) {
      await finalizeAndLoad();
    }
  }

  async function finalizeAndLoad() {
    if (!runId) return;
    setError(null);
    try {
      await finalizeMutation.mutateAsync(runId);
    } catch {
      // onError captured exact finalize error already
    }
  }

  async function retryFinalize() {
    setLoadingStuck(false);
    await finalizeAndLoad();
  }

  function handleBack() {
    // Verdict: always go to History.
    if (view === "verdict") {
      navigate("/autopsy/history");
      return;
    }
    // Fallback / loading state on question screen: clear and go to History.
    if (view === "question" && (loadingStuck || allAnswered || finalizeMutation.isPending)) {
      setLoadingStuck(false);
      setError(null);
      navigate("/autopsy/history");
      return;
    }
    // Question screen top Back: return to Start, confirm if answers exist.
    if (view === "question") {
      const hasAnswers = answeredIds.size > 0 || Object.keys(localAnswers).length > 0;
      if (hasAnswers) {
        const ok = window.confirm(
          "Leave this autopsy and return to the start screen? Your in-progress answers will be discarded from this session.",
        );
        if (!ok) return;
      }
      handleReset();
    }
  }

  function goPrevious() {
    if (view !== "question" || currentIndex <= 0) return;
    const prevQ = questions[currentIndex - 1];
    if (!prevQ) return;
    const prevId = String(prevQ.question_id);
    // Explicit local navigation — set manual index so findIndex logic
    // doesn't immediately jump back to the next unanswered question.
    setManualIndex(currentIndex - 1);
    const prevSel =
      localAnswers[prevId] ?? (prevQ.selected_option as any) ?? null;
    setPendingSelection(prevSel as any);
  }

  function handleReset() {
    setRunId(null);
    setView("start");
    setError(null);
    setAnsweredIds(new Set());
    setLocalAnswers({});
    setPendingSelection(null);
    setRunName("");
    setLoadingStuck(false);
    setManualIndex(null);
    navigate("/autopsy");
  }

  const debug = isDebug();

  return (
    <div className="min-h-screen bg-[hsl(var(--autopsy-bg))]">
      <div className="container max-w-3xl py-10 space-y-6">
        <div className="flex items-center justify-between">
          {(view === "verdict" || view === "question") ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {view === "verdict" || view === "start" ? (
            <Link
              to="/autopsy/history"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Run History
            </Link>
          ) : (
            <span />
          )}
        </div>

        {error && <ErrorPanel error={error} />}

        {view === "start" && (
          <StartView
            industry={industry}
            scenario={scenario}
            operatorClass={operatorClass}
            runName={runName}
            testerEmail={testerEmail}
            setIndustry={setIndustry}
            setScenario={setScenario}
            setOperatorClass={setOperatorClass}
            setRunName={setRunName}
            setTesterEmail={setTesterEmail}
            onSubmit={handleStart}
            loading={startMutation.isPending}
          />
        )}

        {view === "question" && (
          <QuestionView
            loading={payloadQuery.isLoading}
            saving={answerMutation.isPending || finalizeMutation.isPending}
            currentQuestion={currentQuestion}
            currentIndex={currentIndex}
            total={questions.length}
            allAnswered={allAnswered}
            pendingSelection={pendingSelection}
            onSelect={setPendingSelection}
            onNext={handleNext}
            finalizing={finalizeMutation.isPending}
            scoreSoFar={scoreSoFar}
            scoreMax={scoreMax}
            scoreNumeric={scoreNumeric}
            onPrevious={goPrevious}
            canGoPrevious={currentIndex > 0}
            loadingStuck={loadingStuck}
            onViewHistory={() => navigate("/autopsy/history")}
            onStartNew={handleReset}
            onRetryFinalize={retryFinalize}
            retryPending={finalizeMutation.isPending}
          />
        )}

        {view === "verdict" && (
          <VerdictView
            payload={payloadQuery.data}
            loading={payloadQuery.isLoading}
            runId={runId}
            onReset={handleReset}
          />
        )}

        {debug && (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Debug
            </div>
            <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">
{JSON.stringify({ view, runId, payload: payloadQuery.data }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function AutopsyRunRoute() {
  const { runId } = useParams();
  return <Autopsy initialRunId={runId} />;
}

function ErrorPanel({ error }: { error: RpcError }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>RPC failed: {error.rpc}</AlertTitle>
      <AlertDescription>
        <div className="space-y-1 text-sm">
          <div><span className="font-medium">Message:</span> {error.message}</div>
          <div><span className="font-medium">Step:</span> {error.step}</div>
          <div><span className="font-medium">Run ID:</span> {error.runId ?? "—"}</div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/* -------------------------------- StartView -------------------------------- */

function StartView(props: {
  industry: string;
  scenario: string;
  operatorClass: string;
  runName: string;
  testerEmail: string;
  setIndustry: (v: string) => void;
  setScenario: (v: string) => void;
  setOperatorClass: (v: string) => void;
  setRunName: (v: string) => void;
  setTesterEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  const disabled =
    !props.industry ||
    !props.scenario ||
    !props.operatorClass ||
    !props.runName.trim() ||
    !props.testerEmail.trim() ||
    props.loading;

  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm">
      <div className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-[hsl(var(--autopsy-accent-soft))] flex items-center justify-center mb-4">
            <Skull className="h-7 w-7 text-[hsl(var(--autopsy-accent))]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">New Autopsy Run</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up a new assessment to diagnose business health.
          </p>
        </div>

        <form className="space-y-4" onSubmit={props.onSubmit}>
          <Field label="Your email (for test tracking only)">
            <Input
              type="email"
              value={props.testerEmail}
              onChange={(e) => props.setTesterEmail(e.target.value)}
              placeholder="operator@example.com"
            />
          </Field>

          <Field label="Run Name">
            <Input
              value={props.runName}
              onChange={(e) => props.setRunName(e.target.value)}
              placeholder="e.g. Q2 cleaning startup review"
            />
          </Field>

          <Field label="Industry">
            <Select value={props.industry} onValueChange={props.setIndustry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Scenario">
            <Select value={props.scenario} onValueChange={props.setScenario}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Operator profile">
            <Select value={props.operatorClass} onValueChange={props.setOperatorClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATOR_CLASSES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button
            type="submit"
            disabled={disabled}
            className="w-full h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {props.loading ? "Creating run…" : "Begin Autopsy"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ------------------------------- QuestionView ------------------------------ */

function QuestionView(props: {
  loading: boolean;
  saving: boolean;
  currentQuestion: GatewayQuestion | undefined;
  currentIndex: number;
  total: number;
  allAnswered: boolean;
  pendingSelection: string | number | null;
  onSelect: (v: string | number) => void;
  onNext: () => void;
  finalizing: boolean;
  scoreSoFar: number;
  scoreMax: number;
  scoreNumeric: boolean;
  onPrevious: () => void;
  canGoPrevious: boolean;
  loadingStuck: boolean;
  onViewHistory: () => void;
  onStartNew: () => void;
  onRetryFinalize: () => void;
  retryPending: boolean;
}) {
  if (props.loading) {
    return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  }
  if (props.total === 0) {
    return <p className="text-sm text-muted-foreground">No questions returned.</p>;
  }

  const pct = ((props.currentIndex + (props.allAnswered ? 1 : 0)) / props.total) * 100;

  if (props.allAnswered) {
    if (props.loadingStuck) {
      return (
        <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-8 space-y-4 text-center">
          <h2 className="text-lg font-semibold">Run may have completed.</h2>
          <p className="text-sm text-muted-foreground">
            We didn't receive the verdict in time. Please check History to confirm.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              onClick={props.onRetryFinalize}
              disabled={props.retryPending}
              className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
            >
              {props.retryPending ? "Retrying…" : "Retry Finalize"}
            </Button>
            <Button variant="outline" onClick={props.onViewHistory}>
              View History
            </Button>
            <Button variant="outline" onClick={props.onStartNew}>
              Start New Run
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-5 w-5 rounded-full border-2 border-[hsl(var(--autopsy-accent))] border-t-transparent animate-spin" />
      </div>
    );
  }

  const q = props.currentQuestion;
  if (!q) return null;
  const options = (q.options ?? []).map(normalizeOption);

  return (
    <div className="space-y-4">
      <ProgressHeader
        currentIndex={props.currentIndex}
        total={props.total}
        pct={pct}
        scoreSoFar={props.scoreSoFar}
        scoreMax={props.scoreMax}
        scoreNumeric={props.scoreNumeric}
      />

      <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-8">
        <Badge variant="secondary" className="mb-4 uppercase tracking-wider text-[10px]">
          {humanize(q.dimension_code)}
        </Badge>
        <h2 className="text-xl font-semibold leading-snug mb-6">{q.prompt}</h2>

        <div className="space-y-3">
          {options.map((opt) => {
            const selected = props.pendingSelection === opt.value;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => props.onSelect(opt.value as any)}
                disabled={props.saving}
                className={cn(
                  "w-full text-left flex items-start gap-3 rounded-lg border p-4 transition-colors",
                  selected
                    ? "border-[hsl(var(--autopsy-accent))] bg-[hsl(var(--autopsy-accent-soft))]"
                    : "border-[hsl(var(--autopsy-border))] hover:bg-muted/40",
                  props.saving && "opacity-60 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                    selected
                      ? "border-[hsl(var(--autopsy-accent))]"
                      : "border-muted-foreground/40",
                  )}
                >
                  {selected && (
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--autopsy-accent))]" />
                  )}
                </span>
                <span className="text-sm leading-relaxed flex-1">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 mt-6">
          {props.canGoPrevious && (
            <Button
              type="button"
              variant="outline"
              onClick={props.onPrevious}
              disabled={props.saving}
              className="h-11"
            >
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Previous
              </span>
            </Button>
          )}
          <Button
            onClick={props.onNext}
            disabled={props.pendingSelection == null || props.saving}
            className="flex-1 h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {props.saving ? "Saving…" : (
              <span className="inline-flex items-center gap-1.5">
                Next <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressHeader({
  currentIndex,
  total,
  pct,
  scoreSoFar,
  scoreMax,
  scoreNumeric,
}: {
  currentIndex: number;
  total: number;
  pct: number;
  scoreSoFar: number;
  scoreMax: number;
  scoreNumeric: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="font-medium">
          Question {Math.min(currentIndex + 1, total)} of {total}
        </span>
        <span className="text-muted-foreground">
          Score: <span className="font-medium text-foreground">{scoreSoFar}</span> / 30
        </span>
      </div>
      <div className="h-2 rounded-full bg-[hsl(var(--autopsy-border))] overflow-hidden">
        <div
          className="h-full bg-[hsl(var(--autopsy-accent))] transition-all"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------- VerdictView ------------------------------ */

function VerdictView({
  payload,
  loading,
  runId,
  onReset,
}: {
  payload: GatewayPayload | undefined;
  loading: boolean;
  runId: string | null;
  onReset: () => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading verdict…</p>;
  const run = payload?.run ?? {};

  // Supporting blocks: failure drivers, evidence required, required actions.
  const supportingQuery = useQuery({
    queryKey: ["autopsy", "supporting_blocks", runId],
    queryFn: () => generateSupportingBlocks(runId as string),
    enabled: !!runId,
    retry: false,
  });
  const supportingBlocks: SupportingBlocks | undefined = supportingQuery.data as any;

  // Canonical normalized dimension scores from any backend shape.
  const normalizedDims = normalizeDimensionScores(run);
  // Fallback: also check payload-level fields if run is empty.
  const fallbackDims =
    normalizedDims.length === 0
      ? normalizeDimensionScores({
          dimension_scores:
            (payload as any)?.dimension_scores ??
            (payload as any)?.dimension_totals ??
            (payload as any)?.run_dimension_scores,
          primary_risks: (payload as any)?.primary_risks,
        })
      : normalizedDims;
  const dimensionScores: DimensionScoreRow[] = fallbackDims.map((d) => ({
    code: d.dimension_code,
    label: d.dimension_code,
    score: d.score_total,
  }));
  const hasDimensionData = dimensionScores.length > 0;
  const weakest = (run.weakest_dimension as string) ?? "";

  const verdictName = String(run.verdict_name ?? "");
  const permissionLevel = String(run.permission_level ?? "");
  const isViable =
    /viable/i.test(verdictName) ||
    permissionLevel.toLowerCase() === "granted";
  const hasMeaningfulWeakest = !!(weakest && String(weakest).trim());
  const suppressFailureLanguage = isViable && !hasMeaningfulWeakest;

  const completedAt = run.finalized_at ?? run.completed_at ?? run.updated_at ?? run.created_at;
  const completedLabel = completedAt
    ? new Date(completedAt as string).toLocaleString()
    : "—";

  const verdictBody = run.narrative_output ?? run.verdict_body;
  const hasNarrativeOutput = hasContent(run.narrative_output);
  const primaryConstraint = humanize(run.primary_risk ?? run.weakest_dimension);

  // Diagnostic cascade (pressure topology) — new backend source of truth.
  const cascade =
    (run as any)?.diagnosis?.cascade ??
    (run as any)?.failure_cascade?.diagnostic_cascade ??
    (run as any)?.failure_cascade?.cascade ??
    null;
  const cascadePrimary = cascade?.primary ?? null;
  const cascadeSecondary = cascade?.secondary ?? null;
  const cascadeTertiary = cascade?.tertiary ?? null;
  const cascadeSeverity = cascade?.severity ?? null;
  const hasCascade = !!(cascadePrimary || cascadeSecondary || cascadeTertiary);

  // Hard-fail / blocked classification (display only — backend values untouched)
  const opStateKey = String(run.operational_state ?? "").trim().toLowerCase();
  const isBlocked =
    opStateKey === "blocked" ||
    !!run.hard_fail_question_id ||
    /not[\s_-]?viable/i.test(verdictName) ||
    String(run.permission_level ?? "").toLowerCase() === "locked";
  const effectiveOpState = isBlocked && !opStateKey ? "blocked" : opStateKey;
  const opStyle = operationalStyle(effectiveOpState);

  const scoreNumeric = run.score_total != null ? Number(run.score_total) : null;
  const band: VerdictBand = getVerdictBand({
    verdictName,
    isBlocked,
    score: scoreNumeric,
  });
  const framing = BAND_FRAMING[band];

  // Persist progression state for this run as soon as we know the verdict.
  useEffect(() => {
    if (!runId || !verdictName) return;
    upsertFromVerdict({
      runId,
      verdictName,
      primaryRisk: primaryConstraint,
    });
  }, [runId, verdictName, primaryConstraint]);
  const { state: progression } = useProgression(runId);

  return (
    <div className="space-y-6">
      {/* 1. Verdict Header */}
      <div
        className={cn(
          "rounded-2xl border-2 shadow-sm p-10",
          framing.headerContainerClass,
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isBlocked ? "Status: Completed · Blocking Failure" : "Status: Completed"}
          </span>
          <span className="text-xs text-muted-foreground">{completedLabel}</span>
        </div>
        <div className="flex flex-col items-center text-center space-y-4">
          <h1
            className={cn(
              "text-4xl md:text-5xl font-semibold tracking-tight",
              framing.headerTextClass,
            )}
          >
            {(run.verdict_name as string) ?? "Verdict"}
          </h1>
          {run.score_total != null && (
            <div className="text-base">
              <span className="text-muted-foreground">Score: </span>
              <span className="font-semibold text-foreground text-lg">
                {String(run.score_total)}
              </span>
              <span className="text-muted-foreground"> / 30</span>
            </div>
          )}
          {primaryConstraint && !suppressFailureLanguage && !hasCascade && (
            <Badge
              variant="outline"
              className={cn(
                "uppercase tracking-wider text-[10px] px-3 py-1",
                framing.badgeClass,
              )}
            >
              {framing.rankPrimary} · {primaryConstraint}
            </Badge>
          )}
          {suppressFailureLanguage && (
            <Badge
              variant="outline"
              className={cn("uppercase tracking-wider text-[10px] px-3 py-1", framing.badgeClass)}
            >
              Balanced Profile · No Dominant Constraint
            </Badge>
          )}
        </div>
      </div>

      {/* 2. Run Details — visually understated */}
      <RunDetailsStrip run={run} />

      {/* 3. Operational Governance Layer */}
      <OperationalStatePanel
        run={run}
        isBlocked={isBlocked}
        operatingInstruction={cascadeSeverity?.operating_instruction}
        requiredActionFallback={supportingBlocks?.required_actions?.[0]?.body}
      />
      <ProgressionFlow current={run.operational_state} isBlocked={isBlocked} />

      {/* 4. Dimension Pressure Profile */}
      <SurfaceCard title="Dimension Pressure Profile">
        <p className="text-sm text-muted-foreground mb-4">
          {suppressFailureLanguage
            ? "Scores per dimension. A balanced profile indicates no single dimension is dominating risk."
            : "Scores per dimension, sorted weakest to strongest. The weakest dimension drives the primary constraint."}
        </p>
        <DimensionPressureGraph
          rows={dimensionScores}
          hasData={hasDimensionData}
          weakest={weakest}
          suppress={suppressFailureLanguage}
          opState={effectiveOpState}
        />

        <Collapsible className="mt-4">
          <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" /> What the dimensions mean
          </CollapsibleTrigger>
          <CollapsibleContent className="text-sm text-muted-foreground pt-3 space-y-2">
            {(() => {
              const dict = parseDimensionDictionary((payload as any)?.dimension_dictionary);
              const entries = dict.length
                ? dict
                : [
                    ["Cash Reality", "Whether the business has the cash position and runway to survive the next stage of pressure."],
                    ["Economic Literacy", "Whether the operator understands unit economics, margins, and how money actually moves through the business."],
                    ["Market Reality", "Whether the market is real, reachable, and willing to pay — not assumed or projected."],
                    ["Operational Capacity", "Whether the business can actually deliver the work consistently at the required scale."],
                    ["Execution Discipline", "Whether the operator follows through on commitments, systems, and decisions under pressure."],
                    ["Psychological Resilience", "Whether the operator can sustain effort and judgment through stress, setbacks, and uncertainty."],
                  ] as Array<[string, string]>;
              return entries.map(([name, desc]) => (
                <div key={name}>
                  <span className="font-medium text-foreground">{name}.</span> {desc}
                </div>
              ));
            })()}
          </CollapsibleContent>
        </Collapsible>
      </SurfaceCard>

      {/* 5. Structural Diagnostics */}
      <PressureCollapsePanel run={run} isBlocked={isBlocked} />

      {run.hard_fail_question_id && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 shadow-sm p-6">
          <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-2">
            Blocking Failure Triggered
          </div>
          <p className="text-sm leading-relaxed">
            A hard-fail condition was triggered during the assessment.
            Progression is blocked. The business is not viable in its current
            form. The hard-fail condition must be corrected and retested before
            progression can be reconsidered.
          </p>
        </div>
      )}

      {/* 6. Pressure Topology — interacting business pressures */}
      {hasCascade && (
        <PressureTopology
          primary={cascadePrimary}
          secondary={cascadeSecondary}
          tertiary={cascadeTertiary}
          isBlocked={isBlocked}
          failureDrivers={supportingBlocks?.failure_drivers}
          framing={framing}
        />
      )}

      {/* 7. Mechanical Failure Chain — causal diagram */}
      {suppressFailureLanguage ? (
        <SurfaceCard title="Structural Profile">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              This run shows a balanced dimension profile with no dominant
              failure pressure. No primary constraint is being flagged.
            </p>
            <p className="text-muted-foreground">
              Focus shifts from constraint removal to progression and
              governance: maintain the disciplines that produced this profile
              and prepare for controlled scaling rather than emergency repair.
            </p>
            {hasContent(run.progression_state) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Progression state
                </div>
                <div className="font-medium">{humanize(run.progression_state)}</div>
              </div>
            )}
            {hasContent(run.permission_level) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Permission level
                </div>
                <div className="font-medium">{humanize(run.permission_level)}</div>
              </div>
            )}
          </div>
        </SurfaceCard>
      ) : (
        <MechanicalFailureChain
          run={run}
          isBlocked={isBlocked}
          operatingInstruction={cascadeSeverity?.operating_instruction}
          requiredActionFallback={supportingBlocks?.required_actions?.[0]?.body}
          evidenceFallback={supportingBlocks?.evidence_required?.[0]?.body}
          framing={framing}
        />
      )}

      {/* 7. Verdict Judgement — lead voice with integrated decision block */}
      {hasContent(verdictBody) && (
        <SurfaceCard title="Verdict Judgement">
          {cascadeSeverity && (hasContent(cascadeSeverity.permission_state) || hasContent(cascadeSeverity.operating_instruction)) && (
            <div className="grid gap-4 md:grid-cols-2 mb-6 pb-6 border-b border-[hsl(var(--autopsy-border))]">
              {hasContent(cascadeSeverity.permission_state) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Decision Status</div>
                  <div className="text-base font-semibold text-foreground">
                    {framing.decisionStatusOverride ?? translatePermissionState(cascadeSeverity.permission_state)}
                  </div>
                </div>
              )}
              {(hasContent(cascadeSeverity.operating_instruction) || hasContent(cascadeSeverity.permission_state)) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Allowed Next Move</div>
                  <div className="text-sm leading-relaxed text-foreground">
                    {framing.allowedNextOverride
                      ? framing.allowedNextOverride
                      : hasContent(cascadeSeverity.operating_instruction)
                      ? cascadeSeverity.operating_instruction
                      : (supportingBlocks?.required_actions?.[0]?.body
                          || cleanProceedOnlyIf(translatePermissionState(cascadeSeverity.permission_state), null))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="border-l-4 border-[hsl(var(--autopsy-accent))] pl-5">
            <Prose value={verdictBody} />
          </div>
        </SurfaceCard>
      )}

      {/* 8. Recovery & Retest Gate */}
      <RecoveryRetestPanel
        run={run}
        isBlocked={isBlocked}
        evidenceOverride={supportingBlocks?.evidence_required?.[0]?.body}
        actionOverride={supportingBlocks?.required_actions?.[0]?.body}
      />

      {/* 10. Legacy mechanism sections — only when narrative_output is absent */}
      {!hasNarrativeOutput && !hasCascade && (
        <>
          {hasContent(run.execution_diagnosis) && (
            <SurfaceCard title="Execution diagnosis">
              <Prose value={run.execution_diagnosis} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_1) && (
            <SurfaceCard title="Mechanism — Step 1">
              <Prose value={run.mechanism_step_1} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_2) && (
            <SurfaceCard title="Mechanism — Step 2">
              <Prose value={run.mechanism_step_2} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_3) && (
            <SurfaceCard title="Mechanism — Step 3">
              <Prose value={run.mechanism_step_3} />
            </SurfaceCard>
          )}
          {hasContent(run.final_outcome) && (
            <SurfaceCard title="Final outcome">
              <Prose value={run.final_outcome} />
            </SurfaceCard>
          )}
        </>
      )}
      {/* 11. Worksheet link */}
      <div className="flex flex-wrap gap-2 pt-2">
        {runId && (
          <Button asChild className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]">
            <Link to={`/autopsy/run/${runId}/worksheet`}>Open Worksheet</Link>
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>Start New Analysis</Button>
      </div>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

const OPERATIONAL_STATE_STYLES: Record<
  string,
  { label: string; container: string; dot: string; text: string }
> = {
  blocked: {
    label: "BLOCKED",
    container: "border-red-600/60 bg-red-500/5",
    dot: "bg-red-600",
    text: "text-red-700",
  },
  constrained: {
    label: "CONSTRAINED",
    container: "border-amber-500/60 bg-amber-500/5",
    dot: "bg-amber-500",
    text: "text-amber-700",
  },
  stabilizing: {
    label: "STABILIZING",
    container: "border-blue-500/60 bg-blue-500/5",
    dot: "bg-blue-500",
    text: "text-blue-700",
  },
  operationally_viable: {
    label: "OPERATIONALLY VIABLE",
    container: "border-green-600/60 bg-green-500/5",
    dot: "bg-green-600",
    text: "text-green-700",
  },
  scalable: {
    label: "SCALABLE",
    container: "border-emerald-600/60 bg-emerald-500/5",
    dot: "bg-emerald-600",
    text: "text-emerald-700",
  },
};

function operationalStyle(state: any) {
  const key = String(state ?? "").trim().toLowerCase();
  return (
    OPERATIONAL_STATE_STYLES[key] ?? {
      label: key ? key.replace(/_/g, " ").toUpperCase() : "—",
      container: "border-[hsl(var(--autopsy-border))] bg-muted/30",
      dot: "bg-muted-foreground",
      text: "text-foreground",
    }
  );
}

function OperationalStatePanel({
  run,
  isBlocked,
  operatingInstruction,
  requiredActionFallback,
}: {
  run: any;
  isBlocked?: boolean;
  operatingInstruction?: string | null;
  requiredActionFallback?: string | null;
}) {
  const opKey = String(run.operational_state ?? "").trim().toLowerCase();
  const effective = isBlocked && !opKey ? "blocked" : opKey;
  const style = operationalStyle(effective);
  // Hard-fail display relabelling (does not mutate backend values)
  const progressionDisplay = isBlocked
    ? "PROGRESSION BLOCKED"
    : humanize(run.progression_state) || "—";
  const rawPermissionBias = isBlocked
    ? "STRONG RESTRICTION"
    : humanize(run.permission_bias) || "—";
  const permissionBiasDisplay = cleanProceedOnlyIf(
    rawPermissionBias,
    operatingInstruction || requiredActionFallback,
  );
  const recoveryDisplay = resolveRecoverySignal(run);
  const rows: Array<[string, any]> = [
    ["Progression State", progressionDisplay],
    ["Allowed Next Move", permissionBiasDisplay],
    ["Required Recovery Signal", recoveryDisplay],
  ];
  return (
    <div className={cn("rounded-2xl border-2 shadow-sm p-6", style.container)}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Operational State
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Governance Layer
        </span>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <span className={cn("h-3 w-3 rounded-full", style.dot)} aria-hidden />
        <h2 className={cn("text-3xl md:text-4xl font-bold tracking-tight font-mono", style.text)}>
          {style.label}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[hsl(var(--autopsy-border))] pt-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {label}
            </div>
            <div className="text-sm font-medium break-words whitespace-pre-wrap">
              {hasContent(value) ? (typeof value === "string" ? value : String(value)) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PressureCollapsePanel({ run, isBlocked }: { run: any; isBlocked?: boolean }) {
  const stageDisplay = isBlocked
    ? "BLOCKING FAILURE"
    : humanize(run.pressure_stage);
  const failureTypeDisplay = isBlocked && !hasContent(run.failure_type)
    ? "HARD FAIL"
    : humanize(run.failure_type);
  const suppressPressureSummary = hasContent(run.narrative_output);
  const items: Array<{ label: string; value: any; prose?: boolean }> = [
    { label: "Risk State", value: stageDisplay },
    { label: "Failure Type", value: failureTypeDisplay },
    ...(suppressPressureSummary
      ? []
      : [{ label: "Pressure Summary", value: run.pressure_summary, prose: true }]),
    { label: "Collapse Pattern", value: run.collapse_pattern, prose: true },
  ];
  const visible = items.filter((i) => hasContent(i.value));
  if (visible.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Structural Diagnostics
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Pressure / Collapse
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((i) => (
          <div
            key={i.label}
            className={cn(
              "rounded-lg border border-[hsl(var(--autopsy-border))] p-4 bg-background",
              i.prose && "md:col-span-2",
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {i.label}
            </div>
            <div
              className={cn(
                "text-sm break-words",
                i.prose ? "leading-relaxed whitespace-pre-wrap" : "font-semibold font-mono uppercase tracking-wide",
              )}
            >
              {typeof i.value === "string" ? i.value : JSON.stringify(humanizeDeep(i.value), null, 2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecoveryRetestPanel({
  run,
  isBlocked,
  evidenceOverride,
  actionOverride,
}: {
  run: any;
  isBlocked?: boolean;
  evidenceOverride?: string | null;
  actionOverride?: string | null;
}) {
  const resolved = resolveRecoverySignal(run);
  const recovery =
    hasContent(evidenceOverride)
      ? evidenceOverride
      : resolved === "Recovery signal not returned"
        ? null
        : resolved;
  const retest = hasContent(actionOverride)
    ? actionOverride
    : hasContent(evidenceOverride)
      ? null
      : run.retest_condition;
  const worksheet = run.worksheet_output;
  if (!hasContent(recovery) && !hasContent(retest) && !hasContent(worksheet)) return null;
  const renderBlock = (value: any) => {
    if (value == null) return "—";
    if (typeof value === "string") return value;
    return JSON.stringify(humanizeDeep(value), null, 2);
  };
  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Recovery & Retest Gate
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Controlled Progression
        </span>
      </div>
      <div className="space-y-4">
        {hasContent(recovery) && (
          <div className="rounded-lg border-l-4 border-l-[hsl(var(--autopsy-accent))] border border-[hsl(var(--autopsy-border))] p-4 bg-background">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Required Recovery Signal
            </div>
            <div className="text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
              {renderBlock(recovery)}
            </div>
          </div>
        )}
        {hasContent(retest) && (
          <div className="rounded-lg border-l-4 border-l-blue-500 border border-[hsl(var(--autopsy-border))] p-4 bg-background">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Action required before retesting
            </div>
            {hasContent(actionOverride) ? (
              <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {retest as string}
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {renderBlock(retest)}
              </pre>
            )}
          </div>
        )}
        {hasContent(worksheet) && (
          <div className="rounded-lg border-l-4 border-l-amber-500 border border-[hsl(var(--autopsy-border))] p-4 bg-background">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Worksheet Output
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
              {renderBlock(worksheet)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function SurfaceCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

/* ---------------------- Public-facing label helpers ---------------------- */

const PUBLIC_DIM_NAME_MAP: Record<string, string> = {
  cash_reality: "Cash Runway",
  economic_literacy: "Knowing Your Numbers",
  market_reality: "Real Customer Demand",
  operational_capacity: "Delivery Reliability",
  execution_discipline: "Follow-Through",
  psychological_resilience: "Pressure Tolerance",
};

const RANK_LABEL_MAP: Record<string, string> = {
  primary: "Main Blocker",
  secondary: "Next Pressure",
  tertiary: "Third Pressure",
};

function publicRankLabel(rank?: string): string {
  if (!rank) return "";
  const k = rank.toLowerCase().trim();
  return RANK_LABEL_MAP[k] ?? humanize(rank);
}

function publicDimName(code?: string): string {
  if (!code) return "";
  const k = code.toLowerCase().trim();
  return PUBLIC_DIM_NAME_MAP[k] ?? humanize(code);
}

// Replace stale "Proceed Only If" with a stronger instruction when available.
function cleanProceedOnlyIf(value: string | null | undefined, replacement?: string | null): string {
  const v = (value ?? "").toString().trim();
  const r = (replacement ?? "").toString().trim();
  if (!v) return r;
  if (/proceed\s*only\s*if/i.test(v)) {
    return r || "Proceed only if the required proof is produced.";
  }
  return v;
}

/* ----------------------- Band-aware verdict framing ---------------------- */

export type VerdictBand = "not_viable" | "high_risk" | "viable" | "structurally_viable";

export function getVerdictBand(opts: {
  verdictName: string;
  isBlocked: boolean;
  score: number | null | undefined;
}): VerdictBand {
  const { verdictName, isBlocked, score } = opts;
  if (isBlocked || /not[\s_-]?viable/i.test(verdictName)) return "not_viable";
  if (/structurally[\s_-]?viable/i.test(verdictName)) return "structurally_viable";
  if (/high[\s_-]?risk/i.test(verdictName)) return "high_risk";
  if (/viable/i.test(verdictName)) return "viable";
  const s = typeof score === "number" ? score : Number(score);
  if (Number.isFinite(s)) {
    if (s >= 26) return "structurally_viable";
    if (s >= 20) return "viable";
    if (s >= 12) return "high_risk";
    return "not_viable";
  }
  return "high_risk";
}

export interface BandFraming {
  rankPrimary: string;
  rankSecondary: string;
  rankTertiary: string;
  topologyTitle: string;
  topologyIntro: string;
  chainTitle: string;
  chainNote?: string;
  pathLabel: string;
  proofLabel: string;
  outcomeLabel: string;
  decisionStatusOverride?: string;
  allowedNextOverride?: string;
  headerTextClass: string;
  headerContainerClass: string;
  badgeClass: string;
  failureOriented: boolean;
}

export const BAND_FRAMING: Record<VerdictBand, BandFraming> = {
  not_viable: {
    rankPrimary: "Main Blocker",
    rankSecondary: "Next Pressure",
    rankTertiary: "Third Pressure",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Interacting business pressures, ranked by structural weight. The Main Blocker drives failure; the others compound it.",
    chainTitle: "Failure Chain",
    pathLabel: "Failure Path",
    proofLabel: "Proof Required Before Proceeding",
    outcomeLabel: "Stop — Do Not Proceed",
    headerTextClass: "text-red-700",
    headerContainerClass: "border-red-600/60 bg-red-500/5",
    badgeClass: "border-red-600 text-red-700 bg-red-500/10",
    failureOriented: true,
  },
  high_risk: {
    rankPrimary: "Main Blocker",
    rankSecondary: "Next Pressure",
    rankTertiary: "Third Pressure",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Interacting business pressures, ranked by structural weight. The Main Blocker dominates; the others compound it.",
    chainTitle: "Pressure Chain",
    pathLabel: "Pressure Path",
    proofLabel: "Evidence Required",
    outcomeLabel: "Proceed Only If",
    headerTextClass: "text-orange-600",
    headerContainerClass: "border-orange-500/60 bg-orange-500/5",
    badgeClass: "border-orange-500 text-orange-700 bg-orange-500/10",
    failureOriented: true,
  },
  viable: {
    rankPrimary: "Primary Watchpoint",
    rankSecondary: "Secondary Watchpoint",
    rankTertiary: "Third Watchpoint",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Watchpoints ranked by structural weight. These are the areas most likely to weaken first if operating pressure increases.",
    chainTitle: "Stability Risks",
    pathLabel: "Stability Risk",
    proofLabel: "Required Controls",
    outcomeLabel: "Execution Conditions",
    headerTextClass: "text-amber-600",
    headerContainerClass: "border-amber-500/60 bg-amber-500/5",
    badgeClass: "border-amber-500 text-amber-700 bg-amber-500/10",
    failureOriented: false,
  },
  structurally_viable: {
    rankPrimary: "Primary Watchpoint",
    rankSecondary: "Secondary Watchpoint",
    rankTertiary: "Third Watchpoint",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Areas to monitor under operating load. Permission is granted under discipline — not guaranteed performance.",
    chainTitle: "Execution Watchpoints",
    chainNote:
      "These are the areas most likely to weaken first if operating pressure increases.",
    pathLabel: "Execution Watchpoint",
    proofLabel: "Execution Controls",
    outcomeLabel: "Operating Discipline",
    decisionStatusOverride: "Proceed with disciplined execution.",
    allowedNextOverride:
      "Proceed with execution and ongoing telemetry. Retest if assumptions or operating load materially change.",
    headerTextClass: "text-emerald-700",
    headerContainerClass: "border-emerald-600/60 bg-emerald-500/5",
    badgeClass: "border-emerald-600 text-emerald-700 bg-emerald-500/10",
    failureOriented: false,
  },
};

/* -------------------------- SupportingDiagnosis -------------------------- */

function SupportingDiagnosis({ blocks }: { blocks?: SupportingBlocks }) {
  if (!blocks) return null;
  const groups: Array<{ key: keyof SupportingBlocks; title: string }> = [
    { key: "failure_drivers", title: "Failure Drivers" },
    { key: "evidence_required", title: "Evidence Required" },
    { key: "required_actions", title: "Required Actions" },
  ];
  const visibleGroups = groups
    .map((g) => ({ ...g, items: (blocks[g.key] as SupportingBlockItem[] | undefined) ?? [] }))
    .filter((g) => g.items.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <SurfaceCard title="Supporting Diagnosis">
      <p className="text-sm text-muted-foreground mb-5">
        The issues below explain why this result was reached and what must be proven before moving forward.
      </p>
      <div className="space-y-6">
        {visibleGroups.map((g) => (
          <div key={String(g.key)}>
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
              {g.title}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {g.items.map((item, idx) => {
                const rank = publicRankLabel(item.rank);
                const dim = publicDimName(item.dimension_code);
                return (
                  <div
                    key={`${String(g.key)}-${idx}`}
                    className="rounded-lg border border-[hsl(var(--autopsy-border))] bg-background p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      {rank && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--autopsy-accent))]">
                          {rank}
                        </span>
                      )}
                      {dim && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {dim}
                        </span>
                      )}
                    </div>
                    {hasContent(item.body) && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function KV({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-medium break-words">
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

function ChainItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: any;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--autopsy-border))] p-3">
      <span className="h-8 w-8 rounded-md bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm break-words">
          {value == null || value === "" ? "—" : typeof value === "string" ? value : JSON.stringify(value)}
        </div>
      </div>
    </div>
  );
}

function ChainCard({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ label: string; value: any; prose?: boolean }>;
}) {
  const visible = rows.filter((r) => hasContent(r.value));
  if (visible.length === 0) return null;
  return (
    <div className="rounded-xl border border-[hsl(var(--autopsy-border))] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-7 w-7 rounded-md bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="text-sm font-semibold tracking-tight">{title}</div>
      </div>
      <div className="space-y-3">
        {visible.map((r) => (
          <div key={r.label}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {r.label}
            </div>
            {r.prose ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {typeof r.value === "string" ? r.value : JSON.stringify(humanizeDeep(r.value), null, 2)}
              </div>
            ) : (
              <div className="text-sm font-medium break-words">{String(r.value)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseDimensionDictionary(raw: any): Array<[string, string]> {
  if (!raw) return [];
  const out: Array<[string, string]> = [];
  const push = (name: any, desc: any) => {
    const n = humanize(name);
    const d = typeof desc === "string" ? desc : "";
    if (n && d) out.push([n, d]);
  };
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      push(
        r.label ?? r.name ?? r.dimension_code ?? r.code ?? r.dimension,
        r.description ?? r.definition ?? r.explanation ?? r.summary,
      );
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") push(k, v);
      else if (v && typeof v === "object")
        push(
          (v as any).label ?? (v as any).name ?? k,
          (v as any).description ?? (v as any).definition ?? (v as any).explanation,
        );
    }
  }
  return out;
}

function Prose({ value }: { value: any }) {
  if (value == null || value === "") return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{text}</pre>
  );
}

interface DimensionScoreRow {
  code: string;
  label?: string;
  score: number;
}

function parseDimensionScores(raw: any): { rows: DimensionScoreRow[]; hasData: boolean } {
  if (raw == null) return { rows: [], hasData: false };
  const rows: DimensionScoreRow[] = [];
  let anyExplicitScore = false;
  const readScore = (v: any): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r == null || typeof r !== "object") continue;
      const code = String(r.code ?? r.dimension_code ?? r.dimension ?? r.label ?? "");
      const label = r.label ?? r.name ?? code;
      const rawScore =
        r.score ?? r.value ?? r.total ?? r.raw_score ?? r.total_score ??
        r.score_total ?? r.points ?? r.sum ?? r.dimension_score;
      const score = readScore(rawScore);
      if (!code) continue;
      if (score != null) {
        anyExplicitScore = true;
        rows.push({ code, label, score });
      } else {
        rows.push({ code, label, score: 0 });
      }
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      let score: number | null = null;
      if (typeof v === "number") score = v;
      else if (v && typeof v === "object")
        score = readScore(
          (v as any).score ?? (v as any).value ?? (v as any).total ??
          (v as any).raw_score ?? (v as any).total_score ??
          (v as any).score_total ?? (v as any).points ?? (v as any).sum ??
          (v as any).dimension_score,
        );
      else score = readScore(v);
      if (score != null) {
        anyExplicitScore = true;
        rows.push({ code: k, label: k, score });
      } else {
        rows.push({ code: k, label: k, score: 0 });
      }
    }
  }
  rows.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return { rows, hasData: anyExplicitScore };
}

/**
 * Normalize dimension scores from any of the backend shapes into a canonical
 * array of { dimension_code, score_total }.
 * Shapes supported:
 *   A. object map     run.dimension_scores = { cash_reality: 2, ... }
 *   B. array          run.dimension_scores = [{ dimension_code, score_total }, ...]
 *   C. primary_risks  run.primary_risks    = [{ dimension_code, score_total }, ...]
 */
function normalizeDimensionScores(
  run: any,
): Array<{ dimension_code: string; score_total: number }> {
  if (!run || typeof run !== "object") return [];
  const readNum = (v: any): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const fromArray = (
    arr: any[],
  ): Array<{ dimension_code: string; score_total: number }> => {
    const out: Array<{ dimension_code: string; score_total: number }> = [];
    for (const r of arr) {
      if (!r || typeof r !== "object") continue;
      const code = String(
        r.dimension_code ?? r.code ?? r.dimension ?? r.label ?? "",
      );
      if (!code) continue;
      const score =
        readNum(r.score_total) ??
        readNum(r.total_score) ??
        readNum(r.score) ??
        readNum(r.total) ??
        readNum(r.raw_score) ??
        readNum(r.value) ??
        readNum(r.points) ??
        readNum(r.sum) ??
        readNum(r.dimension_score);
      if (score == null) continue;
      out.push({ dimension_code: normalizeDimKey(code), score_total: score });
    }
    return out;
  };

  const ds = run.dimension_scores;
  if (ds != null) {
    if (Array.isArray(ds)) {
      const arr = fromArray(ds);
      if (arr.length) return arr;
    } else if (typeof ds === "object") {
      const out: Array<{ dimension_code: string; score_total: number }> = [];
      for (const [k, v] of Object.entries(ds)) {
        let s: number | null = null;
        if (typeof v === "number") s = v;
        else if (v && typeof v === "object")
          s =
            readNum((v as any).score_total) ??
            readNum((v as any).total_score) ??
            readNum((v as any).score) ??
            readNum((v as any).total) ??
            readNum((v as any).value);
        else s = readNum(v);
        if (s == null) continue;
        out.push({ dimension_code: normalizeDimKey(k), score_total: s });
      }
      if (out.length) return out;
    }
  }

  if (Array.isArray(run.primary_risks)) {
    const arr = fromArray(run.primary_risks);
    if (arr.length) return arr;
  }
  if (Array.isArray(run.run_dimension_scores)) {
    const arr = fromArray(run.run_dimension_scores);
    if (arr.length) return arr;
  }
  return [];
}

/**
 * Resolve the Required Recovery Signal display string from the run payload.
 * Preference order:
 *  1. run.required_recovery_signal
 *  2. run.dimension_recovery_validation[primary_risk_code]
 *  3. "Recovery signal not returned"
 */
function resolveRecoverySignal(run: any): string {
  if (!run || typeof run !== "object") return "Recovery signal not returned";
  const direct = run.required_recovery_signal;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const key = normalizeDimKey(
    run.primary_risk_code ?? run.primary_risk ?? run.weakest_dimension,
  );
  const map = run.dimension_recovery_validation;
  if (key && map && typeof map === "object" && !Array.isArray(map)) {
    for (const [k, v] of Object.entries(map)) {
      if (normalizeDimKey(k) === key) {
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object") {
          const s =
            (v as any).signal ??
            (v as any).text ??
            (v as any).description ??
            (v as any).label;
          if (typeof s === "string" && s.trim()) return s.trim();
        }
      }
    }
  }
  return "Recovery signal not returned";
}

/* --------------------------- Verdict UX components ------------------------- */

const CANONICAL_DIMENSIONS: Array<{ code: string; label: string }> = [
  { code: "cash_reality", label: "Cash Reality" },
  { code: "economic_literacy", label: "Economic Literacy" },
  { code: "market_reality", label: "Market Reality" },
  { code: "operational_capacity", label: "Operational Capacity" },
  { code: "execution_discipline", label: "Execution Discipline" },
  { code: "psychological_resilience", label: "Psychological Resilience" },
];

function normalizeDimKey(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function RunDetailsStrip({ run }: { run: any }) {
  const items: Array<[string, any]> = [
    ["Run", run.run_name],
    ["Tester", run.tester_email],
    ["Industry", run.industry],
    ["Scenario", humanize(run.scenario)],
    ["Operator", humanize(run.operator_class)],
  ];
  return (
    <div className="rounded-lg border border-[hsl(var(--autopsy-border))] bg-background/40 px-4 py-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="text-xs text-foreground/80 truncate">
              {value == null || value === "" ? "—" : String(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DimensionPressureGraph({
  rows,
  hasData,
  weakest,
  suppress,
  opState,
}: {
  rows: DimensionScoreRow[];
  hasData: boolean;
  weakest: string;
  suppress: boolean;
  opState: string;
}) {
  // Merge backend rows with canonical 6 so all dimensions are always shown.
  const byKey = new Map<string, DimensionScoreRow>();
  for (const r of rows) byKey.set(normalizeDimKey(r.code), r);
  const merged = CANONICAL_DIMENSIONS.map((c) => {
    const found = byKey.get(c.code);
    return {
      code: c.code,
      label: c.label,
      score: found?.score ?? 0,
      present: !!found && hasData,
    };
  });
  // sort weakest -> strongest when data exists
  if (hasData) merged.sort((a, b) => a.score - b.score);

  const max = Math.max(...merged.map((m) => m.score), 5);
  const weakestKey = normalizeDimKey(weakest);
  const style = operationalStyle(opState);
  // Bar color by operational state band
  const barColorClass =
    opState === "blocked"
      ? "bg-red-600"
      : opState === "constrained"
      ? "bg-amber-500"
      : opState === "stabilizing"
      ? "bg-blue-500"
      : opState === "operationally_viable"
      ? "bg-green-600"
      : opState === "scalable"
      ? "bg-emerald-600"
      : "bg-[hsl(var(--autopsy-accent))]";

  return (
    <div className="space-y-3">
      {!hasData && (
        <p className="text-xs text-muted-foreground italic">
          Backend did not return per-dimension scores for this run. Showing
          canonical dimensions only.
        </p>
      )}
      {merged.map((d) => {
        const isWeakest =
          !suppress &&
          weakestKey &&
          (normalizeDimKey(d.code) === weakestKey ||
            normalizeDimKey(d.label) === weakestKey);
        const pct = Math.max(2, (d.score / max) * 100);
        return (
          <div key={d.code}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className={cn("font-medium inline-flex items-center gap-2", isWeakest && style.text)}>
                {d.label}
                {isWeakest && (
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    opState === "blocked"
                      ? "bg-red-500/10 text-red-700 border-red-600/40"
                      : "bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] border-[hsl(var(--autopsy-accent))]/30",
                  )}>
                    Main Blocker
                  </span>
                )}
              </span>
              <span className="text-muted-foreground tabular-nums">{d.present ? d.score : "—"}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[hsl(var(--autopsy-border))] overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  isWeakest ? "bg-red-600" : barColorClass,
                  !d.present && "opacity-30",
                )}
                style={{ width: `${d.present ? pct : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PROGRESSION_STAGES = [
  { key: "blocked", label: "Blocked" },
  { key: "constrained", label: "Constrained" },
  { key: "stabilizing", label: "Stabilizing" },
  { key: "operationally_viable", label: "Operationally Viable" },
  { key: "scalable", label: "Scalable" },
];

function ProgressionFlow({ current, isBlocked }: { current: any; isBlocked?: boolean }) {
  const key = String(current ?? "").trim().toLowerCase();
  const activeKey = isBlocked && !key ? "blocked" : key;
  const activeIdx = PROGRESSION_STAGES.findIndex((s) => s.key === activeKey);
  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Progression State Flow
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Operational Permission Ladder
        </span>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {PROGRESSION_STAGES.map((s, idx) => {
          const isActive = idx === activeIdx;
          const style = operationalStyle(s.key);
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
              <div
                className={cn(
                  "flex-1 rounded-md border px-2 py-2 text-center transition-all min-w-0",
                  isActive
                    ? cn("border-2 shadow-sm", style.container, style.text)
                    : "border-[hsl(var(--autopsy-border))] text-muted-foreground/70 bg-background",
                )}
              >
                <div className={cn("h-2 w-2 rounded-full mx-auto mb-1", isActive ? style.dot : "bg-muted-foreground/30")} />
                <div className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider truncate",
                  isActive && "font-mono",
                )}>
                  {s.label}
                </div>
              </div>
              {idx < PROGRESSION_STAGES.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PressureTopology({
  primary,
  secondary,
  tertiary,
  isBlocked,
  failureDrivers,
  framing,
}: {
  primary: any;
  secondary: any;
  tertiary: any;
  isBlocked?: boolean;
  failureDrivers?: SupportingBlockItem[];
  framing?: BandFraming;
}) {
  const PUBLIC_DIM_NAME: Record<string, string> = {
    cash_reality: "Cash Runway",
    economic_literacy: "Knowing Your Numbers",
    market_reality: "Real Customer Demand",
    operational_capacity: "Delivery Reliability",
    execution_discipline: "Follow-Through",
    psychological_resilience: "Pressure Tolerance",
  };
  const DIM_EXPLANATION: Record<string, string> = {
    cash_reality:
      "Cash runway is exposed. Limited buffer increases pressure and reduces room for mistakes.",
    economic_literacy:
      "The business economics are not clear enough. Pricing, margin, or cost drivers may be hiding the real risk.",
    market_reality:
      "Demand is not yet proven strongly enough. Interest is not the same as reliable paying customers.",
    operational_capacity:
      "Delivery reliability is still weak. The business has not proven it can perform consistently under real operating pressure.",
    execution_discipline:
      "Execution rhythm is not yet reliable. The business may depend too heavily on intention rather than completed action.",
    psychological_resilience:
      "Pressure tolerance is not yet proven. Stress, uncertainty, or setbacks may distort decisions before the business stabilises.",
  };
  const publicNameFor = (data: any): string => {
    const code = String(data?.dimension_code ?? "").toLowerCase().trim();
    if (PUBLIC_DIM_NAME[code]) return PUBLIC_DIM_NAME[code];
    return data?.dimension_label ?? humanize(data?.dimension_code) ?? "—";
  };
  const explanationFor = (data: any): string | null => {
    const code = String(data?.dimension_code ?? "").toLowerCase().trim();
    const rank = String(data?.rank ?? "").toLowerCase().trim();
    const driver = (failureDrivers ?? []).find((d) => {
      const dCode = String(d?.dimension_code ?? "").toLowerCase().trim();
      const dRank = String(d?.rank ?? "").toLowerCase().trim();
      return (code && dCode === code) || (rank && dRank === rank);
    });
    const body = (driver?.body ?? "").toString().trim();
    if (body) {
      // Keep micro-explanation to one short sentence.
      const firstSentence = body.split(/(?<=[.!?])\s+/)[0];
      return firstSentence || body;
    }
    return DIM_EXPLANATION[code] ?? null;
  };
  const tiers: Array<{
    rank: string;
    data: any;
    emphasis: "primary" | "secondary" | "tertiary";
  }> = [
    { rank: framing?.rankPrimary ?? "Main Blocker", data: primary, emphasis: "primary" },
    { rank: framing?.rankSecondary ?? "Next Pressure", data: secondary, emphasis: "secondary" },
    { rank: framing?.rankTertiary ?? "Third Pressure", data: tertiary, emphasis: "tertiary" },
  ].filter((t) => t.data) as any;

  if (tiers.length === 0) return null;

  return (
    <SurfaceCard title={framing?.topologyTitle ?? "Pressure Topology"}>
      <p className="text-sm text-muted-foreground mb-4">
        {framing?.topologyIntro ?? "Interacting business pressures, ranked by structural weight on the verdict. The Main Blocker is the dominant pressure; the others compound it."}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((t) => {
          const dim = publicNameFor(t.data);
          const explanation = explanationFor(t.data);
          const score = t.data.score_total;
          const isMain = t.emphasis === "primary";
          const isMid = t.emphasis === "secondary";
          return (
            <div
              key={t.rank}
              className={cn(
                "rounded-xl border p-5 transition-all",
                isMain
                  ? cn(
                      "border-2 shadow-sm",
                      isBlocked
                        ? "border-red-600/60 bg-red-500/5"
                        : "border-[hsl(var(--autopsy-accent))]/60 bg-[hsl(var(--autopsy-accent))]/5",
                    )
                  : isMid
                    ? "border-[hsl(var(--autopsy-border))] bg-[hsl(var(--autopsy-surface))]"
                    : "border-[hsl(var(--autopsy-border))]/60 bg-background opacity-90",
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider mb-2",
                  isMain
                    ? isBlocked
                      ? "text-red-700"
                      : "text-[hsl(var(--autopsy-accent))]"
                    : "text-muted-foreground",
                )}
              >
                {t.rank}
              </div>
              <div
                className={cn(
                  "font-semibold leading-tight mb-1 text-foreground",
                  isMain ? "text-xl" : isMid ? "text-base" : "text-sm",
                )}
              >
                {dim || "—"}
              </div>
              {score != null && (
                <div
                  className={cn(
                    "inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 mb-3",
                    "border-[hsl(var(--autopsy-border))] bg-background",
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</span>
                  <span className={cn("font-mono font-semibold", isMain ? "text-base" : "text-sm")}>
                    {String(score)}
                  </span>
                </div>
              )}
              {explanation && (
                <p className="text-xs leading-relaxed text-muted-foreground">{explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

function MechanicalFailureChain({
  run,
  isBlocked,
  operatingInstruction,
  requiredActionFallback,
  evidenceFallback,
  framing,
}: {
  run: any;
  isBlocked?: boolean;
  operatingInstruction?: string | null;
  requiredActionFallback?: string | null;
  evidenceFallback?: string | null;
  framing?: BandFraming;
}) {
  const style = operationalStyle(isBlocked ? "blocked" : String(run.operational_state ?? "").toLowerCase());
  const primary = humanize(run.weakest_dimension ?? run.primary_risk) || "Unidentified";
  const failurePath =
    (typeof run.collapse_pattern === "string" && run.collapse_pattern.trim()) ||
    humanize(run.failure_shape) ||
    humanize(run.failure_type) ||
    "Failure path not specified";
  const rawBreakpoint =
    (typeof run.retest_condition === "string" && run.retest_condition.trim()) ||
    (typeof run.required_recovery_signal === "string" && run.required_recovery_signal.trim()) ||
    "";
  const breakpoint =
    cleanProceedOnlyIf(rawBreakpoint, evidenceFallback || operatingInstruction) ||
    "Required proof not specified";
  const rawOutcome = isBlocked
    ? "Progression is blocked. Not viable in current form until the hard-fail condition is corrected and retested."
    : humanize(run.progression_state) ||
      "Operational outcome pending recovery signal verification.";
  const outcome =
    cleanProceedOnlyIf(rawOutcome, operatingInstruction || requiredActionFallback) ||
    rawOutcome;

  const nodes: Array<{ icon: React.ReactNode; label: string; value: string; prose?: boolean; tone: "primary" | "step" | "breakpoint" | "outcome" }> = [
    { icon: <Activity className="h-4 w-4" />, label: framing?.rankPrimary ?? "Main Blocker", value: primary, tone: "primary" },
    { icon: <Target className="h-4 w-4" />, label: framing?.pathLabel ?? "Failure Path", value: failurePath, prose: true, tone: "step" },
    { icon: <Wrench className="h-4 w-4" />, label: framing?.proofLabel ?? "Proof Required", value: breakpoint, prose: true, tone: "breakpoint" },
    { icon: <AlertTriangle className="h-4 w-4" />, label: framing?.outcomeLabel ?? "Allowed Next Move", value: outcome, prose: true, tone: "outcome" },
  ];

  const toneClass = (tone: string) => {
    if (tone === "primary") return cn("border-2", style.container);
    if (tone === "outcome") return isBlocked ? "border-red-600/50 bg-red-500/5" : "border-[hsl(var(--autopsy-border))]";
    return "border-[hsl(var(--autopsy-border))] bg-background";
  };

  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {framing?.chainTitle ?? "Mechanical Failure Chain"}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Causal Sequence
        </span>
      </div>
      {framing?.chainNote && (
        <p className="text-sm text-muted-foreground mb-4">{framing.chainNote}</p>
      )}
      <div className="flex flex-col items-stretch">
        {nodes.map((n, idx) => (
          <div key={n.label} className="flex flex-col items-stretch">
            <div className={cn("rounded-lg border p-4", toneClass(n.tone))}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-6 w-6 rounded-md bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] flex items-center justify-center shrink-0">
                  {n.icon}
                </span>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {n.label}
                </div>
              </div>
              <div className={cn(
                "text-sm break-words",
                n.prose ? "leading-relaxed whitespace-pre-wrap" : "font-semibold",
              )}>
                {n.value}
              </div>
            </div>
            {idx < nodes.length - 1 && (
              <div className="flex justify-center py-2" aria-hidden>
                <ArrowDown className={cn("h-5 w-5", style.text, "opacity-70")} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}