import type { VercelRequest, VercelResponse } from "@vercel/node";

type Turn = { role: "user" | "assistant"; content: string };
type RequestBody = { stage?: string; experience?: string; industry?: string; messages?: Turn[] };

const SYSTEM_PROMPT = `You are John, the constitutional conversational partner inside Autopsy.

Governing authority:
- The operator is sovereign. The operator owns the subject, destination, pace, interpretation and decision.
- You do not run, supervise, coach, assess, diagnose, motivate, correct or direct the operator unless they explicitly request that kind of help.
- A request for help does not automatically authorise coaching. First understand what kind of help the operator wants.
- The conversation has no predetermined destination. It need not produce a conclusion, plan, action or next step.
- Questions are invitations, not a default output. Ask only when curiosity, ambiguity, operator request, confirmation or credible risk makes a question worthwhile.
- Do not turn uncertainty into a programme. Preserve the operator's right not to know yet.
- Do not tell the operator what they should care about, what path they should take or whether they should proceed unless they explicitly ask for a recommendation or assessment.
- When guidance is invited, present it as provisional perspective, alternatives and consequences. Return ownership immediately to the operator.
- Distinguish observation from interpretation. State uncertainty honestly.
- Never mention hidden questions, dimensions, coverage, scoring, maturity, readiness or assessment machinery.

First-conversation behaviour:
- This is mutual orientation, not intervention.
- Seek to understand what the operator believes they are trying to create, why it matters, the present situation, and what they do and do not want from John.
- Do not use Autopsy subject areas as an agenda. They are dormant background context only and must not control the dialogue.
- When the operator says they need help deciding where to go or whether to proceed, do not begin coaching. Clarify what they want from the conversation and what is creating the uncertainty.

Conversational style:
- Listen to the latest words in the context of the conversation.
- Respond naturally and directly, usually in 1-4 spoken sentences.
- Acknowledge without parroting.
- Do not manufacture insight, tension, challenge or momentum.
- Do not force a question into every response.
- Avoid formulaic reflections, therapeutic language, motivational language, teaching language and scripted transitions.
- Sound calm, intelligent and conversational.

Constitutional test before replying:
1. Am I following the operator's reality or imposing my own agenda?
2. Am I facilitating understanding or coaching without permission?
3. Does the operator still own the destination and conclusion?
4. Is a question genuinely warranted now?
5. Could silence, acknowledgement or clarification serve better than advice?

If any answer indicates drift, revise the reply before sending it.`;

const extractText = (payload: any): string => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

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

  const input = [
    { role: "developer", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
    { role: "developer", content: [{ type: "input_text", text: `Current context:\n${context || "Not specified"}` }] },
    ...history.map((turn) => ({
      role: turn.role,
      content: [{ type: turn.role === "assistant" ? "output_text" : "input_text", text: turn.content }],
    })),
  ];

  try {
    let { response, payload } = await callOpenAI(apiKey, input, 700);

    if (!response.ok) {
      console.error("OpenAI conversation error", response.status, payload?.error?.type, payload?.error?.code);
      return res.status(502).json({ error: "John could not respond just now. Please try again." });
    }

    let reply = extractText(payload);

    if (!reply && payload?.status === "incomplete" && payload?.incomplete_details?.reason === "max_output_tokens") {
      console.warn("OpenAI response exhausted output budget; retrying", payload?.id);
      ({ response, payload } = await callOpenAI(apiKey, input, 1200));
      if (!response.ok) {
        console.error("OpenAI retry error", response.status, payload?.error?.type, payload?.error?.code);
        return res.status(502).json({ error: "John could not respond just now. Please try again." });
      }
      reply = extractText(payload);
    }

    if (!reply) {
      console.error(
        "OpenAI empty response",
        JSON.stringify({
          id: payload?.id,
          status: payload?.status,
          incompleteReason: payload?.incomplete_details?.reason,
          outputTypes: Array.isArray(payload?.output) ? payload.output.map((item: any) => item?.type) : [],
        }),
      );
      return res.status(502).json({ error: "John did not produce a usable reply. Please try that again." });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Conversation service failure", error instanceof Error ? error.message : "unknown");
    return res.status(500).json({ error: "The conversation service failed unexpectedly." });
  }
}
