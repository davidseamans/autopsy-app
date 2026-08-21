import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "./_lib/supabase-server.js";
import { applyConstitutionalScoreFloor } from "./_lib/autopsy-scoring-policy.js";
import {
  AUTOPSY_ASSESSMENT_CONTRACT_VERSION,
  AUTOPSY_ASSESSMENT_POLICY_GATE_VERSION,
  AUTOPSY_ASSESSMENT_PROMPT_VERSION,
  privacySafeFactFlags,
} from "./_lib/autopsy-assessment-policy.js";

type Question = {
  question_id: string | number;
  subject_code: string;
  prompt: string;
  subject_boundary: string;
  options: Array<{ id: string | number; label: string; score_value?: number }>;
};
type Memory = {
  subject_code: string;
  question: string;
  answer: string;
  interpreted_summary?: string;
};
type BaselineSelection = {
  question_id: string | number;
  selected_option_id: string | number;
  confidence?: number;
};

const extractText = (payload: any): string =>
  typeof payload?.output_text === "string"
    ? payload.output_text.trim()
    : (payload?.output ?? [])
        .flatMap((item: any) => item.content ?? [])
        .map((part: any) => part.text ?? part.output_text ?? "")
        .join("")
        .trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    if (!(await authenticateRequest(req))) {
      return res.status(401).json({ error: "A valid session is required." });
    }
  } catch {
    return res.status(503).json({ error: "Assessment authentication is not configured." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Assessment reconciliation is not configured." });

  const questions = (Array.isArray(req.body?.questions) ? req.body.questions : [])
    .slice(0, 12) as Question[];
  const memory = (Array.isArray(req.body?.assessment_memory)
    ? req.body.assessment_memory
    : []).slice(0, 12) as Memory[];
  const baselineSelections = (Array.isArray(req.body?.baseline_selections)
    ? req.body.baseline_selections
    : []).slice(0, 12) as BaselineSelection[];
  if (
    questions.length !== 12 ||
    memory.length !== 12 ||
    questions.some((q) => !q.question_id || !q.subject_code || q.options?.length < 2)
  ) {
    return res.status(400).json({ error: "All twelve governed subjects are required." });
  }

  const governed = questions.map((q) => ({
    question_id: String(q.question_id),
    subject_code: q.subject_code,
    prompt: q.prompt,
    subject_boundary: q.subject_boundary,
    options: q.options.map((o) => ({
      id: String(o.id),
      label: o.label,
      score_value: Number(o.score_value),
    })),
  }));
  const disclosed = memory.map((m) => ({
    subject_code: m.subject_code,
    question: m.question,
    answer: m.answer,
  }));
  const fullText = disclosed.map((m) => m.answer).join("\n");

  const normaliseSelections = (rawSelections: any[], source: "whole_run" | "baseline_fallback") => {
    const byQuestion = new Map(governed.map((q) => [q.question_id, q]));
    const seen = new Set<string>();
    const selections = rawSelections.map((selection: any) => {
      const questionId = String(selection.question_id);
      const question = byQuestion.get(questionId);
      if (!question || seen.has(questionId)) throw new Error("subject mismatch");
      seen.add(questionId);
      const allowed = question.options.map((o) => o.id);
      let selected = String(selection.selected_option_id);
      if (!allowed.includes(selected)) throw new Error("option mismatch");
      selected = applyConstitutionalScoreFloor(
        question.subject_code,
        fullText,
        selected,
        question.options,
      );
      if (!allowed.includes(selected)) throw new Error("reconciled option mismatch");
      return {
        question_id: questionId,
        selected_option_id: selected,
        confidence: Math.max(0, Math.min(1, Number(selection.confidence) || 0)),
        fact_flags: privacySafeFactFlags(fullText),
      };
    });
    if (selections.length !== 12 || seen.size !== 12) throw new Error("incomplete");
    return {
      selections,
      runtime: {
        prompt_version: AUTOPSY_ASSESSMENT_PROMPT_VERSION,
        contract_version: AUTOPSY_ASSESSMENT_CONTRACT_VERSION,
        policy_gate_version: AUTOPSY_ASSESSMENT_POLICY_GATE_VERSION,
        reconciliation_source: source,
      },
    };
  };

  const baselineFallback = (reason: string) => {
    try {
      const result = normaliseSelections(baselineSelections, "baseline_fallback");
      console.warn("Assessment reconciliation used governed baseline fallback", { reason });
      return res.status(200).json(result);
    } catch (error) {
      console.error("Assessment reconciliation baseline fallback failed", {
        reason,
        error: error instanceof Error ? error.message : "unknown",
        baseline_count: baselineSelections.length,
      });
      return res.status(502).json({ error: "Hudson could not complete a reliable final cross-check." });
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_CONVERSATION_MODEL || "gpt-5-mini",
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      text: {
        format: {
          type: "json_schema",
          name: "autopsy_whole_run_reconciliation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              selections: {
                type: "array",
                minItems: 12,
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    question_id: { type: "string" },
                    selected_option_id: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["question_id", "selected_option_id", "confidence"],
                },
              },
            },
            required: ["selections"],
          },
        },
      },
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: `Reconcile one completed Autopsy assessment as a whole.
Map every governed subject to exactly one supplied option. A truthful explicit
fact disclosed anywhere in the assessment is available to every subject it
genuinely answers. Do not require repetition. Do not invent facts, coach,
change options or infer blanket strength from a title alone. Prior cleaning
work is practical experience. Prior ownership or management of a cleaning
business is relevant to operating costs and delivery. Past paying clients are
market acceptance. Booked work is customer action. A per-job costing ledger
is job-economics knowledge. A household budget and realistic buffer are
financial preparation. Partly complete SOPs are material middle-level
systemisation, not a complete tested method. Return JSON only.`,
          }],
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({ governed_subjects: governed, disclosed_answers: disclosed }),
          }],
        },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error("Assessment reconciliation failed", {
      status: response.status,
      code: payload?.error?.code,
      type: payload?.error?.type,
    });
    return baselineFallback(`upstream_${response.status}_${payload?.error?.code ?? "unknown"}`);
  }

  try {
    const parsed = JSON.parse(extractText(payload));
    return res.status(200).json(normaliseSelections(parsed.selections, "whole_run"));
  } catch (error) {
    return baselineFallback(
      `invalid_upstream_output_${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}
