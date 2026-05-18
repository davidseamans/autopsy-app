import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
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

  const rawDimensions =
    run.dimension_scores ??
    run.dimension_totals ??
    run.dimension_pressure_profile ??
    (payload as any)?.dimension_scores ??
    (payload as any)?.dimension_totals ??
    null;
  const { rows: dimensionScores, hasData: hasDimensionData } =
    parseDimensionScores(rawDimensions);
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
  const primaryConstraint = humanize(run.primary_risk ?? run.weakest_dimension);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-10">
        <div className="flex items-center justify-between mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status: Completed
          </span>
          <span className="text-xs text-muted-foreground">{completedLabel}</span>
        </div>
        <div className="flex flex-col items-center text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[hsl(var(--autopsy-accent))]">
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
          {primaryConstraint && !suppressFailureLanguage && (
            <Badge
              variant="outline"
              className="border-[hsl(var(--autopsy-accent))] text-[hsl(var(--autopsy-accent))] uppercase tracking-wider text-[10px] px-3 py-1"
            >
              Primary Constraint · {primaryConstraint}
            </Badge>
          )}
          {suppressFailureLanguage && (
            <Badge
              variant="outline"
              className="border-[hsl(var(--autopsy-accent))] text-[hsl(var(--autopsy-accent))] uppercase tracking-wider text-[10px] px-3 py-1"
            >
              Balanced Profile · No Dominant Constraint
            </Badge>
          )}
        </div>
      </div>

      {/* SECTION 1 — Operational State Header */}
      <OperationalStatePanel run={run} />

      {/* SECTION 2 — Pressure & Collapse */}
      <PressureCollapsePanel run={run} />

      {/* SECTION 3 — Recovery & Retest */}
      <RecoveryRetestPanel run={run} />

      {/* Run details */}
      <SurfaceCard title="Run details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <KV label="Run name" value={run.run_name} />
          <KV label="Tester email" value={run.tester_email} />
          <KV label="Industry" value={run.industry} />
          <KV label="Scenario" value={humanize(run.scenario)} />
          <KV label="Operator profile" value={humanize(run.operator_class)} />
        </div>
      </SurfaceCard>

      {/* Dimension Pressure Profile */}
      <SurfaceCard title="Dimension Pressure Profile">
        <p className="text-sm text-muted-foreground mb-4">
          {suppressFailureLanguage
            ? "Scores per dimension. A balanced profile indicates no single dimension is dominating risk."
            : "Scores per dimension, sorted weakest to strongest. The weakest dimension drives the primary constraint."}
        </p>
        {!hasDimensionData ? (
          <p className="text-sm text-muted-foreground">
            Dimension profile not returned by backend for this run. Refresh or
            re-open from History once finalized data is available.
          </p>
        ) : dimensionScores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dimension scores available.</p>
        ) : (
          <div className="space-y-2">
            {dimensionScores.map((d) => {
              const max = Math.max(...dimensionScores.map((x) => x.score || 0), 1);
              const pct = ((d.score ?? 0) / max) * 100;
              const isWeakest =
                !suppressFailureLanguage &&
                weakest && (d.code === weakest || d.label === weakest);
              return (
                <div key={d.code}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={cn("font-medium inline-flex items-center gap-2", isWeakest && "text-[hsl(var(--autopsy-accent))]")}>
                      {humanize(d.label || d.code)}
                      {isWeakest && (
                        <span className="inline-flex items-center rounded-full bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] border border-[hsl(var(--autopsy-accent))]/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                          Primary Constraint
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{d.score}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[hsl(var(--autopsy-border))] overflow-hidden">
                    <div
                      className="h-full bg-[hsl(var(--autopsy-accent))]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

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

      {/* Mechanical Failure Chain */}
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
      <SurfaceCard title="Mechanical Failure Chain">
        <div className="space-y-4">
          <ChainCard
            icon={<Activity className="h-4 w-4" />}
            title="Primary Constraint"
            rows={[
              { label: "Weakest dimension", value: humanize(run.weakest_dimension ?? run.primary_risk) },
              { label: "Pressure stage", value: humanize(run.pressure_stage) },
              { label: "Summary", value: run.pressure_summary, prose: true },
            ]}
          />
          <ChainCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Constraint Effect"
            rows={[
              { label: "Failure type", value: humanize(run.failure_type) },
              { label: "Failure speed", value: humanize(run.failure_speed) },
              { label: "Visibility", value: humanize(run.visibility) },
              { label: "Narrative tone", value: humanize(run.narrative_tone) },
              { label: "Recoverability", value: humanize(run.recoverability) },
            ]}
          />
          <ChainCard
            icon={<Target className="h-4 w-4" />}
            title="Failure Path"
            rows={[
              { label: "Collapse pattern", value: run.collapse_pattern, prose: true },
              { label: "Failure shape", value: humanize(run.failure_shape) },
            ]}
          />
          <ChainCard
            icon={<Wrench className="h-4 w-4" />}
            title="Required Breakpoint"
            rows={[
              { label: "Progression state", value: humanize(run.progression_state) },
              { label: "Permission bias", value: humanize(run.permission_bias) },
              { label: "Retest condition", value: run.retest_condition, prose: true },
            ]}
          />
        </div>
      </SurfaceCard>
      )}

      {run.hard_fail_question_id && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 shadow-sm p-6">
          <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-2">
            Hard Fail Triggered
          </div>
          <p className="text-sm leading-relaxed">
            A critical failure condition was triggered during the assessment.
            The final verdict has been restricted until the failed constraint is
            corrected and retested.
          </p>
        </div>
      )}

      {hasContent(verdictBody) && (
        <SurfaceCard title="What this verdict means">
          <Prose value={verdictBody} />
        </SurfaceCard>
      )}
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

function OperationalStatePanel({ run }: { run: any }) {
  const style = operationalStyle(run.operational_state);
  const rows: Array<[string, any]> = [
    ["Progression State", humanize(run.progression_state)],
    ["Permission Bias", humanize(run.permission_bias)],
    ["Required Recovery Signal", run.required_recovery_signal],
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

function PressureCollapsePanel({ run }: { run: any }) {
  const items: Array<{ label: string; value: any; prose?: boolean }> = [
    { label: "Pressure Stage", value: humanize(run.pressure_stage) },
    { label: "Failure Type", value: humanize(run.failure_type) },
    { label: "Pressure Summary", value: run.pressure_summary, prose: true },
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

function RecoveryRetestPanel({ run }: { run: any }) {
  const recovery = run.required_recovery_signal;
  const retest = run.retest_condition;
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
              Retest Condition
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
              {renderBlock(retest)}
            </pre>
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
      const rawScore = r.score ?? r.value ?? r.total;
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
      else if (v && typeof v === "object") score = readScore((v as any).score ?? (v as any).value ?? (v as any).total);
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