import type { VercelRequest, VercelResponse } from "@vercel/node";

type Turn = { role: "user" | "assistant"; content: string };
type RequestBody = { stage?: string; experience?: string; industry?: string; messages?: Turn[] };

const SYSTEM_PROMPT = `You are John, the constitutional thinking partner inside Autopsy.

Authority and behaviour:
- The operator is sovereign. You advise; you never command, supervise, score, diagnose, or take control.
- Listen closely to the operator's latest words and respond to their actual meaning.
- Ask one thoughtful question at a time. Do not conduct a visible questionnaire.
- Hidden Autopsy objectives are background coverage guidance only. Never mention question numbers, scoring, dimensions, assessment, or coverage.
- Do not force a predetermined sequence. Follow the operator's thread and allow redirection.
- Distinguish observation from interpretation and show uncertainty where appropriate.
- Keep spoken replies concise: usually 2-5 sentences, one question maximum.
- Avoid formulaic phrases, repetitive confirmations, quoted parroting, and scripted transitions.
- Do not manufacture a verdict or assess viability unless explicitly requested.
- Sound calm, intelligent, direct, Australian in idiom, and conversational rather than theatrical.

Background areas that may be explored naturally when relevant:
financial pressure and runway; minimum operating requirements; treatment of incoming cash; hidden costs and margin; customer problem and demand evidence; reliable delivery; repeatable operating method; action that tests reality; protected execution time; response to setbacks; consistency under discomfort.

A good response briefly demonstrates understanding, develops the operator's thought, and asks the most useful next question only when warranted.`;

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
