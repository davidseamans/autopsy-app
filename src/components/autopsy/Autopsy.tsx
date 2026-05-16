import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Skull,
  History,
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

export function Autopsy({ initialRunId }: { initialRunId?: string } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(initialRunId ? "verdict" : "start");
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  const [error, setError] = useState<RpcError | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [localAnswers, setLocalAnswers] = useState<Record<string, string | number>>({});
  const [pendingSelection, setPendingSelection] = useState<string | number | null>(null);

  const [industry, setIndustry] = useState("Cleaning");
  const [scenario, setScenario] = useState("startup");
  const [operatorClass, setOperatorClass] = useState("unproven");
  const [runName, setRunName] = useState("");
  const [testerEmail, setTesterEmail] = useState("");

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
      setAnsweredIds((prev) => {
        const next = new Set(prev);
        next.add(String(vars.question_id));
        return next;
      });
      setLocalAnswers((prev) => ({
        ...prev,
        [String(vars.question_id)]: vars.selected_option,
      }));
      setPendingSelection(null);
      await qc.invalidateQueries({ queryKey: ["autopsy", "payload", runId] });
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
      await qc.invalidateQueries({ queryKey: ["autopsy", "payload", runId] });
      setView("verdict");
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
    const idx = questions.findIndex((q) => !isAnswered(q));
    return idx === -1 ? Math.max(0, questions.length - 1) : idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answeredIds]);
  const currentQuestion = questions[currentIndex];
  const allAnswered = questions.length > 0 && questions.every(isAnswered);

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
    return { scoreSoFar: sum, scoreMax: max, scoreNumeric: anyNumeric };
  }, [questions, localAnswers]);

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

  function handleNext() {
    if (!runId || !currentQuestion || pendingSelection == null) return;
    answerMutation.mutate({
      run_id: runId,
      question_id: currentQuestion.question_id,
      selected_option: pendingSelection,
    });
  }

  function handleFinalize() {
    if (!runId) return;
    finalizeMutation.mutate(runId);
  }

  function handleReset() {
    setRunId(null);
    setView("start");
    setError(null);
    setAnsweredIds(new Set());
    setLocalAnswers({});
    setPendingSelection(null);
    setRunName("");
    setTesterEmail("");
    navigate("/autopsy");
  }

  const debug = isDebug();

  return (
    <div className="min-h-screen bg-[hsl(var(--autopsy-bg))]">
      <div className="container max-w-3xl py-10 space-y-6">
        <div className="flex items-center justify-between">
          {view === "verdict" ? (
            <Link
              to="/autopsy/history"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          ) : (
            <span />
          )}
          <Link
            to="/autopsy/history"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <History className="h-4 w-4" /> Run History
          </Link>
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
            saving={answerMutation.isPending}
            currentQuestion={currentQuestion}
            currentIndex={currentIndex}
            total={questions.length}
            allAnswered={allAnswered}
            pendingSelection={pendingSelection}
            onSelect={setPendingSelection}
            onNext={handleNext}
            onFinalize={handleFinalize}
            finalizing={finalizeMutation.isPending}
            scoreSoFar={scoreSoFar}
            scoreMax={scoreMax}
            scoreNumeric={scoreNumeric}
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
  onFinalize: () => void;
  finalizing: boolean;
  scoreSoFar: number;
  scoreMax: number;
  scoreNumeric: boolean;
}) {
  if (props.loading) {
    return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  }
  if (props.total === 0) {
    return <p className="text-sm text-muted-foreground">No questions returned.</p>;
  }

  const pct = ((props.currentIndex + (props.allAnswered ? 1 : 0)) / props.total) * 100;

  if (props.allAnswered) {
    return (
      <div className="space-y-4">
        <ProgressHeader
          currentIndex={props.currentIndex}
          total={props.total}
          pct={100}
          scoreSoFar={props.scoreSoFar}
          scoreMax={props.scoreMax}
          scoreNumeric={props.scoreNumeric}
        />
        <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-8 text-center">
          <h2 className="text-xl font-semibold">All questions answered</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Finalize to compute the verdict from the backend.
          </p>
          <Button
            onClick={props.onFinalize}
            disabled={props.finalizing}
            className="w-full h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {props.finalizing ? "Finalizing…" : "Finalize Autopsy"}
          </Button>
        </div>
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
          {q.dimension_code}
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
                <span className="text-sm leading-relaxed">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <Button
          onClick={props.onNext}
          disabled={props.pendingSelection == null || props.saving}
          className="w-full h-11 mt-6 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
        >
          {props.saving ? "Saving…" : (
            <span className="inline-flex items-center gap-1.5">
              Next <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </Button>
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
        {scoreNumeric ? (
          <span className="text-muted-foreground">
            Score: <span className="font-medium text-foreground">{scoreSoFar}</span> / {scoreMax}
          </span>
        ) : null}
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

  const dimensionScores = parseDimensionScores(run.dimension_scores);
  const weakest = (run.weakest_dimension as string) ?? "";

  const completedAt = run.finalized_at ?? run.completed_at ?? run.updated_at ?? run.created_at;
  const completedLabel = completedAt
    ? new Date(completedAt as string).toLocaleString()
    : "—";

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-8">
        <div className="flex items-center justify-between mb-4">
          <Badge className="bg-[hsl(var(--autopsy-accent))] text-[hsl(var(--autopsy-accent-foreground))] hover:bg-[hsl(var(--autopsy-accent))]/90">
            STATUS: COMPLETED
          </Badge>
          <span className="text-xs text-muted-foreground">{completedLabel}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {(run.verdict_name as string) ?? "—"}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {run.score_total != null && (
            <div className="text-sm">
              <span className="font-medium text-lg">{String(run.score_total)}</span>
              <span className="text-muted-foreground"> / 30</span>
            </div>
          )}
          {run.primary_risk && (
            <Badge variant="outline" className="border-[hsl(var(--autopsy-accent))] text-[hsl(var(--autopsy-accent))]">
              Primary constraint: {String(run.primary_risk)}
            </Badge>
          )}
        </div>
      </div>

      {/* Run details */}
      <SurfaceCard title="Run details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <KV label="Run name" value={run.run_name} />
          <KV label="Tester email" value={run.tester_email} />
          <KV label="Industry" value={run.industry} />
          <KV label="Scenario" value={run.scenario} />
          <KV label="Operator profile" value={run.operator_class} />
        </div>
      </SurfaceCard>

      {/* Dimension Pressure Profile */}
      <SurfaceCard title="Dimension Pressure Profile">
        <p className="text-sm text-muted-foreground mb-4">
          Scores per dimension, sorted weakest to strongest. The weakest dimension
          drives the primary constraint.
        </p>
        {dimensionScores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dimension scores available.</p>
        ) : (
          <div className="space-y-2">
            {dimensionScores.map((d) => {
              const max = Math.max(...dimensionScores.map((x) => x.score || 0), 1);
              const pct = ((d.score ?? 0) / max) * 100;
              const isWeakest =
                weakest && (d.code === weakest || d.label === weakest);
              return (
                <div key={d.code}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={cn("font-medium", isWeakest && "text-[hsl(var(--autopsy-accent))]")}>
                      {d.label || d.code}
                      {isWeakest && " · primary constraint"}
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
          <CollapsibleContent className="text-sm text-muted-foreground pt-2">
            Each dimension reflects one structural pressure axis evaluated by the backend.
            Lower scores indicate higher constraint pressure on that axis.
          </CollapsibleContent>
        </Collapsible>
      </SurfaceCard>

      {/* Mechanical Failure Chain */}
      <SurfaceCard title="Mechanical Failure Chain">
        <div className="space-y-3">
          <ChainItem
            icon={<Activity className="h-4 w-4" />}
            label="Weakest Dimension"
            value={run.weakest_dimension}
          />
          <ChainItem
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Constraint Effect"
            value={run.pressure_summary ?? run.failure_shape}
          />
          <ChainItem
            icon={<Target className="h-4 w-4" />}
            label="Failure Path"
            value={run.collapse_pattern ?? run.progression_state}
          />
          <ChainItem
            icon={<Wrench className="h-4 w-4" />}
            label="Required Breakpoint"
            value={run.permission_bias ?? run.required_breakpoint}
          />
        </div>
      </SurfaceCard>

      <SurfaceCard title="What this verdict means">
        <Prose value={run.narrative_output} />
      </SurfaceCard>
      <SurfaceCard title="Execution diagnosis">
        <Prose value={run.execution_diagnosis} />
      </SurfaceCard>
      <SurfaceCard title="Mechanism — Step 1">
        <Prose value={run.mechanism_step_1} />
      </SurfaceCard>
      <SurfaceCard title="Mechanism — Step 2">
        <Prose value={run.mechanism_step_2} />
      </SurfaceCard>
      <SurfaceCard title="Mechanism — Step 3">
        <Prose value={run.mechanism_step_3} />
      </SurfaceCard>
      <SurfaceCard title="Final outcome">
        <Prose value={run.final_outcome} />
      </SurfaceCard>
      <SurfaceCard title="Worksheet">
        <Prose value={run.worksheet_output} />
      </SurfaceCard>
      <SurfaceCard title="Retest condition">
        <Prose value={run.retest_condition} />
      </SurfaceCard>

      <div className="flex flex-wrap gap-2 pt-2">
        {runId && (
          <Button asChild className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]">
            <Link to={`/autopsy/run/${runId}/worksheet`}>Open Worksheet</Link>
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>Start New Analysis</Button>
        <Button asChild variant="outline">
          <Link to="/autopsy/history">View History</Link>
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

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

function Prose({ value }: { value: any }) {
  if (value == null || value === "") {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
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

function parseDimensionScores(raw: any): DimensionScoreRow[] {
  if (!raw) return [];
  const rows: DimensionScoreRow[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r == null) continue;
      if (typeof r === "object") {
        const code = String(r.code ?? r.dimension_code ?? r.dimension ?? r.label ?? "");
        const label = r.label ?? r.name ?? code;
        const score = Number(r.score ?? r.value ?? 0);
        if (code) rows.push({ code, label, score });
      }
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const score = typeof v === "number" ? v : Number((v as any)?.score ?? v);
      rows.push({ code: k, label: k, score: Number.isFinite(score) ? score : 0 });
    }
  }
  rows.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return rows;
}