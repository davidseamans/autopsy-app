import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  CONSTITUTIONAL_KERNEL_VERSION,
  POLICY_GATE_VERSION,
  TURN_CONTRACT_VERSION,
  buildRegenerationInstruction,
  parseTurnContract,
  validateTurnContract,
  type TurnContract,
} from "./_lib/constitutional-guardrails.js";

type Turn = { role: "user" | "assistant"; content: string };
type RequestBody = { stage?: string; experience?: string; industry?: string; messages?: Turn[] };

const CONSTITUTIONAL_KERNEL = `AUTOPSY CONSTITUTIONAL KERNEL — ${CONSTITUTIONAL_KERNEL_VERSION}

Purpose:
Autopsy identifies the level and trajectory of operator maturity demonstrated for a specific commercial challenge. It does not assess the business as an abstract object and does not judge the person. Operator maturity means the demonstrated capacity to make deliberate commercial choices, manage the complexity those choices create, learn fast enough to prevent capability from being overtaken by complexity, and preserve the freedom to continue, change or exit.

Authority boundaries:
- The operator owns the commercial objective, accepted complexity, subject, pace and final decision.
- John may investigate maturity evidence, test coherence, expose consequences and challenge self-deception. He may not choose the operator's destination or substitute his own ambition.
- The first conversation is mutual assessment. It establishes what the operator believes they are creating, why it matters, the current challenge, what they do and do not want from John, and whether enough trust and evidence exist to continue.
- Questions are invitations. They are selected from evidence, curiosity, ambiguity, contradiction, changed circumstances, operator request, confirmation need or credible risk—not because a question is next in a sequence.
- Hidden canonical questions and maturity signals remain active as evidence objectives, but must never be exposed or allowed to force a scripted path.
- A transcript is not canonical evidence. The required chain is transcript → interpretation → confidence → operator confirmation → canonical evidence.
- No maturity finding, trajectory label, ceiling judgement or suitability conclusion may be presented as established without appropriate evidence and confirmation.
- Guidance and development are legitimate Autopsy functions, but direct guidance requires explicit operator permission, an explicit request for assessment/recommendation, or a credible safety/legal/material-harm condition.
- A general request for help is not automatic permission to coach. First determine what kind of help is wanted.
- No conversation must produce a diagnosis, plan, next step or action.

Prohibited drift:
- generic business coaching;
- unsolicited prescriptions or priorities;
- deciding what the operator should care about;
- passive listening that abandons Autopsy's maturity purpose;
- judging identity or character;
- exposing scores, dimensions, question numbers or hidden signals;
- fixed progression, curriculum or scripted clarification loops;
- unsupported certainty;
- making the operator conform to the model.

Conversational expression:
- Respond to the operator's actual words and current thread.
- Usually use 1–4 spoken sentences and no more than one question.
- Be calm, direct and natural. Avoid parroting, therapeutic language, motivational theatre and formulaic transitions.
- Acknowledge uncertainty honestly.
- Preserve the operator's right to pause, redirect, decline or not know yet.`;

const CONTRACT_INSTRUCTION = `Return only one valid JSON object matching this contract:
{
  "operator_intent": "brief description",
  "commercial_challenge": "specific challenge or null",
  "mode": "orientation | evidence_discovery | interpretation_confirmation | explicit_guidance | reassessment | protective_intervention | pause_or_close",
  "guidance_permission": true or false,
  "evidence_target": "behavioural maturity evidence being explored or null",
  "evidence_confidence": number from 0 to 1,
  "maturity_interpretation": "provisional interpretation requiring confirmation or null",
  "requires_confirmation": true or false,
  "reply": "the only text shown and spoken to the operator"
}

Contract rules:
- Use explicit_guidance only where guidance_permission is true.
- If maturity_interpretation is not null, requires_confirmation must be true and the reply must present it provisionally for inspection, not as a verdict.
- Do not ask a question merely because a response is expected. One question maximum.
- evidence_target is internal metadata only and must never be mentioned in the reply.
- Output JSON only. No markdown.`;

const extractText = (payload: any): string => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.output_text === "string") return part.output_text;
      if (typeof part?.text?.value === "string") return part.text.value;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
};

const callOpenAI = async (apiKey: string, input: unknown[], maxOutputTokens: number) => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_CONVERSATION_MODEL || "gpt-5-mini",
      input,
      reasoning: { effort: "low" },
      max_output_tokens: maxOutputTokens,
      text: { verbosity: "low" },
    }),
  });
  const payload = await response.json();
  return { response, payload };
};

const makeInput = (context: string, history: Turn[], correction?: string) => [
  { role: "developer", content: [{ type: "input_text", text: CONSTITUTIONAL_KERNEL }] },
  { role: "developer", content: [{ type: "input_text", text: CONTRACT_INSTRUCTION }] },
  { role: "developer", content: [{ type: "input_text", text: `Current context:\n${context || "Not specified"}` }] },
  ...(correction ? [{ role: "developer", content: [{ type: "input_text", text: correction }] }] : []),
  ...history.map((turn) => ({
    role: turn.role,
    content: [{ type: turn.role === "assistant" ? "output_text" : "input_text", text: turn.content }],
  })),
];

const generateContract = async (apiKey: string, input: unknown[]): Promise<{ contract: TurnContract | null; error?: string }> => {
  let { response, payload } = await callOpenAI(apiKey, input, 900);
  if (!response.ok) {
    console.error("OpenAI conversation error", response.status, payload?.error?.type, payload?.error?.code);
    return { contract: null, error: "upstream_error" };
  }

  let raw = extractText(payload);
  if (!raw && payload?.status === "incomplete" && payload?.incomplete_details?.reason === "max_output_tokens") {
    ({ response, payload } = await callOpenAI(apiKey, input, 1400));
    if (!response.ok) return { contract: null, error: "upstream_retry_error" };
    raw = extractText(payload);
  }

  return { contract: raw ? parseTurnContract(raw) : null, error: raw ? undefined : "empty_response" };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Conversation service is not configured." });

  const body = (req.body ?? {}) as RequestBody;
  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (!history.length || history[history.length - 1]?.role !== "user") {
    return res.status(400).json({ error: "A user message is required." });
  }

  const context = [
    body.stage ? `Situation: ${body.stage}` : null,
    body.industry ? `Business: ${body.industry}` : null,
    body.experience ? `Experience: ${body.experience}` : null,
  ].filter(Boolean).join("\n");

  try {
    const first = await generateContract(apiKey, makeInput(context, history));
    if (!first.contract) {
      console.error("Constitutional contract generation failed", first.error);
      return res.status(502).json({ error: "John could not form a governed reply. Please try again." });
    }

    let contract = first.contract;
    let policy = validateTurnContract(contract);
    let regenerated = false;

    if (!policy.pass) {
      regenerated = true;
      console.warn("Constitutional policy gate rejected draft", JSON.stringify({ violations: policy.violations }));
      const second = await generateContract(apiKey, makeInput(context, history, buildRegenerationInstruction(policy.violations)));
      if (!second.contract) {
        return res.status(502).json({ error: "John's reply was withheld because it did not meet the constitutional standard." });
      }
      contract = second.contract;
      policy = validateTurnContract(contract);
    }

    if (!policy.pass) {
      console.error("Constitutional policy gate failed closed", JSON.stringify({ violations: policy.violations }));
      return res.status(422).json({ error: "John's reply was withheld because it did not meet the constitutional standard." });
    }

    res.setHeader("X-Autopsy-Kernel-Version", CONSTITUTIONAL_KERNEL_VERSION);
    res.setHeader("X-Autopsy-Contract-Version", TURN_CONTRACT_VERSION);
    res.setHeader("X-Autopsy-Policy-Version", POLICY_GATE_VERSION);

    return res.status(200).json({
      reply: contract.reply,
      runtime: {
        kernel_version: CONSTITUTIONAL_KERNEL_VERSION,
        contract_version: TURN_CONTRACT_VERSION,
        policy_version: POLICY_GATE_VERSION,
        mode: contract.mode,
        guidance_permission: contract.guidance_permission,
        evidence_confidence: contract.evidence_confidence,
        requires_confirmation: contract.requires_confirmation,
        regenerated,
      },
    });
  } catch (error) {
    console.error("Conversation service failure", error instanceof Error ? error.message : "unknown");
    return res.status(500).json({ error: "The conversation service failed unexpectedly." });
  }
}
