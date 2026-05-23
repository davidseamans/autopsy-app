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
  deriveHardFailFromSelectedAnswers,
  extractRunId,
  finalizeAutopsyRun,
  getCurrentRunAnswerAudit,
  getGatewayPayload,
  readOptionHardFail,
  recordAutopsyAnswer,
  generateSupportingBlocks,
  SupportingBlocks,
  SupportingBlockItem,
} from "./rpc";
import type { SelectedAnswerAuditRow } from "./rpc";

type View = "start" | "question" | "verdict";

/* --------- Quick Gate v1 scoring config (12Q / 6 domains / 36 max) ---------- */
export const QUICK_GATE_CONFIG = {
  totalQuestions: 12,
  domainsCount: 6,
  domainMaxScore: 6,
  maxScore: 36,
  perfectScore: 36,
  // Verdict band thresholds (inclusive lower bound)
  bandThresholds: {
    criticalStopMax: 4,        // 0–4
    notViableMax: 11,          // 5–11
    highRiskMax: 21,           // 12–21
    viableMax: 29,             // 22–29
    structurallyViableMin: 30, // 30–36
  },
} as const;

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

function auditQuestionKey(row: Pick<SelectedAnswerAuditRow, "question_id" | "question_number">): string {
  return row.question_id != null
    ? `id:${String(row.question_id)}`
    : `n:${String(row.question_number ?? "")}`;
}

function sortAuditRows(a: SelectedAnswerAuditRow, b: SelectedAnswerAuditRow) {
  return (a.question_number ?? 0) - (b.question_number ?? 0);
}

function buildSelectedAnswersFromPayload(
  questions: GatewayQuestion[] | undefined,
): SelectedAnswerAuditRow[] {
  return (questions ?? [])
    .map((q: any, i): SelectedAnswerAuditRow | null => {
      const opts = (q.options ?? []) as any[];
      const selectedOptionFromList = opts.find((o) => o && typeof o === "object" && o.selected === true);
      const selectedId = q.selected_option ?? selectedOptionFromList?.id ?? selectedOptionFromList?.option_id ?? selectedOptionFromList?.value ?? null;
      if (selectedId == null) return null;
      const selectedOpt =
        selectedOptionFromList ??
        opts.find(
          (o) =>
            o != null &&
            typeof o === "object" &&
            (String(o.id) === String(selectedId) ||
              String(o.option_id) === String(selectedId) ||
              String(o.value) === String(selectedId)),
        ) ??
        null;
      const optionScore = selectedOpt && typeof selectedOpt === "object"
        ? selectedOpt.score_value ?? selectedOpt.score ?? selectedOpt.value
        : null;
      return {
        question_id: q.question_id ?? q.q_id ?? null,
        question_number: Number.isFinite(Number(q.position)) ? Number(q.position) : i + 1,
        dimension_code: q.dimension_code ?? null,
        selected_option_id: selectedId,
        selected_option_label:
          selectedOpt && typeof selectedOpt === "object"
            ? selectedOpt.label ?? null
            : null,
        score_value: Number.isFinite(Number(q.selected_score_value))
          ? Number(q.selected_score_value)
          : Number.isFinite(Number(optionScore))
            ? Number(optionScore)
            : null,
        option_hard_fail: readOptionHardFail(selectedOpt),
        hard_fail: readOptionHardFail(selectedOpt),
      };
    })
    .filter((row): row is SelectedAnswerAuditRow => row != null)
    .sort(sortAuditRows);
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
  const [answerScores, setAnswerScores] = useState<Record<string, number>>({});
  const [savedScoreOverride, setSavedScoreOverride] = useState<number | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | number | null>(null);
  const [loadingStuck, setLoadingStuck] = useState(false);
  const [manualIndex, setManualIndex] = useState<number | null>(null);

  const [industry, setIndustry] = useState(
    () => localStorage.getItem("autopsy_intake_industry") || "Cleaning",
  );
  const [scenario, setScenario] = useState(
    () => {
      const v = localStorage.getItem("autopsy_intake_scenario") || "startup";
      return v === "acquisition" ? "startup" : v;
    },
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

  const payloadQuery = useQuery({
    queryKey: ["autopsy", "payload", runId],
    queryFn: () => getGatewayPayload(runId as string),
    enabled: !!runId,
  });

  // Authoritative answer hydration from the backend. On every payload refresh
  // (including resume), pull saved answers so localAnswers + answeredIds reflect
  // exactly what is persisted server-side. Prevents "Q10 at score 0/36" on
  // resume and keeps the running score authoritative.
  const answerHydrationQuery = useQuery({
    queryKey: ["autopsy", "answer_audit_hydration", runId],
    queryFn: () => getCurrentRunAnswerAudit(runId as string),
    enabled: !!runId,
    retry: false,
  });
  useEffect(() => {
    const rows = answerHydrationQuery.data;
    if (!rows) return;
    const nextAnswers: Record<string, string | number> = {};
    const nextScores: Record<string, number> = {};
    const nextAnswered = new Set<string>();
    for (const r of rows) {
      if (r.question_id == null) continue;
      const qid = String(r.question_id);
      if (r.selected_option_id != null) nextAnswers[qid] = r.selected_option_id as any;
      const n = Number(r.score_value);
      if (Number.isFinite(n)) nextScores[qid] = n;
      nextAnswered.add(qid);
    }
    setLocalAnswers(nextAnswers);
    setAnswerScores(nextScores);
    setAnsweredIds(nextAnswered);
  }, [answerHydrationQuery.data]);

  // Resume prompt: if the user lands on the start screen and an incomplete
  // run is recorded in localStorage, offer to resume or discard before
  // a new run can be created. Do not auto-clear without confirmation.
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    if (resumeChecked) return;
    if (view !== "start" || runId) return;
    let candidate: string | null = null;
    try {
      candidate =
        localStorage.getItem("autopsy_active_run_id") ||
        localStorage.getItem("autopsy_current_run_id");
    } catch { /* noop */ }
    if (!candidate) {
      setResumeChecked(true);
      return;
    }
    const resume = window.confirm(
      "You have an autopsy run in progress. Click OK to resume the current run, or Cancel to discard it and start a new one.",
    );
    if (resume) {
      setRunId(candidate);
      setView("question");
    } else {
      try {
        localStorage.removeItem("autopsy_active_run_id");
        localStorage.removeItem("autopsy_current_run_id");
      } catch { /* noop */ }
    }
    setResumeChecked(true);
  }, [view, runId, resumeChecked]);

  // Persist active runId so standalone /worksheet route can recover it.
  // Completed runs are NOT considered active and must be cleared.
  useEffect(() => {
    if (!runId) return;
    const status = (payloadQuery.data as any)?.run?.status;
    const hasVerdict = !!(payloadQuery.data as any)?.run?.verdict_name;
    if (status === "completed" || hasVerdict) {
      try {
        const current = localStorage.getItem("autopsy_active_run_id");
        if (current === runId) localStorage.removeItem("autopsy_active_run_id");
        localStorage.removeItem("autopsy_current_run_id");
      } catch { /* noop */ }
      return;
    }
    localStorage.setItem("autopsy_active_run_id", runId);
  }, [runId, payloadQuery.data]);

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
      setAnsweredIds(new Set());
      setLocalAnswers({});
      setAnswerScores({});
      setSavedScoreOverride(null);
      setPendingSelection(null);
      setManualIndex(null);
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
      setAnsweredIds((prev) => {
        const next = new Set(prev);
        next.add(justAnsweredId);
        return next;
      });
      setLocalAnswers((prev) => ({
        ...prev,
        [String(vars.question_id)]: vars.selected_option,
      }));
      setPendingSelection(vars.selected_option);
      await qc.invalidateQueries({ queryKey: ["autopsy", "answer_audit_hydration", runId] });
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
      const fresh = await qc.fetchQuery({
        queryKey: ["autopsy", "payload", runId],
        queryFn: () => getGatewayPayload(runId as string),
      });
      const status = (fresh as any)?.run?.status;
      const hasVerdict = !!(fresh as any)?.run?.verdict_name;
      if (runId && (status === "completed" || hasVerdict)) {
        try {
          localStorage.removeItem("autopsy_active_run_id");
          localStorage.removeItem("autopsy_current_run_id");
        } catch { /* noop */ }
      }
      if (status === "completed" || hasVerdict) {
        setLoadingStuck(false);
        setView("verdict");
      } else {
        setView("verdict");
      }
    },
    onError: async (e: any) => {
      const msg = String(e?.message ?? e ?? "");
      const immutable = /immutable|already\s+completed|completed\s+autopsy/i.test(msg);
      if (immutable && runId) {
        try {
          const fresh = await qc.fetchQuery({
            queryKey: ["autopsy", "payload", runId],
            queryFn: () => getGatewayPayload(runId),
          });
          const status = (fresh as any)?.run?.status;
          const hasVerdict = !!(fresh as any)?.run?.verdict_name;
          if (status === "completed" || hasVerdict) {
            try {
              localStorage.removeItem("autopsy_active_run_id");
              localStorage.removeItem("autopsy_current_run_id");
            } catch { /* noop */ }
            setError(null);
            setLoadingStuck(false);
            setView("verdict");
            return;
          }
        } catch {
          /* fall through to controlled error */
        }
        setError({
          rpc: "finalize_autopsy_run",
          message:
            "This run could not be finalised. Start a new analysis or contact support.",
          step: "question",
          runId,
        });
        return;
      }
      setError({
        rpc: "finalize_autopsy_run",
        message: e?.message ?? String(e),
        step: "question",
        runId,
      });
    },
  });

  const questions = useMemo(() => sortedQuestions(payloadQuery.data), [payloadQuery.data]);
  const isAnswered = (q: GatewayQuestion) =>
    answeredIds.has(String(q.question_id)) || localAnswers[String(q.question_id)] != null || !!q.answered || q.selected_option != null;

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
      const rawOpts = (q.options ?? []) as any[];
      const scoreOpts = rawOpts
        .map((o) =>
          o && typeof o === "object"
            ? Number(o.score_value ?? o.score ?? o.value)
            : Number(o),
        )
        .filter((n) => Number.isFinite(n));
      if (scoreOpts.length) {
        anyNumeric = true;
        max += Math.max(...scoreOpts);
      }
      const qid = String(q.question_id);
      const sel = localAnswers[qid] ?? q.selected_option ?? null;
      if (sel != null) {
        const hydratedScore = answerScores[qid];
        if (Number.isFinite(hydratedScore)) {
          sum += hydratedScore;
          continue;
        }
        const selOpt = rawOpts.find(
          (o) =>
            o &&
            typeof o === "object" &&
            (String(o.id) === String(sel) ||
              String(o.option_id) === String(sel) ||
              String(o.value) === String(sel)),
        );
        const selectedFlagOpt = rawOpts.find(
          (o) => o && typeof o === "object" && o.selected === true,
        );
        const scoreSource =
          (selOpt as any)?.score_value ??
          (selOpt as any)?.score ??
          (typeof q.selected_score_value === "number" ? q.selected_score_value : undefined) ??
          (selectedFlagOpt as any)?.score_value ??
          (selectedFlagOpt as any)?.score;
        const n = Number(scoreSource);
        if (Number.isFinite(n)) sum += n;
      }
    }
    const integrity = (payloadQuery.data as any)?.integrity ?? {};
    const liveScore = Number(integrity.score_total_live);
    const runStatus = (payloadQuery.data?.run as any)?.status;
    const backendScore = Number((payloadQuery.data?.run as any)?.score_total);
    // Prefer live derived sum during in-progress runs; only fall back to backend
    // aggregate scores once the run is completed (so verdict matches final score).
    const isCompleted = runStatus === "completed";
    const finalScore = savedScoreOverride != null
      ? savedScoreOverride
      : isCompleted
      ? (Number.isFinite(backendScore)
          ? backendScore
          : Number.isFinite(liveScore)
            ? liveScore
            : sum)
      : sum;
    return { scoreSoFar: finalScore, scoreMax: max, scoreNumeric: anyNumeric };
  }, [questions, localAnswers, answerScores, payloadQuery.data, savedScoreOverride]);

  // Preselect previously saved answer when the current question changes.
  useEffect(() => {
    if (view !== "question" || !currentQuestion) return;
    const qid = String(currentQuestion.question_id);
    const prior = localAnswers[qid] ?? currentQuestion.selected_option ?? null;
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

  async function handleSelect(value: string | number) {
    if (!runId || !currentQuestion) return;
    const qid = String(currentQuestion.question_id);
    setPendingSelection(value);
    setLocalAnswers((prev) => ({ ...prev, [qid]: value }));
    setAnsweredIds((prev) => {
      const next = new Set(prev);
      next.add(qid);
      return next;
    });
    const selectedOpt = ((currentQuestion.options ?? []) as any[]).find(
      (o) =>
        o &&
        typeof o === "object" &&
        (String(o.id) === String(value) ||
          String(o.option_id) === String(value) ||
          String(o.value) === String(value)),
    );
    const selectedScore = Number(selectedOpt?.score_value ?? selectedOpt?.score);
    if (Number.isFinite(selectedScore)) {
      setAnswerScores((prev) => ({ ...prev, [qid]: selectedScore }));
      setSavedScoreOverride(null);
    }
    try {
      await answerMutation.mutateAsync({
        run_id: runId,
        question_id: currentQuestion.question_id,
        selected_option: value,
      });
    } catch {
      return;
    }
  }

  async function handleNext() {
    if (!runId || !currentQuestion || pendingSelection == null) return;
    const isFinal = currentIndex >= questions.length - 1;
    const qid = String(currentQuestion.question_id);
    const alreadySaved =
      localAnswers[qid] != null && String(localAnswers[qid]) === String(pendingSelection);
    if (!alreadySaved) {
      try {
        await answerMutation.mutateAsync({
          run_id: runId,
          question_id: currentQuestion.question_id,
          selected_option: pendingSelection,
        });
      } catch {
        return; // onError captured it
      }
    }
    if (isFinal) {
      await finalizeAndLoad();
    } else if (manualIndex != null) {
      setManualIndex(manualIndex + 1 >= questions.length ? null : manualIndex + 1);
    }
  }

  async function finalizeAndLoad() {
    if (!runId) return;
    setError(null);
    // Authoritative pre-finalize guard: re-fetch saved answers and require
    // exactly QUICK_GATE_CONFIG.totalQuestions. Never finalize from stale
    // local state.
    try {
      const savedRows = await qc.fetchQuery({
        queryKey: ["autopsy", "answer_audit_hydration", runId],
        queryFn: () => getCurrentRunAnswerAudit(runId as string),
      });
      const savedCount = (savedRows ?? []).length;
      if (savedCount < QUICK_GATE_CONFIG.totalQuestions) {
        setError({
          rpc: "finalize_autopsy_run",
          message: `Cannot finalize: only ${savedCount} of ${QUICK_GATE_CONFIG.totalQuestions} answers saved.`,
          step: "question",
          runId,
        });
        return;
      }
    } catch {
      /* fall through to existing logic */
    }
    // Never re-finalise a completed run. Check the latest payload first.
    try {
      const fresh = await qc.fetchQuery({
        queryKey: ["autopsy", "payload", runId],
        queryFn: () => getGatewayPayload(runId),
      });
      const status = (fresh as any)?.run?.status;
      const hasVerdict = !!(fresh as any)?.run?.verdict_name;
      if (status === "completed" || hasVerdict) {
        try {
          localStorage.removeItem("autopsy_active_run_id");
          localStorage.removeItem("autopsy_current_run_id");
        } catch { /* noop */ }
        setLoadingStuck(false);
        setView("verdict");
        return;
      }
    } catch {
      /* fall through to finalize attempt */
    }
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
    try {
      localStorage.removeItem("autopsy_active_run_id");
      localStorage.removeItem("autopsy_current_run_id");
    } catch { /* noop */ }
    // Drop ALL cached autopsy query data so a new run cannot read prior
    // run's payload, supporting blocks, hard-fail flags, or answers.
    try {
      qc.removeQueries({ queryKey: ["autopsy"] });
    } catch { /* noop */ }
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
            onSelect={handleSelect}
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
    !props.runName.trim() ||
    !props.testerEmail.trim() ||
    props.loading;

  const scenarioSupported =
    props.industry === "Cleaning" && props.scenario === "startup";

  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm">
      <div className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-[hsl(var(--autopsy-accent-soft))] flex items-center justify-center mb-4">
            <Skull className="h-7 w-7 text-[hsl(var(--autopsy-accent))]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Start Business Readiness Autopsy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test whether this can become a business system — not just work wearing a business name.
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

          {!scenarioSupported && (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
              This scenario is not active in the current build.
            </p>
          )}

          <div className="rounded-lg bg-[hsl(var(--autopsy-accent-soft))]/40 border border-[hsl(var(--autopsy-accent-soft))] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Autopsy is not asking whether you can do the work. It tests whether the
            work can be sold, priced, delivered, recorded, repeated, measured, and
            eventually operated without total dependence on you.
          </div>

          <Button
            type="submit"
            disabled={disabled}
            className="w-full h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {props.loading ? "Creating run…" : "Begin Readiness Autopsy"}
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
  const hasOptions = options.length > 0;
  if (!hasOptions) {
    // eslint-disable-next-line no-console
    console.error("Autopsy: answer options missing for question", {
      question_id: q.question_id,
      q_id: (q as any).q_id,
      dimension_code: q.dimension_code,
    });
  }

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
          {hasOptions ? options.map((opt) => {
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
          }) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Configuration error: answer options missing for this question.
              {(q as any).q_id ? <span className="ml-1 opacity-70">({String((q as any).q_id)})</span> : null}
            </div>
          )}
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
            disabled={!hasOptions || props.pendingSelection == null || props.saving}
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
          Score: <span className="font-medium text-foreground">{scoreSoFar}</span> / {QUICK_GATE_CONFIG.maxScore}
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
  const answerAuditQuery = useQuery({
    queryKey: ["autopsy", "answer_audit", runId],
    queryFn: () => getCurrentRunAnswerAudit(runId as string),
    enabled: !!runId,
    retry: false,
  });

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
  const isNotViableVerdict = /not[\s_-]?viable/i.test(verdictName);
  const isViable =
    (!isNotViableVerdict && /viable/i.test(verdictName)) ||
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

  const selectedAnswerAudit = useMemo(() => {
    const dbRows = answerAuditQuery.data ?? [];
    const payloadRows = buildSelectedAnswersFromPayload(payload?.questions);
    if (dbRows.length > 0) {
      const byQuestion = new Map<string, SelectedAnswerAuditRow>();
      for (const row of payloadRows) byQuestion.set(auditQuestionKey(row), row);
      for (const row of dbRows) byQuestion.set(auditQuestionKey(row), row);
      const selectedAnswers = [...byQuestion.values()].sort(sortAuditRows);
      const selectedHardFails = selectedAnswers.filter((r) => deriveHardFailFromSelectedAnswers([r]));
      return {
        selectedAnswers,
        selectedHardFails,
        hasSelectedHardFail: deriveHardFailFromSelectedAnswers(selectedAnswers),
        firstSelectedHardFail: selectedHardFails[0] ?? null,
        source: payloadRows.length > dbRows.length
          ? "autopsy_answers+gateway_payload"
          : "autopsy_answers",
        expectedAnswerCount: (payload?.questions ?? []).length || 10,
        auditLoaded: true,
      };
    }
    if (answerAuditQuery.isLoading) {
      return {
        selectedAnswers: [],
        selectedHardFails: [],
        hasSelectedHardFail: false,
        firstSelectedHardFail: null,
        source: "answer_audit_pending" as const,
        expectedAnswerCount: (payload?.questions ?? []).length || 10,
        auditLoaded: false,
      };
    }
    const selectedAnswers = payloadRows;
    const selectedHardFails = selectedAnswers.filter((r) => deriveHardFailFromSelectedAnswers([r]));
    return {
      selectedAnswers,
      selectedHardFails,
      hasSelectedHardFail: deriveHardFailFromSelectedAnswers(selectedAnswers),
      firstSelectedHardFail: selectedHardFails[0] ?? null,
      source: "gateway_payload" as const,
      expectedAnswerCount: (payload?.questions ?? []).length || 10,
      auditLoaded: !answerAuditQuery.isLoading,
    };
  }, [answerAuditQuery.data, answerAuditQuery.isLoading, payload?.questions]);
  const hasSelectedHardFail = selectedAnswerAudit.hasSelectedHardFail;
  const firstSelectedHardFail = selectedAnswerAudit.firstSelectedHardFail;

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

  // Progression locking is not the same as a hard-fail. Hard-fail display is
  // sourced ONLY from the selected answer option for this run.
  const opStateKey = String(run.operational_state ?? "").trim().toLowerCase();
  const scoreNumeric = run.score_total != null
    ? Number(run.score_total)
    : (payload as any)?.integrity?.score_total_live != null
      ? Number((payload as any).integrity.score_total_live)
      : null;
  const isHardFail = hasSelectedHardFail;
  const isScoreBandCriticalStop =
    !isHardFail &&
    Number.isFinite(scoreNumeric) &&
    (scoreNumeric as number) >= 0 &&
    (scoreNumeric as number) <= QUICK_GATE_CONFIG.bandThresholds.criticalStopMax;
  // A hard-fail always routes to Critical Stop regardless of score band.
  const isHardFailCriticalStop = isHardFail;
  const isCriticalStop = isScoreBandCriticalStop || isHardFailCriticalStop;
  const isScoreBandNotViable =
    !isHardFail &&
    !isCriticalStop &&
    Number.isFinite(scoreNumeric) &&
    (scoreNumeric as number) > QUICK_GATE_CONFIG.bandThresholds.criticalStopMax &&
    (scoreNumeric as number) <= QUICK_GATE_CONFIG.bandThresholds.notViableMax;
  const isProgressionLocked =
    opStateKey === "blocked" ||
    isNotViableVerdict ||
    isCriticalStop ||
    isScoreBandNotViable ||
    String(run.permission_level ?? "").toLowerCase() === "locked";
  const isProgressionBlocked = isProgressionLocked;
  const isBlocked = isHardFail;
  const effectiveOpState = isHardFail
    ? "blocked"
    : isProgressionLocked
      ? "locked"
      : opStateKey;

  // Perfect score: 36/36 with every domain at max (6) and no hard-fail.
  const isPerfectScore =
    !isHardFail &&
    Number(scoreNumeric) === QUICK_GATE_CONFIG.perfectScore &&
    hasDimensionData &&
    dimensionScores.every((d) => Number(d.score) >= QUICK_GATE_CONFIG.domainMaxScore);

  // Tied-min watchpoint detection for 30–35 (Structurally Viable but not perfect).
  // When multiple domains tie for the minimum score, do not arbitrarily label
  // any single domain as Primary Watchpoint. When all six tie, surface a
  // balanced-profile notice instead.
  const minDomainScore = hasDimensionData
    ? Math.min(...dimensionScores.map((d) => Number(d.score)))
    : null;
  const tiedMinCount = hasDimensionData
    ? dimensionScores.filter((d) => Number(d.score) === minDomainScore).length
    : 0;
  const isStructurallyViableNonPerfect =
    !isPerfectScore &&
    !isHardFail &&
    Number.isFinite(scoreNumeric) &&
    (scoreNumeric as number) >= QUICK_GATE_CONFIG.bandThresholds.structurallyViableMin &&
    (scoreNumeric as number) < QUICK_GATE_CONFIG.perfectScore;
  const allDomainsTied =
    hasDimensionData && tiedMinCount === dimensionScores.length;
  const hasTiedWatchpoint =
    isStructurallyViableNonPerfect && hasDimensionData && tiedMinCount > 1;
  const tiedWatchpointNotice = allDomainsTied
    ? "Balanced profile — monitor all domains under load."
    : hasTiedWatchpoint
      ? "No dominant watchpoint — lowest domains are tied."
      : null;
  const suppressPrimaryWatchpoint = isPerfectScore || hasTiedWatchpoint || allDomainsTied;

  const band: VerdictBand = getVerdictBand({
    verdictName,
    isBlocked,
    score: scoreNumeric,
    isCriticalStop,
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

  // QA: per-run answer + hard-fail audit. Logs ONLY the current run's
  // payload. Hard-fail must be derived from a selected option with
  // hard_fail = true on this run — never from score, band, or prior runs.
  useEffect(() => {
    if (!runId || !run || !(run as any).verdict_name) return;
    try {
      const { selectedAnswers, selectedHardFails, hasSelectedHardFail, firstSelectedHardFail } =
        selectedAnswerAudit;
      // eslint-disable-next-line no-console
      console.info("[autopsy:verdict-audit]", {
        run_id: runId,
        total_score: (run as any).score_total ?? null,
        final_verdict: (run as any).verdict_name ?? null,
        hardFailFromSelectedAnswers: hasSelectedHardFail,
        hard_fail_from_selected_answers: hasSelectedHardFail,
        hard_fail_triggered_payload:
          (run as any).hard_fail_triggered_payload ?? (run as any).hard_fail_triggered ?? null,
        hard_fail_triggered_raw_payload:
          (run as any).hard_fail_triggered_raw_payload ?? null,
        payload_matches_selected_answers:
          ((run as any).hard_fail_triggered_payload ?? (run as any).hard_fail_triggered ?? null) === hasSelectedHardFail,
        mismatch_warning:
          ((run as any).hard_fail_triggered_payload ?? (run as any).hard_fail_triggered ?? null) !== hasSelectedHardFail
            ? "ERROR: payload hard-fail does not match selected answers."
            : null,
        primary_risk: (run as any).primary_risk ?? null,
        hard_fail_question_id: firstSelectedHardFail?.question_id ?? null,
        hard_fail_selected_option_id:
          firstSelectedHardFail?.selected_option_id ?? null,
        hard_fail_dimension: firstSelectedHardFail?.dimension_code ?? null,
        backend_hard_fail_question_id: (run as any).hard_fail_question_id ?? null,
        backend_hard_fail_selected_option_id:
          (run as any).hard_fail_selected_option_id ?? null,
        audit_source: selectedAnswerAudit.source,
        selected_answer_count: selectedAnswers.length,
        expected_answer_count: selectedAnswerAudit.expectedAnswerCount,
        selected_hard_fail_questions: selectedHardFails.map((r) => ({
          question_id: r.question_id,
          question_number: r.question_number,
        })),
        selected_answers: selectedAnswers,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[autopsy:verdict-audit] failed", err);
    }
  }, [runId, run, selectedAnswerAudit]);

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
            {isHardFailCriticalStop
              ? "Status: Completed · Critical Stop (Hard-Fail Triggered)"
                : isScoreBandCriticalStop
                  ? "Status: Completed · Critical Stop (Score-Band)"
                  : isScoreBandNotViable
                  ? "Status: Completed · Score-Band Failure"
                  : isProgressionBlocked
                    ? "Status: Completed · Progression Locked"
                : "Status: Completed"}
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
            {(() => {
              const vn = (run.verdict_name as string) ?? "";
              if (isCriticalStop) return "Critical Stop";
              if (vn.trim() && !isCriticalStop) return vn;
              if (isHardFail || isScoreBandNotViable || isProgressionLocked) return "Not Viable";
              return "Verdict";
            })()}
          </h1>
          {isHardFailCriticalStop && (
            <div className="max-w-xl space-y-1">
              <div className="text-sm font-semibold text-red-800">
                Hard-fail condition triggered
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This score would normally fall into a different band, but a
                non-negotiable blocker has stopped progression.
              </p>
            </div>
          )}
          {run.score_total != null && (
            <div className="text-base">
              <span className="text-muted-foreground">Score: </span>
              <span className="font-semibold text-foreground text-lg">
                {String(run.score_total)}
              </span>
              <span className="text-muted-foreground"> / {QUICK_GATE_CONFIG.maxScore}</span>
            </div>
          )}
          {primaryConstraint && !suppressFailureLanguage && !hasCascade && !suppressPrimaryWatchpoint && (
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
          {isPerfectScore && (
            <Badge
              variant="outline"
              className={cn("uppercase tracking-wider text-[10px] px-3 py-1", framing.badgeClass)}
            >
              No Active Blocker Identified
            </Badge>
          )}
          {!isPerfectScore && tiedWatchpointNotice && (
            <Badge
              variant="outline"
              className={cn("uppercase tracking-wider text-[10px] px-3 py-1", framing.badgeClass)}
            >
              {tiedWatchpointNotice}
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
        isProgressionLocked={isProgressionBlocked}
        isScoreBandNotViable={isScoreBandNotViable}
        isCriticalStop={isCriticalStop}
        isHardFailCriticalStop={isHardFailCriticalStop}
        isScoreBandCriticalStop={isScoreBandCriticalStop}
        isPerfectScore={isPerfectScore}
        isStructurallyViable={isStructurallyViableNonPerfect}
        operatingInstruction={sanitizeVerdictCopy(cascadeSeverity?.operating_instruction, isHardFail)}
        requiredActionFallback={sanitizeVerdictCopy(supportingBlocks?.required_actions?.[0]?.body, isHardFail)}
      />
      <ProgressionFlow
        current={isProgressionLocked && !isHardFail ? "locked" : run.operational_state}
        isBlocked={isBlocked}
      />

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
          isPerfectScore={isPerfectScore || hasTiedWatchpoint || allDomainsTied}
          primaryLabel={framing.rankPrimary}
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
      <PressureCollapsePanel
        run={run}
        isBlocked={isBlocked}
        isScoreBandNotViable={isScoreBandNotViable}
        isCriticalStop={isCriticalStop}
        isHardFailCriticalStop={isHardFailCriticalStop}
        isScoreBandCriticalStop={isScoreBandCriticalStop}
        isPerfectScore={isPerfectScore}
      />

      {isHardFail && !isScoreBandNotViable && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 shadow-sm p-6">
          <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-2">
            Blocking Failure Triggered
          </div>
          <p className="text-sm leading-relaxed">
            A hard-fail condition was triggered by a selected answer during this assessment.
            Progression is blocked. The business is not viable in its current
            form. The hard-fail condition must be corrected and retested before
            progression can be reconsidered.
          </p>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <div className="uppercase tracking-wider text-muted-foreground">Source Question</div>
              <div className="font-mono font-semibold">
                {firstSelectedHardFail?.question_number ?? firstSelectedHardFail?.question_id ?? "—"}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-muted-foreground">Selected Option</div>
              <div className="font-mono font-semibold break-words">
                {firstSelectedHardFail?.selected_option_label ?? firstSelectedHardFail?.selected_option_id ?? "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Pressure Topology — interacting business pressures */}
      {hasCascade && !isPerfectScore && (
        <PressureTopology
          primary={cascadePrimary}
          secondary={cascadeSecondary}
          tertiary={cascadeTertiary}
          isBlocked={isBlocked}
          failureDrivers={sanitizeVerdictCopy(supportingBlocks?.failure_drivers, isHardFail)}
          framing={framing}
        />
      )}

      {/* 7. Mechanical Failure Chain — causal diagram */}
      {isPerfectScore ? (
        <SurfaceCard title="Execution Watchpoints">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>No active watchpoint identified.</p>
            <p className="text-muted-foreground">
              Continue with telemetry and review cadence.
            </p>
          </div>
        </SurfaceCard>
      ) : suppressFailureLanguage ? (
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
          isScoreBandNotViable={isScoreBandNotViable}
        operatingInstruction={sanitizeVerdictCopy(cascadeSeverity?.operating_instruction, isHardFail)}
        requiredActionFallback={sanitizeVerdictCopy(supportingBlocks?.required_actions?.[0]?.body, isHardFail)}
        evidenceFallback={sanitizeVerdictCopy(supportingBlocks?.evidence_required?.[0]?.body, isHardFail)}
          framing={framing}
          primaryFallback={dimensionScores[0]?.label ?? dimensionScores[0]?.code ?? null}
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
                      ? sanitizeVerdictCopy(cascadeSeverity.operating_instruction, isHardFail)
                      : (supportingBlocks?.required_actions?.[0]?.body
                          ? sanitizeVerdictCopy(supportingBlocks.required_actions[0].body, isHardFail)
                          : cleanProceedOnlyIf(translatePermissionState(cascadeSeverity.permission_state), null))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="border-l-4 border-[hsl(var(--autopsy-accent))] pl-5">
            <Prose value={sanitizeVerdictCopy(verdictBody, isHardFail)} />
          </div>
        </SurfaceCard>
      )}

      {/* 8. Recovery & Retest Gate */}
      <RecoveryRetestPanel
        run={run}
        isBlocked={isBlocked}
        isScoreBandNotViable={isScoreBandNotViable}
        isCriticalStop={isCriticalStop}
        isPerfectScore={isPerfectScore}
        isStructurallyViable={isStructurallyViableNonPerfect || isPerfectScore}
        evidenceOverride={sanitizeVerdictCopy(supportingBlocks?.evidence_required?.[0]?.body, isHardFail)}
        actionOverride={sanitizeVerdictCopy(supportingBlocks?.required_actions?.[0]?.body, isHardFail)}
      />

      {/* 10. Legacy mechanism sections — only when narrative_output is absent */}
      {!hasNarrativeOutput && !hasCascade && (
        <>
          {hasContent(run.execution_diagnosis) && (
            <SurfaceCard title="Execution diagnosis">
              <Prose value={sanitizeVerdictCopy(run.execution_diagnosis, isHardFail)} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_1) && (
            <SurfaceCard title="Mechanism — Step 1">
              <Prose value={sanitizeVerdictCopy(run.mechanism_step_1, isHardFail)} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_2) && (
            <SurfaceCard title="Mechanism — Step 2">
              <Prose value={sanitizeVerdictCopy(run.mechanism_step_2, isHardFail)} />
            </SurfaceCard>
          )}
          {hasContent(run.mechanism_step_3) && (
            <SurfaceCard title="Mechanism — Step 3">
              <Prose value={sanitizeVerdictCopy(run.mechanism_step_3, isHardFail)} />
            </SurfaceCard>
          )}
          {hasContent(run.final_outcome) && (
            <SurfaceCard title="Final outcome">
              <Prose value={sanitizeVerdictCopy(run.final_outcome, isHardFail)} />
            </SurfaceCard>
          )}
        </>
      )}
      {/* 11. Worksheet link */}
      {/* 11. Progression Routing */}
      {runId && (() => {
        let routingBand = deriveBand(verdictName);
        if (isCriticalStop) {
          routingBand = "critical_stop";
        } else if (routingBand === "unknown" && (isHardFail || isScoreBandNotViable || isProgressionLocked)) {
          routingBand = "not_viable";
        }
        const copy = ROUTING_COPY[routingBand] ?? ROUTING_COPY.unknown;
        return (
          <SurfaceCard title="Progression Routing">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border px-2 py-0.5 uppercase tracking-wide text-muted-foreground">
                  Stage Permission: {progression?.stagePermission ?? "Locked"}
                </span>
                <span className="rounded-full border px-2 py-0.5 uppercase tracking-wide text-muted-foreground">
                  Worksheet: {progression?.worksheetStatus ?? "Not Started"}
                </span>
              </div>
              <div className="font-medium">{copy.title}</div>
              <p className="text-sm text-muted-foreground">{copy.body}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]">
                  <Link to={copy.primaryCta.to(runId)}>{copy.primaryCta.label}</Link>
                </Button>
                {copy.secondaryCta && (
                  <Button variant="outline" asChild>
                    <Link to={copy.secondaryCta.to(runId)}>{copy.secondaryCta.label}</Link>
                  </Button>
                )}
                {!isCriticalStop && (
                  <Button variant="ghost" asChild>
                    <Link to={`/autopsy/run/${runId}/worksheet`}>Open Diagnostic Worksheet</Link>
                  </Button>
                )}
                {isCriticalStop && (
                  <Button variant="ghost" asChild>
                    <Link to={`/autopsy/run/${runId}`}>View Diagnostic Summary</Link>
                  </Button>
                )}
                <Button variant="ghost" onClick={onReset}>Start New Analysis</Button>
              </div>
            </div>
          </SurfaceCard>
        );
      })()}
      {((typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("debug") === "1") ||
        (typeof window !== "undefined" &&
          window.localStorage?.getItem("autopsy_debug") === "1")) && (
        <VerdictHardFailDebug
          runId={runId}
          run={run}
          totalScore={scoreNumeric}
          finalVerdict={verdictName}
          audit={selectedAnswerAudit}
        />
      )}
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
  locked: {
    label: "LOCKED",
    container: "border-amber-500/60 bg-amber-500/5",
    dot: "bg-amber-500",
    text: "text-amber-700",
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
  isProgressionLocked,
  isScoreBandNotViable,
  isCriticalStop,
  isHardFailCriticalStop,
  isScoreBandCriticalStop,
  isPerfectScore,
  isStructurallyViable,
  operatingInstruction,
  requiredActionFallback,
}: {
  run: any;
  isBlocked?: boolean;
  isProgressionLocked?: boolean;
  isScoreBandNotViable?: boolean;
  isCriticalStop?: boolean;
  isHardFailCriticalStop?: boolean;
  isScoreBandCriticalStop?: boolean;
  isPerfectScore?: boolean;
  isStructurallyViable?: boolean;
  operatingInstruction?: string | null;
  requiredActionFallback?: string | null;
}) {
  const opKey = String(run.operational_state ?? "").trim().toLowerCase();
  const effective = isBlocked ? "blocked" : isProgressionLocked ? "locked" : opKey;
  const style = operationalStyle(effective);
  // Hard-fail display relabelling (does not mutate backend values)
  const progressionDisplay = isPerfectScore
    ? "Scalable"
    : isStructurallyViable
      ? "Controlled progression"
    : isHardFailCriticalStop
    ? "Blocked by hard-fail condition"
    : isScoreBandCriticalStop
      ? "Blocked by Critical Stop score band"
    : isBlocked
      ? "PROGRESSION BLOCKED"
    : isProgressionLocked
      ? "PROGRESSION LOCKED"
    : humanize(run.progression_state) || "—";
  const rawPermissionBias = isPerfectScore
    ? "Open Stage 1 Dashboard"
    : isStructurallyViable
      ? "Proceed with execution watchpoints"
    : isBlocked
    ? "STRONG RESTRICTION"
    : isCriticalStop
      ? "Education / Advice / Complete Rethink Before Retest"
    : isProgressionLocked
      ? "Repair Worksheet Required"
    : humanize(run.permission_bias) || "—";
  const permissionBiasDisplay = (isPerfectScore || isStructurallyViable)
    ? rawPermissionBias
    : cleanProceedOnlyIf(
        sanitizeVerdictCopy(rawPermissionBias, !!isBlocked),
        operatingInstruction || requiredActionFallback,
      );
  const recoveryDisplay = isPerfectScore
    ? "No recovery signal required. Maintain telemetry and review cadence."
    : isStructurallyViable
      ? "Evidence maintained under operating load."
    : isHardFailCriticalStop
      ? "Hard-fail condition must be corrected and retested before progression can reopen."
    : isCriticalStop
    ? "Outside Safe Progression Pathway"
    : isScoreBandNotViable
    ? "Repair Worksheet Required"
    : sanitizeVerdictCopy(resolveRecoverySignal(run), !!isBlocked);
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

function PressureCollapsePanel({
  run,
  isBlocked,
  isScoreBandNotViable,
  isCriticalStop,
  isHardFailCriticalStop,
  isScoreBandCriticalStop,
  isPerfectScore,
}: {
  run: any;
  isBlocked?: boolean;
  isScoreBandNotViable?: boolean;
  isCriticalStop?: boolean;
  isHardFailCriticalStop?: boolean;
  isScoreBandCriticalStop?: boolean;
  isPerfectScore?: boolean;
}) {
  const rawPressureStage = humanize(run.pressure_stage);
  const stageDisplay = isPerfectScore
    ? "EXECUTION WATCHPOINT"
    : isHardFailCriticalStop
    ? "HARD-FAIL TRIGGERED"
    : isScoreBandCriticalStop
      ? "CRITICAL STOP"
    : isBlocked
      ? "BLOCKING FAILURE"
    : isCriticalStop
      ? "CRITICAL STOP"
    : isScoreBandNotViable
      ? "SCORE-BAND FAILURE"
      : /blocking\s*failure|hard\s*fail/i.test(rawPressureStage)
        ? "PROGRESSION LOCKED"
        : sanitizeVerdictCopy(rawPressureStage, false);
  const rawFailureType = humanize(run.failure_type);
  const failureTypeDisplay = isPerfectScore
    ? "Execution watchpoint"
    : isHardFailCriticalStop
    ? "Hard-fail override"
    : isScoreBandCriticalStop
    ? "Score-band Critical Stop"
    : isCriticalStop
    ? "Critical Stop"
    : isBlocked && !hasContent(run.failure_type)
      ? "HARD FAIL"
      : isScoreBandNotViable || (!isBlocked && /hard\s*fail|existential/i.test(rawFailureType))
        ? "Score-band Not Viable"
        : sanitizeVerdictCopy(rawFailureType, false);
  const suppressPressureSummary = hasContent(run.narrative_output);
  const items: Array<{ label: string; value: any; prose?: boolean }> = [
    { label: "Risk State", value: stageDisplay },
    { label: "Failure Type", value: failureTypeDisplay },
    ...(suppressPressureSummary
      ? []
      : [{ label: "Pressure Summary", value: sanitizeVerdictCopy(run.pressure_summary, !!isBlocked), prose: true }]),
    {
      label: isPerfectScore ? "Watchpoint Pattern" : "Collapse Pattern",
      value: isPerfectScore
        ? "No collapse pattern assigned. Track watchpoints under operating load."
        : sanitizeVerdictCopy(run.collapse_pattern, !!isBlocked),
      prose: true,
    },
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
  isScoreBandNotViable,
  isCriticalStop,
  isPerfectScore,
  isStructurallyViable,
  evidenceOverride,
  actionOverride,
}: {
  run: any;
  isBlocked?: boolean;
  isScoreBandNotViable?: boolean;
  isCriticalStop?: boolean;
  isPerfectScore?: boolean;
  isStructurallyViable?: boolean;
  evidenceOverride?: string | null;
  actionOverride?: string | null;
}) {
  const resolved = resolveRecoverySignal(run);
  const recovery =
    isPerfectScore
      ? "No recovery signal required. Maintain telemetry and review cadence."
    : isStructurallyViable
      ? "Evidence maintained under operating load."
    : isCriticalStop
      ? "Outside Safe Progression Pathway"
      : isScoreBandNotViable
      ? "Repair Worksheet Required"
      : hasContent(evidenceOverride)
      ? evidenceOverride
      : resolved === "Recovery signal not returned"
        ? null
        : sanitizeVerdictCopy(resolved, !!isBlocked);
  const retest = isPerfectScore
    ? "No recovery action required. Retest only after meaningful operating change, scaling pressure, or structural drift."
    : isCriticalStop
    ? "Autopsy is not opening Stage 1 from this result. Education, advice, or a complete rethink is required before retesting."
    : isScoreBandNotViable
    ? "Progression is locked until the Repair Worksheet is completed and the required proof is recorded."
    : hasContent(actionOverride)
    ? actionOverride
    : hasContent(evidenceOverride)
      ? null
      : sanitizeVerdictCopy(run.retest_condition, !!isBlocked);
  const worksheet = isPerfectScore
    ? "No repair worksheet required. Enter Stage 1 with telemetry and review cadence active."
    : run.worksheet_output;
  const worksheetIsString = typeof worksheet === "string";
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
      <p className="text-xs text-muted-foreground/80 mb-4">
        Defines the proof required before retesting or progression can reopen.
      </p>
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
        {hasContent(worksheet) && !isCriticalStop && (
          <div className="rounded-lg border-l-4 border-l-amber-500 border border-[hsl(var(--autopsy-border))] p-4 bg-background">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Worksheet Output
            </div>
            {worksheetIsString ? (
              <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {worksheet as string}
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {renderBlock(worksheet)}
              </pre>
            )}
          </div>
        )}
        {hasContent(worksheet) && isCriticalStop && (
          <div className="rounded-lg border-l-4 border-l-amber-500 border border-[hsl(var(--autopsy-border))] p-4 bg-background">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Diagnostic Guidance
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

function sanitizeVerdictCopy(value: any, isHardFail: boolean): any {
  if (isHardFail || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeVerdictCopy(item, false));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      const cleanKey = sanitizeVerdictCopy(humanize(key), false);
      out[typeof cleanKey === "string" ? cleanKey : key] = sanitizeVerdictCopy(child, false);
    }
    return out;
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/Completed\s*[—-]\s*Blocking Failure/gi, "Completed — Score-Band Failure")
    .replace(/Failure Type:\s*Hard Fail/gi, "Failure Type: Score-Band Failure")
    .replace(
      /A hard[-\s]?fail condition was triggered(?:\s+by\s+a\s+selected\s+answer\s+during\s+this\s+assessment)?\.?/gi,
      "The assessment score is below the minimum viability threshold.",
    )
    .replace(/until the hard[-\s]?fail condition is corrected(?: and retested)?/gi, "until the Repair Worksheet is completed")
    .replace(/selected hard[-\s]?fail answer/gi, "selected answer")
    .replace(/hard[-\s]?fail condition/gi, "score-band condition")
    .replace(/existential hard[-\s]?fail/gi, "score-band failure")
    .replace(/hard[-\s]?fail recovery signal/gi, "repair worksheet requirement")
    .replace(/hard[-\s]?fail triggered/gi, "score-band failure recorded")
    .replace(/Blocking failure triggered/gi, "Score-band failure")
    .replace(/hard[_-]fail/gi, "score-band failure")
    .replace(/hard[-\s]?fail/gi, "score-band failure")
    .replace(/blocking failure/gi, "score-band failure")
    .replace(/progression is blocked/gi, "Progression is locked")
    .replace(
      /Progression is blocked until the score-band condition is corrected and retested\.?/gi,
      "Progression is locked until the Repair Worksheet is completed and the required proof is recorded.",
    )
    // Normalize Verdict Judgement metadata casing
    .replace(/(^|\n)\s*severity\s*:\s*score[-\s]?band\s+failure\b/gi, "$1Severity: Score-band failure")
    .replace(/(^|\n)\s*operational state\s*:\s*blocked\b/gi, "$1Operational State: Blocked")
    .replace(/(^|\n)\s*progression\s*:\s*progression\s+blocked\b/gi, "$1Progression: Progression blocked")
    .replace(/(^|\n)\s*required recovery signal\s*:\s*([a-z])/g, (_m, p1, c) => `${p1}Required Recovery Signal: ${c.toUpperCase()}`);
}

function VerdictHardFailDebug({
  runId,
  run,
  totalScore,
  finalVerdict,
  audit,
}: {
  runId: string | null;
  run: any;
  totalScore: number | null;
  finalVerdict: string;
  audit: any;
}) {
  const firstHardFail = audit?.firstSelectedHardFail ?? null;
  const selectedAnswers = audit?.selectedAnswers ?? [];
  const hardFailFromSelectedAnswers = deriveHardFailFromSelectedAnswers(selectedAnswers);
  const hardFailTriggeredPayload = run?.hard_fail_triggered_payload ?? run?.hard_fail_triggered ?? null;
  const mismatchWarning = hardFailTriggeredPayload !== hardFailFromSelectedAnswers
    ? "ERROR: payload hard-fail does not match selected answers."
    : null;
  const debugPayload = {
    run_id: runId,
    total_score: totalScore,
    final_verdict: finalVerdict || null,
    audit_source: audit?.source ?? null,
    audit_loaded: audit?.auditLoaded === true,
    selected_answer_count: selectedAnswers.length,
    expected_answer_count: audit?.expectedAnswerCount ?? 10,
    hardFailFromSelectedAnswers,
    hard_fail_triggered_payload: hardFailTriggeredPayload,
    mismatch_warning: mismatchWarning,
    hard_fail_source_question_number: firstHardFail?.question_number ?? null,
    hard_fail_source_question_id: firstHardFail?.question_id ?? null,
    hard_fail_source_option_id: firstHardFail?.selected_option_id ?? null,
    selected_answers: selectedAnswers.map((r: any) => ({
      question_number: r.question_number ?? null,
      score_value: r.score_value ?? null,
      option_hard_fail: (r.option_hard_fail ?? r.hard_fail) === true,
      hard_fail: deriveHardFailFromSelectedAnswers([r]),
    })),
  };
  return (
    <div className="rounded-lg border border-[hsl(var(--autopsy-border))] bg-muted/30 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Developer verdict audit
      </div>
      <pre className="text-[11px] overflow-auto max-h-72 whitespace-pre-wrap break-words">
        {JSON.stringify(debugPayload, null, 2)}
      </pre>
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

export type VerdictBand = "critical_stop" | "not_viable" | "high_risk" | "viable" | "structurally_viable";

export function getVerdictBand(opts: {
  verdictName: string;
  isBlocked: boolean;
  score: number | null | undefined;
  isCriticalStop?: boolean;
}): VerdictBand {
  const { verdictName, isBlocked, score, isCriticalStop } = opts;
  if (isCriticalStop && !isBlocked) return "critical_stop";
  if (isBlocked || /not[\s_-]?viable/i.test(verdictName)) return "not_viable";
  if (/structurally[\s_-]?viable/i.test(verdictName)) return "structurally_viable";
  if (/high[\s_-]?risk/i.test(verdictName)) return "high_risk";
  if (/viable/i.test(verdictName)) return "viable";
  const s = typeof score === "number" ? score : Number(score);
  if (Number.isFinite(s)) {
    if (s >= QUICK_GATE_CONFIG.bandThresholds.structurallyViableMin) return "structurally_viable";
    if (s > QUICK_GATE_CONFIG.bandThresholds.highRiskMax) return "viable";
    if (s > QUICK_GATE_CONFIG.bandThresholds.notViableMax) return "high_risk";
    if (s > QUICK_GATE_CONFIG.bandThresholds.criticalStopMax) return "not_viable";
    return "critical_stop";
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
  critical_stop: {
    rankPrimary: "Critical Stop",
    rankSecondary: "Next Pressure",
    rankTertiary: "Third Pressure",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Pressures present at the time of assessment. A Critical Stop indicates the foundation is missing across multiple dimensions.",
    chainTitle: "Failure Chain",
    pathLabel: "Failure Path",
    proofLabel: "Required Before Retest",
    outcomeLabel: "Outside Safe Progression Pathway",
    decisionStatusOverride: "Stop. Outside safe progression pathway.",
    allowedNextOverride:
      "Education, advice, or a complete rethink before retesting. Autopsy is not opening Stage 1 from this result.",
    headerTextClass: "text-red-800",
    headerContainerClass: "border-red-700/60 bg-red-500/5",
    badgeClass: "border-red-700 text-red-800 bg-red-500/10",
    failureOriented: true,
  },
  not_viable: {
    rankPrimary: "Main Blocker",
    rankSecondary: "Next Pressure",
    rankTertiary: "Third Pressure",
    topologyTitle: "Pressure Topology",
    topologyIntro:
      "Interacting business pressures, ranked by structural weight. The Main Blocker drives failure; the others compound it.",
    chainTitle: "Pressure Topology",
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
    chainTitle: "Pressure Topology",
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
    topologyTitle: "Stability Risks",
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
    topologyTitle: "Execution Watchpoints",
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
  isPerfectScore,
  primaryLabel,
}: {
  rows: DimensionScoreRow[];
  hasData: boolean;
  weakest: string;
  suppress: boolean;
  opState: string;
  isPerfectScore?: boolean;
  primaryLabel?: string;
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
          !isPerfectScore &&
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
                    {primaryLabel ?? "Main Blocker"}
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
  { key: "locked", label: "Locked" },
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
      <p className="text-xs text-muted-foreground/80 mb-4">
        Ranked pressures showing the main blocker, next pressure, and compounding third pressure.
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
  isScoreBandNotViable,
  operatingInstruction,
  requiredActionFallback,
  evidenceFallback,
  framing,
  primaryFallback,
}: {
  run: any;
  isBlocked?: boolean;
  isScoreBandNotViable?: boolean;
  operatingInstruction?: string | null;
  requiredActionFallback?: string | null;
  evidenceFallback?: string | null;
  framing?: BandFraming;
  primaryFallback?: string | null;
}) {
  const style = operationalStyle(isBlocked ? "blocked" : String(run.operational_state ?? "").toLowerCase());
  const primary =
    humanize(run.weakest_dimension ?? run.primary_risk) ||
    humanize(primaryFallback) ||
    "Unidentified";
  const rawFailurePath =
    (typeof run.collapse_pattern === "string" && run.collapse_pattern.trim()) ||
    humanize(run.failure_shape) ||
    (isBlocked || !/hard\s*fail|existential/i.test(humanize(run.failure_type))
      ? humanize(run.failure_type)
      : "") ||
    "Failure path not specified";
  const failurePath = sanitizeVerdictCopy(rawFailurePath, !!isBlocked) as string;
  const rawBreakpoint = isScoreBandNotViable
    ? "Repair Worksheet Required before Stage 1 can be reconsidered."
    : (typeof run.retest_condition === "string" && run.retest_condition.trim()) ||
      (typeof run.required_recovery_signal === "string" && run.required_recovery_signal.trim()) ||
      "";
  const breakpoint =
    cleanProceedOnlyIf(rawBreakpoint, evidenceFallback || operatingInstruction) ||
    "Required proof not specified";
  const rawOutcome = isBlocked
    ? "Progression is blocked. Not viable in current form until the hard-fail condition is corrected and retested."
    : isScoreBandNotViable
      ? "Progression locked. Repair Worksheet Required before Stage 1 can be reconsidered."
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
      <p className="text-xs text-muted-foreground/80 mb-4">
        Shows the causal path from primary blocker to blocked progression.
      </p>
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