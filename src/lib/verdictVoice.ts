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

const addressPersonDirectly = (value: string) => {
  const direct = value
    .replace(/\bthe candidate has\b/gi, "you have")
    .replace(/\bthe candidate is\b/gi, "you are")
    .replace(/\bthe candidate's\b/gi, "your")
    .replace(/\bthe candidate\b/gi, "you");
  return direct.replace(
    /(^|[.!?]\s+)([a-z])/g,
    (_match, boundary: string, firstLetter: string) =>
      `${boundary}${firstLetter.toUpperCase()}`,
  );
};

export function buildVerdictVoiceScript({
  verdictName,
  verdictBody,
}: VerdictVoiceInput): string {
  const name = cleanSentence(verdictName, 80) || "your current Autopsy result";
  const body = addressPersonDirectly(cleanSentence(verdictBody));
  const band = deriveBand(name);

  const opening =
    "Your full result is now on the screen. I’ll briefly explain what it means, then show you the next step available to you.";
  const decision = `Your Verdict is ${name}.`;
  const finding = body ? ` ${body}` : "";

  const next =
    band === "structurally_viable"
      ? "You have shown enough readiness for a controlled real-world test. Your available next step is First 5 Jobs, where we help you quote, complete and cost five real jobs while the numbers and consequences are still manageable. Read your fuller explanation first if you wish. You can print it or save it as a PDF, and your result will remain available in My Autopsy. When you are ready, choose Start First 5 Jobs."
      : band === "viable"
        ? "There are promising signs, but this is not permission to rush into serious commitments. Read the fuller explanation to see what remains uncertain and what should change before First 5 Jobs becomes a responsible next step. You can print it or save it as a PDF, and your result will remain available in My Autopsy. Take your time and choose Read your full explanation when you are ready."
        : band === "high_risk"
          ? "Autopsy is not opening First 5 Jobs from this result. The fuller explanation identifies the areas that need practical strengthening before you risk serious money, secure work or customer commitments. You can print it or save it as a PDF, and your result will remain available in My Autopsy. Take your time and choose Read your full explanation when you are ready."
          : band === "not_viable"
            ? "This is not a permanent judgement about you, but Autopsy is not opening First 5 Jobs from what you told us today. Read the fuller explanation before making any commitment. You can print it or save it as a PDF, and your result will remain available in My Autopsy. Reconsider Autopsy only after your circumstances or practical experience have genuinely changed."
            : band === "critical_stop"
              ? "The responsible next step is to stop here for now. That is a successful Autopsy result if it prevents an expensive mistake. Read the fuller explanation before putting money, secure work or reputation at risk. You can print it or save it as a PDF, and your result will remain available in My Autopsy."
              : "The decision on screen remains the authority. Read the fuller explanation for what it means and the next action currently available. You can print it or save it as a PDF, and your result will remain available in My Autopsy.";

  return `${opening} ${decision}${finding} ${next}`;
}
