import type { Stage1QuoteSummary } from "@/lib/stage1Funnel";
import type { Stage1QuoteDocument } from "@/lib/stage1Documents";
import type { PublicBusinessProfile } from "@/lib/businessIdentity";

export const STAGE1_DEMO_QUOTES: Stage1QuoteSummary[] = [
  { id: "demo-q-1004", number: "Q-1004", clientName: "Paddington Property Group", status: "sent", totalIncGst: 1450, issuedAt: "2026-07-11", jobId: null },
  { id: "demo-q-1006", number: "Q-1006", clientName: "West End Studios", status: "rejected", totalIncGst: 980, issuedAt: "2026-07-12", jobId: null },
  { id: "demo-q-1001", number: "Q-1001", clientName: "Riverstone Dental Centre", status: "accepted", totalIncGst: 2035, issuedAt: "2026-07-08", jobId: "demo-j-1" },
];

export const STAGE1_DEMO_QUOTE_DOCUMENT: Stage1QuoteDocument = {
  id: "demo-q-1004",
  runId: "demo",
  number: "Q-1004",
  status: "sent",
  issuedAt: "2026-07-11",
  validUntil: "2026-07-25",
  clientName: "Paddington Property Group",
  clientContactName: "Alex Morgan",
  clientEmail: "alex@example.com",
  clientPhone: "0400 000 000",
  siteAddress: "Sample commercial premises, Paddington QLD",
  serviceDescription: "Initial office clean including floors, amenities and common areas.",
  paymentTerms: "Payment due on completion.",
  cleanTypeCode: "initial",
  cleanTypeLabel: "Initial or heavy clean",
  pricingRuleVersion: 1,
  labourServiceAmountExGst: 1280,
  estimatedConsumablesCost: 45,
  consumablesSellAmount: 38.18,
  subtotalExGst: 1318.18,
  gstAmount: 131.82,
  totalIncGst: 1450,
  jobId: null,
  jobNumber: null,
  lines: [
    { id: "demo-line-1", position: 1, description: "Floors and common areas", estimatedHours: 6, chargeOutRateExGst: 80, lineTotalExGst: 480 },
    { id: "demo-line-2", position: 2, description: "Amenities and detailed initial clean", estimatedHours: 10, chargeOutRateExGst: 80, lineTotalExGst: 800 },
  ],
  invoice: null,
};

export const STAGE1_DEMO_PROFILE: PublicBusinessProfile = {
  id: "demo-business",
  businessName: "Sample Cleaning Business",
  registeredName: "Sample Operator",
  abn: "00 000 000 000",
  contactName: "Sample Apprentice",
  phone: "0400 000 000",
  email: "sample@example.com",
  entityStatus: "Active",
  gstRegistered: true,
  verifiedAt: "2026-07-01T00:00:00.000Z",
  verified: true,
};
