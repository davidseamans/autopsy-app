import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

function normalizeOption(opt: any, idx: number) {
  if (typeof opt === "string") {
    return { value: opt, label: opt, key: `${idx}-${opt}` };
  }
  const value = opt.value ?? opt.option_id ?? opt.id ?? opt.label ?? idx;
  const label = opt.label ?? opt.text ?? String(value);
  return { value, label, key: `${idx}-${value}`, selected: !!opt.selected };
}

function sortedQuestions(payload: GatewayPayload | undefined): GatewayQuestion[] {
  const qs = payload?.questions ?? [];
  return [...qs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function Autopsy() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("start");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<RpcError | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());

  // start form
  const [industry, setIndustry] = useState("");
  const [scenario, setScenario] = useState("");
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
    onSuccess: async (_data, vars) => {
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
      industry: industry.trim(),
      scenario: scenario.trim(),
      run_name: runName.trim(),
      tester_email: testerEmail.trim(),
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
    setIndustry("");
    setScenario("");
    setRunName("");
    setTesterEmail("");
  }

  const debug = isDebug();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-3xl py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Autopsy</h1>
          <p className="text-sm text-muted-foreground">
            Thin runtime · backend is the source of truth
          </p>
        </header>

        {error && <ErrorPanel error={error} />}

        {view === "start" && (
          <StartView
            industry={industry}
            scenario={scenario}
            runName={runName}
            testerEmail={testerEmail}
            setIndustry={setIndustry}
            setScenario={setScenario}
            setRunName={setRunName}
            setTesterEmail={setTesterEmail}
            onSubmit={handleStart}
            loading={startMutation.isPending}
          />
        )}

        {view === "question" && (
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
{JSON.stringify(
  { view, runId, payload: payloadQuery.data },
  null,
  2,
)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
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
  runName: string;
  testerEmail: string;
  setIndustry: (v: string) => void;
  setScenario: (v: string) => void;
  setRunName: (v: string) => void;
  setTesterEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  const disabled =
    !props.industry.trim() ||
    !props.scenario.trim() ||
    !props.runName.trim() ||
    !props.testerEmail.trim() ||
    props.loading;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a run</CardTitle>
        <CardDescription>Provide context for this autopsy.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={props.onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" value={props.industry} onChange={(e) => props.setIndustry(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario">Scenario</Label>
            <Input id="scenario" value={props.scenario} onChange={(e) => props.setScenario(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="run_name">Run name</Label>
            <Input id="run_name" value={props.runName} onChange={(e) => props.setRunName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tester_email">Tester email</Label>
            <Input id="tester_email" type="email" value={props.testerEmail} onChange={(e) => props.setTesterEmail(e.target.value)} />
          </div>
          <Button type="submit" disabled={disabled} className="w-full">
            {props.loading ? "Creating…" : "Begin"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
            {opt.label}
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
  const dimensionScores = run.dimension_scores;
  const primaryRisks = run.primary_risks;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>Verdict</CardDescription>
          <CardTitle className="text-2xl">{run.verdict_name ?? "—"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {run.verdict_body && <p className="text-sm leading-relaxed">{String(run.verdict_body)}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Score total" value={run.score_total} />
            <Stat label="Adjusted score" value={run.adjusted_score} />
            <Stat label="Weakest dimension" value={run.weakest_dimension} />
            <Stat label="Weakest score" value={run.weakest_score} />
            <Stat label="Primary risk" value={run.primary_risk} />
            <Stat label="Final outcome" value={run.final_outcome} />
            <Stat label="Retest condition" value={run.retest_condition} />
          </div>
        </CardContent>
      </Card>

      {Array.isArray(primaryRisks) && primaryRisks.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Primary risks</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {primaryRisks.map((r: any, i: number) => (
                <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {dimensionScores && (
        <Card>
          <CardHeader><CardTitle className="text-base">Dimension scores</CardTitle></CardHeader>
          <CardContent>
            <DimensionScores data={dimensionScores} />
          </CardContent>
        </Card>
      )}

      {run.narrative_output && (
        <Card>
          <CardHeader><CardTitle className="text-base">Narrative</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {typeof run.narrative_output === "string"
                ? run.narrative_output
                : JSON.stringify(run.narrative_output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {run.worksheet_output && (
        <Card>
          <CardHeader><CardTitle className="text-base">Worksheet</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {typeof run.worksheet_output === "string"
                ? run.worksheet_output
                : JSON.stringify(run.worksheet_output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={onReset}>Start another run</Button>
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

function DimensionScores({ data }: { data: any }) {
  let entries: Array<[string, any]> = [];
  if (Array.isArray(data)) {
    entries = data.map((d: any, i) => [
      String(d.dimension_code ?? d.code ?? i),
      d.score ?? d.value ?? d,
    ]);
  } else if (data && typeof data === "object") {
    entries = Object.entries(data);
  }
  if (entries.length === 0) {
    return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between rounded border px-3 py-2">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}