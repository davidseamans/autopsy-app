import { deriveBand } from "@/lib/progression";

const cleanSentence = (value: unknown, limit = 520) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  const shortened = text.slice(0, limit);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf("."),
    shortened.lastIndexOf("!"),
    shortened.lastIndexOf("?"),
  );
  return sentenceEnd >= Math.floor(limit * 0.55)
    ? shortened.slice(0, sentenceEnd + 1)
    : `${shortened.trimEnd()}…`;
};

export type VerdictVoiceInput = {
  verdictName?: unknown;
  verdictBody?: unknown;
};

export function buildVerdictVoiceScript({
  verdictName,
  verdictBody,
}: VerdictVoiceInput): string {
  const name = cleanSentence(verdictName, 80) || "your current Autopsy result";
  const body = cleanSentence(verdictBody);
  const band = deriveBand(name);

  const opening =
    "Your full result is now on the screen. I’ll briefly explain what it means, then show you the next step available to you.";
  const decision = `Your Verdict is ${name}.`;
  const finding = body ? ` ${body}` : "";

  const next =
    band === "structurally_viable"
      ? "You have shown enough readiness for a controlled real-world test. Your available next step is First 5 Jobs, where we help you quote, complete and cost five real jobs while the numbers and consequences are still manageable. You can also open the fuller explanation and print it or save it as a PDF."
      : band === "viable"
        ? "There are promising signs, but this is not permission to rush into serious commitments. Read the fuller explanation to see what remains uncertain and what should change before First 5 Jobs becomes a responsible next step. You can print that explanation or save it as a PDF."
        : band === "high_risk"
          ? "Autopsy is not opening First 5 Jobs from this result. The fuller explanation identifies the areas that need practical strengthening before you risk serious money, secure work or customer commitments. You can print it or save it as a PDF and return only when something real has changed."
          : band === "not_viable"
            ? "This is not a permanent judgement about you, but Autopsy is not opening First 5 Jobs from what your answers demonstrated today. Read the fuller explanation before making any commitment. You can print it or save it as a PDF and reconsider Autopsy only after your circumstances or practical experience have genuinely changed."
            : band === "critical_stop"
              ? "The responsible next step is to stop here for now. That is a successful Autopsy result if it prevents an expensive mistake. Read the fuller explanation before putting money, secure work or reputation at risk. You can print it or save it as a PDF."
              : "The decision on screen remains the authority. Read the fuller explanation for what it means and the next action currently available. You can print it or save it as a PDF.";

  return `${opening} ${decision}${finding} ${next}`;
}
