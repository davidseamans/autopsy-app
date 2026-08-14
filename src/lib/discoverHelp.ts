export type HelpScope = "discover" | "cleaning-sleeve";

export type HelpEntry = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  scope: HelpScope;
  target: {
    label: string;
    path: string;
    id: string;
  };
};

export const discoverHelpEntries: HelpEntry[] = [
  {
    id: "first-five-jobs",
    question: "What do I do in First 5 Jobs?",
    answer: "Use the screen to practise finding leads, preparing written quotes, completing five genuine paid jobs and learning from the simple job and cash figures. It is a supported business trial, not an accounting system or an exam.",
    keywords: ["start", "first 5 jobs", "5jd", "overview", "what next"],
    scope: "discover",
    target: { label: "Show First 5 Jobs", path: "/stage-1", id: "first-five-jobs" },
  },
  {
    id: "leads",
    question: "Where do I record leads?",
    answer: "Open Leads and log the activity that produced the enquiries. Record potential customers as people, not just a total, so they can move into Quotes Potential.",
    keywords: ["lead", "leads", "enquiry", "enquiries", "prospect", "marketing", "activity"],
    scope: "discover",
    target: { label: "Open Leads", path: "/stage-1", id: "leads" },
  },
  {
    id: "lead-contact-details",
    question: "Why do potential customers need contact details?",
    answer: "A name plus a phone number or email turns a lead total into someone you can actually contact. Those details flow to Quotes Potential and can prefill a written quote.",
    keywords: ["potential customer", "contact details", "phone", "email", "quotes potential", "lead person"],
    scope: "discover",
    target: { label: "Show Quotes Potential", path: "/stage-1/quotes", id: "quotes-potential" },
  },
  {
    id: "quotes-potential",
    question: "What is Quotes Potential?",
    answer: "It is the short list of potential customers who have not received a written quote yet. Keep only enough contact detail to arrange the appointment, then prepare the quote after you understand the work.",
    keywords: ["potential", "quotes potential", "unquoted", "opportunity", "customer"],
    scope: "discover",
    target: { label: "Open Quotes Potential", path: "/stage-1/quotes", id: "quotes-potential" },
  },
  {
    id: "prepare-quote",
    question: "How do I prepare a written quote?",
    answer: "Open Quotes, choose a potential customer or create a quote, then enter the customer, work, estimated hours and charge-out rate. Review the finished document before giving it to the customer.",
    keywords: ["quote", "quotation", "price", "estimate", "charge out rate", "written quote"],
    scope: "discover",
    target: { label: "Go to Create a quote", path: "/stage-1/quotes/new", id: "quote-customer-work" },
  },
  {
    id: "accepted-quote",
    question: "What happens when a quote is accepted?",
    answer: "Marking a quote accepted creates one First 5 Jobs job. That job then holds the simple cost, invoice, payment, hours and margin picture for the work.",
    keywords: ["accepted", "accept quote", "create job", "conversion", "won"],
    scope: "discover",
    target: { label: "Show the Quotes register", path: "/stage-1/quotes", id: "quotes-register" },
  },
  {
    id: "job-summary",
    question: "Where is the Job Cost Summary?",
    answer: "Use Job Summary on First 5 Jobs and open a job. It brings together the quote, invoices, payments, job costs and actual hours so you can see what happened without turning 5JD into full accounting software.",
    keywords: ["job cost", "job summary", "cost report", "actual hours", "invoice", "expenses"],
    scope: "discover",
    target: { label: "Show Job Summary", path: "/stage-1", id: "job-summary" },
  },
  {
    id: "money-owing",
    question: "Where can I see money owing?",
    answer: "The Debtors view shows customer invoices, payments received and the remaining balance for each First 5 Jobs job. It is a practical follow-up view, not a replacement for your bank account.",
    keywords: ["money owing", "owed", "debtors", "unpaid", "outstanding", "payment", "balance"],
    scope: "discover",
    target: { label: "Show Money Owing", path: "/stage-1", id: "money-owing" },
  },
  {
    id: "gross-margin",
    question: "What does gross margin tell me?",
    answer: "Gross margin is the portion of job revenue left after the direct costs recorded for that work. In First 5 Jobs it is a learning signal: use it to ask what you estimated well and what you would change next time.",
    keywords: ["margin", "gross margin", "profit", "percentage", "costs", "money"],
    scope: "discover",
    target: { label: "Show Gross Margin", path: "/stage-1", id: "margin" },
  },
  {
    id: "accountant-pack",
    question: "What is the Accountant Pack?",
    answer: "It downloads the First 5 Jobs records and available attachments for review or handover. Check the result against QBO and bank feeds before anyone imports or enters transactions.",
    keywords: ["accountant", "pack", "download", "records", "attachments", "qbo"],
    scope: "discover",
    target: { label: "Show Accountant Pack", path: "/stage-1", id: "accountant-pack" },
  },
  {
    id: "business-details",
    question: "Where do I set up my business details?",
    answer: "Business Details holds the customer-facing name, contact details and verified ABN identity used by First 5 Jobs documents. Complete it before creating live quotes or recording activity.",
    keywords: ["business details", "abn", "business name", "gst", "identity", "setup"],
    scope: "discover",
    target: { label: "Open Business Details", path: "/business-setup", id: "business-identity" },
  },
  {
    id: "cleaning-guide",
    question: "How do I find help with a cleaning problem?",
    answer: "Use the Cleaning Technical Guide. Start with what you can see, choose the surface and location, and follow only a verified safe next step. Stop when the guide tells you the condition or chemical history is uncertain.",
    keywords: ["cleaning", "technical", "procedure", "chemical", "surface", "shower", "toilet", "kitchen", "window"],
    scope: "cleaning-sleeve",
    target: { label: "Open Cleaning Technical Guide", path: "/stage-1/technical-guide", id: "technical-guide-search" },
  },
];

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function searchDiscoverHelp(query: string): HelpEntry[] {
  const clean = normalise(query);
  if (!clean) return [];
  const terms = clean.split(/\s+/).filter((term) => term.length > 1);

  return discoverHelpEntries
    .map((entry) => {
      const question = normalise(entry.question);
      const haystack = normalise(`${entry.question} ${entry.answer} ${entry.keywords.join(" ")}`);
      const score = terms.reduce((total, term) => total + (question.includes(term) ? 4 : haystack.includes(term) ? 1 : 0), 0)
        + (haystack.includes(clean) ? 6 : 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);
}

export function buildHelpTargetUrl(entry: HelpEntry, currentSearch: string): string {
  const current = new URLSearchParams(currentSearch);
  const target = new URLSearchParams();
  const runId = current.get("runId");
  const demo = current.get("demo");
  if (runId) target.set("runId", runId);
  if (demo === "1") target.set("demo", "1");
  target.set("helpTarget", entry.target.id);
  return `${entry.target.path}?${target.toString()}`;
}

export function suggestedHelpEntries(pathname: string): HelpEntry[] {
  const ids = pathname.includes("technical-guide")
    ? ["cleaning-guide", "first-five-jobs"]
    : pathname.includes("quotes/new")
      ? ["prepare-quote", "quotes-potential", "gross-margin"]
      : pathname.includes("quotes")
        ? ["quotes-potential", "accepted-quote", "prepare-quote"]
        : pathname.includes("business-setup")
          ? ["business-details", "first-five-jobs"]
          : ["leads", "quotes-potential", "job-summary", "money-owing", "gross-margin"];
  return ids.map((id) => discoverHelpEntries.find((entry) => entry.id === id)).filter((entry): entry is HelpEntry => Boolean(entry));
}
