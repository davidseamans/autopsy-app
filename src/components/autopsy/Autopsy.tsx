import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isDebug } from "@/lib/supabase";
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

const SCENARIOS = ["startup", "existing_business", "acquisition", "franchise"];

const OPERATOR_CLASSES = [
  "unproven",
  "developing",
  "experienced",
  "operator",
  "advanced_operator",
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

  const [industry, setIndustry] = useState("Cleaning");
  const [scenario, setScenario] = useState("startup");
  const [operatorClass, setOperatorClass] = useState("developing");
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
  const currentIndex = useMemo(() => {
    const idx = questions.findIndex(
      (q) =>
        !q.answered &&
        q.selected_option == null &&
        !answeredIds.has(String(q.question_id)),
    );
    return idx === -1 ? questions.length - 1 : idx;
  }, [questions, answeredIds]);
  const currentQuestion = questions[currentIndex];
  const allAnswered =
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.answered ||
        q.selected_option != null ||
        answeredIds.has(String(q.question_id)),
    );

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

  function handleSelectOption(value: string | number) {
    if (!runId || !currentQuestion) return;
    answerMutation.mutate({
      run_id: runId,
      question_id: currentQuestion.question_id,
      selected_option: value,
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
    setRunName("");
    setTesterEmail("");
    navigate("/autopsy");
  }

  const debug = isDebug();
  const run = payloadQuery.data?.run ?? {};

  return (
    <div className="container max-w-4xl py-10 space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Autopsy</h1>
          <p className="text-sm text-muted-foreground">
            Diagnostic intake · backend is the source of truth
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/autopsy/history")}>
          History
        </Button>
      </header>

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
        <>
          <RunHeader
            runName={(run.run_name as string) ?? runName}
            scenario={(run.scenario as string) ?? scenario}
            operatorClass={(run.operator_class as string) ?? operatorClass}
            currentDimension={currentQuestion?.dimension_code}
            position={currentIndex + 1}
            total={questions.length}
          />
          <QuestionView
            loading={payloadQuery.isLoading}
            fetching={payloadQuery.isFetching || answerMutation.isPending}
            currentQuestion={currentQuestion}
            currentIndex={currentIndex}
            total={questions.length}
            allAnswered={allAnswered}
            onSelect={handleSelectOption}
            onFinalize={handleFinalize}
            finalizing={finalizeMutation.isPending}
          />
        </>
      )}

      {view === "verdict" && (
        <VerdictView
          payload={payloadQuery.data}
          loading={payloadQuery.isLoading}
          onReset={handleReset}
        />
      )}

      {debug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debug</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">
{JSON.stringify({ view, runId, payload: payloadQuery.data }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
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
    <Card>
      <CardHeader>
        <CardTitle>New autopsy run</CardTitle>
        <CardDescription>
          Establish the operating context. These values frame the diagnostic and
          are recorded on the run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={props.onSubmit}>
          <Field label="Industry" hint="Sector of the operating business.">
            <Select value={props.industry} onValueChange={props.setIndustry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Scenario" hint="Lifecycle stage being diagnosed.">
            <Select value={props.scenario} onValueChange={props.setScenario}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Operator competency"
            hint="Self-classified operator class. Calibrates pressure interpretation."
          >
            <Select value={props.operatorClass} onValueChange={props.setOperatorClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATOR_CLASSES.map((o) => (
                  <SelectItem key={o} value={o}>{o.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Run name" hint="Internal label for this diagnostic.">
            <Input
              value={props.runName}
              onChange={(e) => props.setRunName(e.target.value)}
              placeholder="e.g. Q2 cleaning startup review"
            />
          </Field>

          <Field label="Tester email" hint="Operator or analyst running this autopsy.">
            <Input
              type="email"
              value={props.testerEmail}
              onChange={(e) => props.setTesterEmail(e.target.value)}
              placeholder="operator@example.com"
            />
          </Field>

          <div className="md:col-span-2">
            <Button type="submit" disabled={disabled} className="w-full">
              {props.loading ? "Creating run…" : "Begin diagnostic"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RunHeader(props: {
  runName: string;
  scenario: string;
  operatorClass: string;
  currentDimension?: string;
  position: number;
  total: number;
}) {
  return (
    <Card>
      <CardContent className="py-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <HeaderStat label="Progress" value={`${props.position} / ${props.total}`} />
        <HeaderStat label="Dimension" value={props.currentDimension ?? "—"} />
        <HeaderStat label="Run" value={props.runName || "—"} />
        <HeaderStat label="Scenario" value={props.scenario || "—"} />
        <HeaderStat label="Operator" value={props.operatorClass || "—"} />
      </CardContent>
    </Card>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

function QuestionView(props: {
  loading: boolean;
  fetching: boolean;
  currentQuestion: GatewayQuestion | undefined;
  currentIndex: number;
  total: number;
  allAnswered: boolean;
  onSelect: (v: string | number) => void;
  onFinalize: () => void;
  finalizing: boolean;
}) {
  if (props.loading) {
    return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  }
  if (props.total === 0) {
    return <p className="text-sm text-muted-foreground">No questions returned.</p>;
  }
  if (props.allAnswered) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All questions answered</CardTitle>
          <CardDescription>Finalize to compute the verdict.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={props.onFinalize} disabled={props.finalizing} className="w-full">
            {props.finalizing ? "Finalizing…" : "Finalize run"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  const q = props.currentQuestion;
  if (!q) return null;
  const options = (q.options ?? []).map(normalizeOption);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{q.dimension_code}</Badge>
          <span className="text-xs text-muted-foreground">
            {props.currentIndex + 1} / {props.total}
          </span>
        </div>
        <CardTitle className="text-lg leading-snug pt-2">{q.prompt}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {options.map((opt) => (
          <Button
            key={opt.key}
            variant={opt.selected ? "default" : "outline"}
            className="w-full justify-start text-left h-auto py-3 whitespace-normal"
            onClick={() => props.onSelect(opt.value as any)}
            disabled={props.fetching}
          >
            {props.fetching ? "Saving…" : opt.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function VerdictView({
  payload,
  loading,
  onReset,
}: {
  payload: GatewayPayload | undefined;
  loading: boolean;
  onReset: () => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading verdict…</p>;
  const run = payload?.run ?? {};

  const structuralSignals = [
    ["Failure shape", run.failure_shape],
    ["Pressure stage", run.pressure_stage],
    ["Progression state", run.progression_state],
    ["Collapse pattern", run.collapse_pattern],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>Verdict</CardDescription>
          <CardTitle className="text-2xl">{(run.verdict_name as string) ?? "—"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Score total" value={run.score_total} />
          <Stat label="Permission level" value={run.permission_level} />
          <Stat label="Weakest dimension" value={run.weakest_dimension} />
          <Stat label="Adjusted score" value={run.adjusted_score} />
        </CardContent>
      </Card>

      <Section title="Structural diagnosis">
        <Block label="Narrative" value={run.narrative_output} />
        <Block label="Execution diagnosis" value={run.execution_diagnosis} />
        <Block label="Final outcome" value={run.final_outcome} />
      </Section>

      <Section title="Mechanism">
        <Block label="Step 1" value={run.mechanism_step_1} />
        <Block label="Step 2" value={run.mechanism_step_2} />
        <Block label="Step 3" value={run.mechanism_step_3} />
      </Section>

      <Section title="Worksheet">
        <Block label="Worksheet" value={run.worksheet_output} />
      </Section>

      <Section title="Retest">
        <Block label="Retest condition" value={run.retest_condition} />
      </Section>

      {structuralSignals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Structural signals</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {structuralSignals.map(([k, v]) => (
              <Stat key={k as string} label={k as string} value={v} />
            ))}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={onReset}>Start another run</Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Block({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") {
    return (
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm text-muted-foreground">—</div>
      </div>
    );
  }
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{text}</pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  const display =
    value == null || value === ""
      ? "—"
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{display}</div>
    </div>
  );
}