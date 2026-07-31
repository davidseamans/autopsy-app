import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "./_lib/supabase-server.js";
import { applyConstitutionalScoreFloor } from "./_lib/autopsy-scoring-policy.js";

type Option = {
  id: string | number;
  label: string;
  score_value?: number;
};

type Body = {
  question_id?: string | number;
  subject_code?: string;
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
  const subjectCode = body.subject_code?.trim() ?? "";
  const subjectToken = body.subject_token?.trim();
  const prompt = body.prompt?.trim();
  const subjectBoundary = body.subject_boundary?.trim();
  const answer = body.answer?.trim();
  const accumulatedAnswer = body.accumulated_answer?.trim() || answer;
  const options = Array.isArray(body.options) ? body.options : [];
  if (!questionId || !subjectCode || !subjectToken || !prompt || !subjectBoundary || !answer || options.length < 2) {
    return res.status(400).json({ error: "A locked subject, question, answer and governed options are required." });
  }

  const governedOptions = options.map((option) => ({
    id: String(option.id),
    label: option.label,
    score_value: Number.isFinite(Number(option.score_value))
      ? Number(option.score_value)
      : null,
  }));
  const clarificationCount = Math.max(
    0,
    Math.min(2, Number(body.clarification_count ?? 0) || 0),
  );

  const instructions = `You are the interpretation boundary inside an explicitly authorised Autopsy assessment.

Map the candidate's natural spoken answer to exactly one of the supplied governed answer options. The supplied score_value is immutable metadata that describes the existing strength represented by that option. Use it only to distinguish the governed levels accurately. Never alter it, average it, optimise for it or reveal it. Do not invent an option, score, weight, threshold or verdict. Do not coach the candidate toward a stronger answer. Do not judge the person or the proposed business.

Return JSON only:
{
  "turn_type": "answer, question, repeat_request, correction, control_request or digression",
  "selected_option_id": "an exact supplied option id, or null",
  "confidence": 0 to 1,
  "plain_summary": "one short, plain-English reflection addressed directly to the person as you",
  "spoken_acknowledgement": "a natural acknowledgement of one fact the person gave, under 14 words",
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

For a question, do not teach the subject. Do not define a commercial term, explain a calculation, recommend recordkeeping, describe good practice, supply an example, or tell the person how to improve. Acknowledge the question and explain that teaching during Autopsy could shape the answer. Return naturally to what the person currently understands or does.

For a repeat_request, repeat the locked question in plain language. For a digression, acknowledge it briefly and return to the locked subject. For a control_request, state the available control plainly without interpreting an answer.

Treat "I don't know", "probably", "maybe" and similar uncertainty as honest conversational answers, not as a reason to read out the governed answer menu. On the first ambiguous answer, selected_option_id must be null and clarifying_question must ask one natural, narrow follow-up about what makes the person lean that way or what they have actually done. Never list, quote, paraphrase or compare the supplied options.

If clarification_count is at least 1, do not ask another clarifying question. Select the supplied option that most accurately represents the accumulated answer at its currently supportable strength, including unknown, untested or not demonstrated where appropriate. Do not strengthen the answer. Return the exact option id and no clarifying question. The selection is saved silently; never ask the person to confirm the machine's option mapping.

Selection accuracy is more important than conversational optimism. A detailed, direct answer that fully and specifically satisfies the strongest supplied option must map to that option. Do not downgrade it merely because the person has not used the option's exact wording. Conversely, do not upgrade intention, confidence, plans or general positivity into completed action, tested understanding or demonstrated reliability.

The person's truthful account is the assessment input. Autopsy is not a compliance inspection. Do not demand documents, receipts, signed orders, deposits or external exhibits unless the locked subject itself expressly asks about them. Do not replace a disclosed fact with an accusation that it is unproven. A firm booking is customer action. Sustained work alongside an experienced operator is practical experience. Prior work as a cleaner is practical experience, and prior responsibility for managing or owning a real business is relevant operating experience. A job-cost ledger maintained for each job is direct understanding of job economics and recurring costs.

For every answer, silently separate:
1. the decisive fact that directly answers the locked subject,
2. supporting facts that make that answer more dependable, and
3. surrounding detail that is irrelevant to this subject.
Map the decisive and supporting facts together. Do not let a long answer, conversational wording, or irrelevant detail dilute a clear answer. A quantified outcome supported by the person's described inputs, method, household resources, allowance or contingency can satisfy an option that says the position is known or can be shown. Do not ask the person to repeat a decisive fact already supplied.

The plain_summary is an internal audit note and is never spoken to the person. Keep it factual and under 18 words. Never use specialist shorthand such as cash runway, evidence, score, dimension, hard fail, maturity or assessment engine.

The spoken_acknowledgement is heard by the person before the next subject. Reflect one fact they actually supplied without praising, judging, coaching, introducing jargon or mentioning proof, evidence, scoring or an option. Examples: "Working alongside an experienced cleaner has given you practical exposure." "Those future bookings are a real customer commitment."`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CONVERSATION_MODEL || "gpt-5-mini",
      reasoning: { effort: "low" },
      max_output_tokens: 700,
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
              spoken_acknowledgement: { type: "string" },
              clarifying_question: { type: ["string", "null"] },
              conversation_reply: { type: ["string", "null"] },
            },
            required: [
              "turn_type",
              "selected_option_id",
              "confidence",
              "plain_summary",
              "spoken_acknowledgement",
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
              subject_code: subjectCode,
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
      if (parsed.turn_type === "question") {
        parsed.conversation_reply =
          "That is a fair question. I will not teach or improve the answer during Autopsy because that could shape the result. Tell me what you understand or do today.";
      } else if (parsed.turn_type === "repeat_request") {
        parsed.conversation_reply = `Of course. ${prompt}`;
      } else if (parsed.turn_type === "control_request") {
        parsed.conversation_reply =
          "Certainly. Use the pause or input control on screen when you need it. We will keep this subject open.";
      } else {
        parsed.conversation_reply =
          `I understand. Let us keep that aside for now and return to this subject. ${prompt}`;
      }
    }
    if (parsed.selected_option_id != null && !allowed.has(String(parsed.selected_option_id))) {
      return res.status(422).json({ error: "The interpretation did not match a governed answer." });
    }
    if (parsed.selected_option_id != null) {
      parsed.selected_option_id = applyConstitutionalScoreFloor(
        subjectCode,
        accumulatedAnswer ?? answer,
        String(parsed.selected_option_id),
        governedOptions,
      );
      const selected = governedOptions.find(
        (option) => option.id === String(parsed.selected_option_id),
      );
      if (!selected) {
        return res.status(422).json({ error: "The interpretation did not match a governed answer." });
      }
      parsed.plain_summary = selected.label
        .replace(/^I am\b/i, "You are")
        .replace(/^I'm\b/i, "You are")
        .replace(/^I have\b/i, "You have")
        .replace(/^I've\b/i, "You have")
        .replace(/^I can\b/i, "You can")
        .replace(/^I know\b/i, "You know")
        .replace(/^I understand\b/i, "You understand")
        .replace(/^My\b/i, "Your")
        .replace(/^Yes\s*[-—:]\s*/i, "")
        .replace(/^No\s*[-—:]\s*/i, "")
        .trim();
      parsed.spoken_acknowledgement = String(parsed.spoken_acknowledgement ?? "")
        .replace(/\b(proof|evidence|score|rubric|cash runway)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
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
