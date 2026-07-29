import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "./_lib/supabase-server.js";

type Option = {
  id: string | number;
  label: string;
  score_value?: number;
};

type Body = {
  question_id?: string | number;
  subject_token?: string;
  prompt?: string;
  subject_boundary?: string;
  answer?: string;
  accumulated_answer?: string;
  options?: Option[];
  clarification?: string | null;
  clarification_count?: number;
};

type ResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{ text?: unknown; output_text?: unknown }>;
  }>;
};

const extractText = (rawPayload: unknown): string => {
  const payload = (rawPayload ?? {}) as ResponsePayload;
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      return typeof part.output_text === "string" ? part.output_text : "";
    })
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
  const subjectToken = body.subject_token?.trim();
  const prompt = body.prompt?.trim();
  const subjectBoundary = body.subject_boundary?.trim();
  const answer = body.answer?.trim();
  const accumulatedAnswer = body.accumulated_answer?.trim() || answer;
  const options = Array.isArray(body.options) ? body.options : [];
  if (!questionId || !subjectToken || !prompt || !subjectBoundary || !answer || options.length < 2) {
    return res.status(400).json({ error: "A locked subject, question, answer and governed options are required." });
  }

  const governedOptions = options.map((option) => ({
    id: String(option.id),
    label: option.label,
  }));
  const clarificationCount = Math.max(
    0,
    Math.min(2, Number(body.clarification_count ?? 0) || 0),
  );

  const instructions = `You are the interpretation boundary inside an explicitly authorised Autopsy assessment.

Map the candidate's natural spoken answer to exactly one of the supplied governed answer options. Do not invent an option, score, weight, threshold or verdict. Do not coach the candidate toward a stronger answer. Do not judge the person or the proposed business.

Return JSON only:
{
  "turn_type": "answer, question, repeat_request, correction, control_request or digression",
  "selected_option_id": "an exact supplied option id, or null",
  "confidence": 0 to 1,
  "plain_summary": "one short, plain-English reflection addressed directly to the person as you",
  "clarifying_question": "one short question, or null",
  "conversation_reply": "a brief direct response to a non-answer turn, or null"
}

First classify what the person is doing.
- answer: they are answering the locked subject, even if the answer is long, uncertain or indirect.
- question: they are asking what the subject means, why it matters, or requesting neutral information needed to understand it.
- repeat_request: they want the locked question repeated.
- correction: they are correcting a factual detail from an earlier answer.
- control_request: they want to pause, stop, resume or change input method.
- digression: they have moved away from the locked subject without answering it.

Classify current_utterance on its own. Do not let an earlier accumulated answer turn a present question, repeat request or control request into an answer.

Only an answer or correction may be mapped to a governed option. A question, repeat_request, control_request or digression must return selected_option_id null. Nothing in those turns is assessment material.

For a question, answer only the neutral meaning of the locked subject. You may clarify a term and explain why the subject matters, but must not disclose, quote, paraphrase or imply the governed options and must not tell the person what a strong answer would be. End by returning naturally to the locked subject.

For a repeat_request, repeat the locked question in plain language. For a digression, acknowledge it briefly and return to the locked subject. For a control_request, state the available control plainly without interpreting an answer.

Treat "I don't know", "probably", "maybe" and similar uncertainty as honest conversational answers, not as a reason to read out the governed answer menu. On the first ambiguous answer, selected_option_id must be null and clarifying_question must ask one natural, narrow follow-up about what makes the person lean that way or what they have actually done. Never list, quote, paraphrase or compare the supplied options.

If clarification_count is at least 1 and the person remains genuinely uncertain, select the supplied option that explicitly and most accurately represents unknown, untested, not demonstrated or the weakest currently supportable position. Do not strengthen the answer. If no supplied option can defensibly represent the uncertainty, selected_option_id must remain null and clarifying_question must ask one final plain question about present facts. Otherwise provide the exact option id and no clarifying question. The person will separately confirm or correct the interpretation before anything is saved.

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
              turn_type: {
                type: "string",
                enum: [
                  "answer",
                  "question",
                  "repeat_request",
                  "correction",
                  "control_request",
                  "digression",
                ],
              },
              selected_option_id: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              plain_summary: { type: "string" },
              clarifying_question: { type: ["string", "null"] },
              conversation_reply: { type: ["string", "null"] },
            },
            required: [
              "turn_type",
              "selected_option_id",
              "confidence",
              "plain_summary",
              "clarifying_question",
              "conversation_reply",
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
              subject_boundary: subjectBoundary,
              governed_options: governedOptions,
              current_utterance: answer,
              accumulated_answer: accumulatedAnswer,
              earlier_clarification: body.clarification ?? null,
              clarification_count: clarificationCount,
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
    const nonAnswerTurn = !["answer", "correction"].includes(String(parsed.turn_type));
    if (nonAnswerTurn) {
      parsed.selected_option_id = null;
      parsed.clarifying_question = null;
      parsed.plain_summary = "";
    }
    if (parsed.selected_option_id != null && !allowed.has(String(parsed.selected_option_id))) {
      return res.status(422).json({ error: "The interpretation did not match a governed answer." });
    }
    if (
      parsed.clarifying_question != null &&
      (
        String(parsed.clarifying_question).includes("/") ||
        /which of (these|the following)|choose (one|from)|options? (are|include)/i.test(
          String(parsed.clarifying_question),
        )
      )
    ) {
      parsed.clarifying_question =
        clarificationCount > 0
          ? "What have you actually done or seen that would help you answer?"
          : "That is fair. What makes you lean that way?";
    }
    return res.status(200).json({
      ...parsed,
      question_id: questionId,
      subject_token: subjectToken,
    });
  } catch {
    return res.status(502).json({ error: "John could not form a reliable interpretation. Please try again." });
  }
}
