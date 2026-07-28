import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "./_lib/supabase-server.js";

type Option = {
  id: string | number;
  label: string;
  score_value?: number;
};

type Body = {
  question_id?: string | number;
  prompt?: string;
  answer?: string;
  options?: Option[];
  clarification?: string | null;
};

const extractText = (payload: any): string => {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((part: any) => part?.text ?? part?.output_text ?? "")
    .filter(Boolean)
    .join("")
    .trim();
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });
  } catch {
    return res.status(503).json({ error: "Assessment authentication is not configured." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Assessment conversation is not configured." });

  const body = (req.body ?? {}) as Body;
  const questionId = body.question_id == null ? "" : String(body.question_id).trim();
  const prompt = body.prompt?.trim();
  const answer = body.answer?.trim();
  const options = Array.isArray(body.options) ? body.options : [];
  if (!questionId || !prompt || !answer || options.length < 2) {
    return res.status(400).json({ error: "A question identity, question, answer and governed options are required." });
  }

  const governedOptions = options.map((option) => ({
    id: String(option.id),
    label: option.label,
  }));

  const instructions = `You are the interpretation boundary inside an explicitly authorised Autopsy assessment.

Map the candidate's natural spoken answer to exactly one of the supplied governed answer options. Do not invent an option, score, weight, threshold or verdict. Do not coach the candidate toward a stronger answer. Do not judge the person or the proposed business.

Return JSON only:
{
  "selected_option_id": "an exact supplied option id, or null",
  "confidence": 0 to 1,
  "plain_summary": "one short, plain-English reflection addressed directly to the person as you",
  "clarifying_question": "one short question, or null"
}

If the answer is ambiguous, incomplete, contradictory, or confidence is below 0.78, selected_option_id must be null and clarifying_question must ask only for the missing distinction. Otherwise provide the exact option id and no clarifying question. The person will separately confirm or correct the interpretation before anything is saved.

The plain_summary is spoken aloud by John. It must be a natural reflection of what the person actually said, not a governed option label, criterion, answer menu or new question. Use no more than 18 words. Address the person directly in the second person: for example, "You could manage for about a month without income." Never say "the candidate", "candidate estimates", "they", "their answer", "the respondent", or speak about the person as if they are absent. Never include slashes, a list of alternatives, "which of these", or a question mark. Avoid the words evidence, score, dimension, hard fail, maturity and assessment engine.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CONVERSATION_MODEL || "gpt-5-mini",
      reasoning: { effort: "low" },
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "autopsy_answer_interpretation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              selected_option_id: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              plain_summary: { type: "string" },
              clarifying_question: { type: ["string", "null"] },
            },
            required: [
              "selected_option_id",
              "confidence",
              "plain_summary",
              "clarifying_question",
            ],
          },
        },
      },
      input: [
        { role: "developer", content: [{ type: "input_text", text: instructions }] },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              question: prompt,
              governed_options: governedOptions,
              candidate_answer: answer,
              earlier_clarification: body.clarification ?? null,
            }),
          }],
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error("Assessment interpretation failed", response.status, payload?.error?.code);
    return res.status(502).json({ error: "John could not interpret that answer. Please try again." });
  }

  try {
    const parsed = JSON.parse(extractText(payload));
    const allowed = new Set(governedOptions.map((option) => option.id));
    if (parsed.selected_option_id != null && !allowed.has(String(parsed.selected_option_id))) {
      return res.status(422).json({ error: "The interpretation did not match a governed answer." });
    }
    return res.status(200).json({ ...parsed, question_id: questionId });
  } catch {
    return res.status(502).json({ error: "John could not form a reliable interpretation. Please try again." });
  }
}
