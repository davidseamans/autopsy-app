type GovernedOption = {
  id: string;
  label: string;
  score_value: number | null;
};

const includesAll = (text: string, patterns: RegExp[]) =>
  patterns.every((pattern) => pattern.test(text));

const countMatches = (text: string, patterns: RegExp[]) =>
  patterns.filter((pattern) => pattern.test(text)).length;

const floorForSpokenFacts = (subjectCode: string, answer: string): number | null => {
  const text = answer.toLowerCase();

  if (
    subjectCode === "CR_01" &&
    /\b(4|5|6|7|8|9|10|11|12|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b/.test(text) &&
    /\b(budget|expenses?|costs?|partner|income|savings?|contingenc|allowance)\b/.test(text)
  ) return 3;

  if (
    subjectCode === "EL_01" &&
    /\b(job[- ]?cost|cost ledger|ledger|costing)\b/.test(text) &&
    /\b(each|every|per)\s+job\b/.test(text) &&
    /\b(price|revenue|income|costs?|expenses?|margin|profit|left)\b/.test(text)
  ) return 3;

  if (
    subjectCode === "EL_02" &&
    /\b(job[- ]?cost|cost ledger|ledger|costing)\b/.test(text) &&
    /\b(each|every|per)\s+job\b/.test(text)
  ) return 3;

  if (
    subjectCode === "EL_02" &&
    /\b(previously|before|formerly|used to|have|had)\b/.test(text) &&
    (
      (
        /\b(ran|managed|owned|operated)\b/.test(text) &&
        /\b(cleaning business|cleaning company)\b/.test(text)
      ) ||
      (
        /\b(worked|work|experience)\b.{0,30}\b(cleaner|cleaning)\b/.test(text) &&
        /\b(ran|managed|owned|operated)\b.{0,20}\b(my|our|own|a)\b.{0,20}\b(business|company)\b/.test(text)
      )
    )
  ) {
    const recurringCostCount = countMatches(text, [
      /\b(labou?r|wages?|staff|time)\b/,
      /\b(travel|fuel|vehicle|transport)\b/,
      /\b(supplies|chemicals?|materials?|equipment)\b/,
      /\b(rework|callbacks?|quality)\b/,
      /\b(insurance|administration|admin|tax|gst|software)\b/,
    ]);
    return recurringCostCount >= 2 ? 3 : 2;
  }

  if (
    subjectCode === "MR_01" &&
    /\b(booked|booking|scheduled|confirmed|accepted)\b/.test(text) &&
    /\b(job|work|clean|client|customer|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text)
  ) return 3;

  if (
    subjectCode === "MR_01" &&
    /\b(past|previous|former|old|existing)\s+(clients?|customers?)\b/.test(text) &&
    (
      /\b(talked|spoke|contacted|called|messaged|approached)\b/.test(text) ||
      /\b(paid|hired|used|booked|rebooked|returned|cleaned|worked)\b/.test(text)
    )
  ) return 3;

  if (
    subjectCode === "EX_01" &&
    (
      includesAll(text, [
        /\b(worked|went out|helped|shadowed|assisted|trained)\b/,
        /\b(friend|cleaner|cleaning business|operator)\b/,
        /\b(clean|management|paperwork|job|customer|years?|months?)\b/,
      ]) ||
      includesAll(text, [
        /\b(worked|cleaned|ran|managed|owned|operated)\b/,
        /\b(as (a )?cleaner|cleaning (jobs?|work|business)|my own business|own business)\b/,
        /\b(customers?|clients?|jobs?|staff|business|cleaning|before|previously|years?|months?)\b/,
      ])
    )
  ) return 3;

  if (
    subjectCode === "OP_02" &&
    /\b(checklist|written|wrote|documented|steps?|sequence|procedure|method)\b/.test(text) &&
    /\b(tools?|supplies|chemicals?|quality|check)\b/.test(text)
  ) return /\b(used|tested|repeat|each|every)\b/.test(text) ? 3 : 2;

  if (
    subjectCode === "OP_02" &&
    /\b(sop|sops|standard operating procedure|procedures?|method|process)\b/.test(text) &&
    (
      /\b\d{1,2}\s*(?:%|percent)\b/.test(text) ||
      /\b(partly|partially|incomplete|started|underway|in progress)\b/.test(text)
    ) &&
    /\b(written|documented|complete|completed|developed|prepared|working on|in progress)\b/.test(text)
  ) return 2;

  return null;
};

export const applyConstitutionalScoreFloor = (
  subjectCode: string,
  accumulatedAnswer: string,
  selectedOptionId: string | null,
  options: GovernedOption[],
) => {
  const floor = floorForSpokenFacts(subjectCode, accumulatedAnswer);
  if (floor == null) return selectedOptionId;

  const selected = options.find((option) => option.id === selectedOptionId);
  if ((selected?.score_value ?? -1) >= floor) return selectedOptionId;

  const replacement = [...options]
    .filter((option) => option.score_value != null && option.score_value >= floor)
    .sort((a, b) => Number(a.score_value) - Number(b.score_value))[0];

  return replacement?.id ?? selectedOptionId;
};
