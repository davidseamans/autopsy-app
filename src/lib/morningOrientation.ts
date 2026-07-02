export type MorningSignal = "green" | "yellow" | "orange" | "red" | "blocked";

export type MorningSection = {
  key: string;
  label: string;
  signal: MorningSignal;
  summary: string;
};

export type MorningPriority = {
  signal: MorningSignal;
  text: string;
};

export type MorningOrientationReport = {
  owner_name: string;
  report_date: string;
  generated_at: string;
  source: string;
  sections: MorningSection[];
  priorities: MorningPriority[];
  yesterday: string[];
  recommendation: string;
};

export const signalEmoji: Record<MorningSignal, string> = {
  green: "🟢",
  yellow: "🟡",
  orange: "🟠",
  red: "🔴",
  blocked: "⚫",
};

export const baselineMorningOrientation: MorningOrientationReport = {
  owner_name: "David",
  report_date: new Date().toISOString().slice(0, 10),
  generated_at: new Date().toISOString(),
  source: "baseline",
  sections: [
    { key: "business_health", label: "Business Health", signal: "green", summary: "Healthy" },
    { key: "sales", label: "Sales", signal: "green", summary: "Healthy" },
    { key: "operations", label: "Operations", signal: "yellow", summary: "Attention recommended" },
    { key: "finance", label: "Finance", signal: "green", summary: "Healthy" },
    { key: "people", label: "People", signal: "yellow", summary: "Attention recommended" },
    { key: "growth", label: "Growth", signal: "green", summary: "Healthy" },
  ],
  priorities: [
    { signal: "red", text: "Approve payroll before 11:00" },
    { signal: "yellow", text: "Mary certification expires in 14 days" },
    { signal: "yellow", text: "Smith Residence referral opportunity" },
  ],
  yesterday: ["6 jobs completed", "2 invoices requested", "No critical exceptions"],
  recommendation: "Spend 30 minutes issuing the remaining two quotes before 10:00.",
};
