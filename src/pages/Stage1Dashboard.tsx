import { useEffect, useMemo, useState } from "react";
import {
  SEED_UNITS,
  computeScorecard,
  JobDetailSheet,
  type ProofUnit,
} from "./Stage1";
import { supabase, isDebug } from "@/lib/supabase";
import {
  createQuote,
  setQuoteOutcome,
  convertQuoteToJob,
  loadStage1Board,
} from "@/lib/jobProvisioning";
import { getActiveRunId } from "@/lib/progression";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  FileText,
  Briefcase,
  TrendingUp,
  CheckCircle2,
  IdCard,
  Loader2,
  Plus,
} from "lucide-react";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Signed money display: handles negatives as "-$X.XX" rather than "$-X.XX"
const fmtSignedMoney = (n: number) => `${n < 0 ? "-" : ""}$${fmtMoney(Math.abs(n))}`;

// Convert yyyy-mm-dd (from <input type="date">) to dd/mm/yyyy for AU display
const isoToAU = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

// ---------- Sample fixtures for the KPI drill-downs ----------
// These mirror the operating story used by the existing ledger.
// Baseline figures for fields that aren't captured by Log Activity (leads, jobs)
// plus a static baseline note. Attempts / contacts / quotes are aggregated from
// dated activity records on top of this baseline.
const METHOD_BASELINE: { method: string; attempts: number; contacts: number; leads: number; quotes: number; jobs: number; notes: string }[] = [];
const METHOD_OPTIONS = [
  "Phone Outreach",
  "Referral Request",
  "Local Flyer",
  "Email Outreach",
  "Walk-in",
  "Other",
];

type LeadActivity = {
  id: string;
  activity_date: string; // yyyy-mm-dd
  method: string;
  attempts: number;
  contacts_made: number;
  quotes_generated: number;
  notes: string;
  created_at: string;
};

const QUOTE_STATUSES = ["Sent", "Accepted", "Declined", "Expired", "Rejected"] as const;
type QuoteStatus = typeof QUOTE_STATUSES[number];
const REJECTION_REASONS = [
  "Too expensive",
  "No confidence",
  "Poor fit",
  "Slow response",
  "Competitor chosen",
  "Scope unclear",
  "No budget",
  "Other",
] as const;

type Quote = {
  number: string;
  client: string;
  site: string;
  value: number;
  status: QuoteStatus;
  quoteDate: string;   // iso yyyy-mm-dd
  followUp: string;    // iso yyyy-mm-dd
  reason: string;
  converted?: boolean;
  convertedToN?: number;
  convertedJobNumber?: string;
  convertedAt?: string;
  sourceActivityId?: string;
  sourceActivityDate?: string;
  method?: string;
  notes?: string;
  createdAt?: string;
  // Real Core linkage (quotes table)
  dbId?: string;
  accountId?: string;
  siteId?: string;
};

// Seed: the five accepted quotes that produced the five ledger jobs,
// plus a handful of in-flight / rejected quotes for the conversion board.
const SEED_QUOTES: Quote[] = [];

// Canonical Stage 1 snapshot shape, returned by the read-only Supabase RPC
// public.get_stage1_progress_snapshot_by_run(p_run_id uuid). Supabase owns
// identity resolution and is the source of truth; this component never
// assembles progression tables or invents identity.
type Stage1Snapshot = {
  stage_progress_id: string | null;
  resolved_user_id: string | null;
  user_id: string | null;
  current_stage_code: string | null;
  current_gate_status: string | null;
  autopsy_run_id: string | null;
  started_at: string | null;
  unlocked_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  notes: string | null;
  verified_evidence_count: number | null;
  total_evidence_count: number | null;
  open_commitment_count: number | null;
  met_commitment_count: number | null;
  missed_commitment_count: number | null;
  partial_commitment_count: number | null;
  latest_operator_insight_count: number | null;
  latest_operator_insight_at: string | null;
};

// Canonical Stage 1 evidence requirement row, returned by the read-only RPC
// public.get_stage1_evidence_requirements_snapshot(p_stage_progress_id uuid).
// Supabase owns the requirement templates and instantiated evidence rows; this
// component only displays them and never computes requirement status or creates
// evidence rows.
type Stage1Requirement = {
  stage_gate_evidence_id: string | null;
  stage_progress_id: string | null;
  stage_code: string | null;
  requirement_code: string | null;
  evidence_type: string | null;
  evidence_label: string | null;
  evidence_status: string | null;
  verified: boolean | null;
  verified_at: string | null;
  minimum_standard: string | null;
  required_count: number | null;
  display_order: number | null;
  related_table: string | null;
  related_record_id: string | null;
  evidence_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Canonical Stage 1 completion evaluation, returned by the read-only RPC
// public.evaluate_stage1_completion(p_stage_progress_id uuid). Supabase owns
// the evaluator; this component only displays the result and never computes
// completion client-side.
type Stage1Evaluation = {
  stage_progress_id: string | null;
  stage_code: string | null;
  current_gate_status: string | null;
  total_required: number | null;
  valid_count: number | null;
  submitted_count: number | null;
  missing_count: number | null;
  invalid_count: number | null;
  waived_count: number | null;
  is_complete: boolean | null;
  recommended_gate_status: string | null;
};

// Gate decision result returned by public.apply_stage1_gate_decision(p_stage_progress_id).
// Supabase owns the decision; this component only displays the returned audit row.
type Stage1GateDecision = {
  decision_id: string | null;
  stage_progress_id: string | null;
  decision_status: string | null;
  current_gate_status: string | null;
  is_complete: boolean | null;
  valid_count: number | null;
  total_required: number | null;
};

// Canonical Stage 1 commitment row, returned by the read-only RPC
// public.get_stage1_commitments_snapshot(p_stage_progress_id uuid). Supabase
// owns commitment state; this component only displays rows and never creates
// or checks commitments client-side.
type Stage1Commitment = {
  commitment_id: string | null;
  stage_progress_id: string | null;
  user_id: string | null;
  commitment_type: string | null;
  commitment_label: string | null;
  target_metric: string | null;
  target_value: number | null;
  baseline_value: number | null;
  status: string | null;
  due_at: string | null;
  completion_checked_at: string | null;
  actual_value_at_check: number | null;
  follow_up_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const JOB_ROWS: { job: string; client: string; site: string; status: string; start: string; income: number; costs: number; gm: number; evidence: string }[] = [];

function marginStatus(pct: number): { label: "Pass" | "Watch" | "Fail"; tone: string } {
  if (pct >= 30) return { label: "Pass", tone: "text-emerald-600" };
  if (pct >= 20) return { label: "Watch", tone: "text-amber-600" };
  return { label: "Fail", tone: "text-red-600" };
}

function KpiCard({
  label,
  primary,
  secondaries,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  primary: React.ReactNode;
  secondaries?: { k: string; v: React.ReactNode }[];
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border bg-white p-4 hover:border-foreground/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-3xl font-semibold ${tone ?? ""}`}>{primary}</div>
      {secondaries && (
        <div className="mt-2 space-y-0.5">
          {secondaries.map((s) => (
            <div key={s.k} className="text-xs text-muted-foreground flex justify-between">
              <span>{s.k}</span>
              <span className="font-medium text-foreground">{s.v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Click to drill down →</div>
    </button>
  );
}

// ---------- Business Details (simplified dialog) ----------
type BDForm = {
  business_name: string;
  abn: string;
  trading_name: string;
  business_address: string;
  contact_name: string;
  phone: string;
  email: string;
};
const EMPTY_BD: BDForm = {
  business_name: "",
  abn: "",
  trading_name: "",
  business_address: "",
  contact_name: "",
  phone: "",
  email: "",
};
const BD_REQUIRED: (keyof BDForm)[] = [
  "business_name", "abn", "business_address", "contact_name", "phone", "email",
];
const BD_EXTRA_KEY = "stage1.business_details.extras";

function useBusinessDetails() {
  const [loaded, setLoaded] = useState(false);
  const [complete, setComplete] = useState(false);
  const [form, setForm] = useState<BDForm>(EMPTY_BD);
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("business_identity_profile")
          .select("*")
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const extras = (() => {
          try { return JSON.parse(localStorage.getItem(BD_EXTRA_KEY) || "{}"); } catch { return {}; }
        })();
        if (data) {
          setRowId((data as any).id ?? null);
          const merged: BDForm = {
            ...EMPTY_BD,
            business_name: data.business_name ?? "",
            contact_name: data.contact_name ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            abn: data.abn ?? "",
            trading_name: extras.trading_name ?? "",
            business_address: extras.business_address ?? "",
          };
          setForm(merged);
          setComplete(BD_REQUIRED.every((k) => String(merged[k] ?? "").trim().length > 0));
        }
      } catch {
        /* ignore */
      }
      setLoaded(true);
    })();
  }, []);

  async function save(next: BDForm): Promise<{ ok: boolean; error?: string }> {
    const missing = BD_REQUIRED.filter((k) => !String(next[k] ?? "").trim());
    if (missing.length) return { ok: false, error: `Missing: ${missing.join(", ")}` };
    const payload: any = {
      business_name: next.business_name,
      contact_name: next.contact_name,
      phone: next.phone,
      email: next.email,
      abn: next.abn,
    };
    if (rowId) payload.id = rowId;
    const { data, error } = await supabase
      .from("business_identity_profile")
      .upsert(payload)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (data?.id) setRowId(data.id);
    localStorage.setItem(
      BD_EXTRA_KEY,
      JSON.stringify({
        trading_name: next.trading_name,
        business_address: next.business_address,
      }),
    );
    setForm(next);
    setComplete(true);
    return { ok: true };
  }

  return { loaded, complete, form, setForm, save };
}

function BusinessDetailsDialog({
  open,
  onOpenChange,
  hook,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hook: ReturnType<typeof useBusinessDetails>;
}) {
  const { form, setForm, save } = hook;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof BDForm>(k: K, v: BDForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const missing = BD_REQUIRED.filter((k) => !String(form[k] ?? "").trim());

  async function onSave() {
    setSaving(true);
    setErr(null);
    const res = await save(form);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Save failed");
      return;
    }
    onOpenChange(false);
  }

  const field = (id: keyof BDForm, label: string, required?: boolean, type: string = "text") => (
    <div className="space-y-1.5" key={id}>
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={form[id]}
        onChange={(e) => set(id, e.target.value)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complete Business Details</DialogTitle>
          <DialogDescription>
            Required for Stage 1. ABN will be validated externally later. GST registration and bank account details are intentionally not collected here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {field("business_name", "Business name", true)}
          {field("abn", "ABN", true)}
          {field("trading_name", "Trading name (if different)")}
          <div className="md:col-span-2">
            {field("business_address", "Business address", true)}
          </div>
          {field("contact_name", "Contact name", true)}
          {field("phone", "Contact phone", true)}
          {field("email", "Contact email", true, "email")}
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <DialogFooter className="gap-2">
          <p className="text-xs text-muted-foreground mr-auto">
            {missing.length === 0 ? "All required fields complete." : `Missing: ${missing.join(", ")}`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || missing.length > 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save business details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Drill-down panel (inline, horizontal) ----------
type DrillKey = "leads" | "conversions" | "jobs" | "margin";

const DRILL_META: Record<DrillKey, { title: string; subtitle: string }> = {
  leads: {
    title: "Lead Method Performance",
    subtitle: "Where leads are coming from and what is converting.",
  },
  conversions: {
    title: "Quote Conversion Board",
    subtitle: "Quotes issued, accepted, rejected, and pending.",
  },
  jobs: {
    title: "Active Jobs Register",
    subtitle: "Current and completed jobs contributing to Stage 1 proof.",
  },
  margin: {
    title: "Gross Margin Summary",
    subtitle: "Income, job costs, gross profit, and margin by job.",
  },
};

function DrillBody({
  kind,
  methodRows,
  quotes,
  selectedQuoteNumber,
  onSelectQuote,
  onUpdateQuote,
  onOpenQuoteDetail,
  units,
  onOpenUnit,
}: {
  kind: DrillKey;
  methodRows: typeof METHOD_BASELINE;
  quotes: Quote[];
  selectedQuoteNumber: string | null;
  onSelectQuote: (n: string) => void;
  onUpdateQuote: (n: string) => void;
  onOpenQuoteDetail: (n: string) => void;
  units: ProofUnit[];
  onOpenUnit: (n: number) => void;
}) {
  return (
    <div className="space-y-4">
      {kind === "leads" && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Quotes</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methodRows.map((r) => (
                  <TableRow key={r.method}>
                    <TableCell className="font-medium">{r.method}</TableCell>
                    <TableCell className="text-right">{r.attempts}</TableCell>
                    <TableCell className="text-right">{r.contacts}</TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
                    <TableCell className="text-right">{r.quotes}</TableCell>
                    <TableCell className="text-right">{r.jobs}</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3">
            {methodRows.map((r) => (
              <div key={r.method} className="rounded-md border p-3">
                <div className="font-medium">{r.method}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Attempts</div><div>{r.attempts}</div></div>
                  <div><div className="text-muted-foreground">Contacts</div><div>{r.contacts}</div></div>
                  <div><div className="text-muted-foreground">Leads</div><div>{r.leads}</div></div>
                  <div><div className="text-muted-foreground">Quotes</div><div>{r.quotes}</div></div>
                  <div><div className="text-muted-foreground">Jobs</div><div>{r.jobs}</div></div>
                </div>
                {r.notes && <div className="mt-2 text-xs text-muted-foreground">{r.notes}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {kind === "conversions" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Quote Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Rejection</TableHead>
                  <TableHead className="text-right">Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.filter((q) => !q.converted).map((r) => {
                  const isSel = r.number === selectedQuoteNumber;
                  return (
                  <TableRow
                    key={r.number}
                    className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                    onClick={() => onSelectQuote(r.number)}
                  >
                    <TableCell>
                      <input
                        type="radio"
                        name="quote-select"
                        checked={isSel}
                        onChange={() => onSelectQuote(r.number)}
                        aria-label={`Select ${r.number}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                        className="hover:underline focus:outline-none"
                      >
                        {r.number}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.quoteDate ? isoToAU(r.quoteDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight">{r.client}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{r.site}</div>
                    </TableCell>
                    <TableCell className="text-right">${fmtMoney(r.value)}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.followUp ? isoToAU(r.followUp) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); onUpdateQuote(r.number); }}
                        >
                          Update
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {quotes.filter((q) => !q.converted).map((r) => {
              const isSel = r.number === selectedQuoteNumber;
              return (
              <div
                key={r.number}
                className={`rounded-md border p-3 space-y-1 text-sm cursor-pointer ${isSel ? "bg-muted/60" : ""}`}
                onClick={() => onSelectQuote(r.number)}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                    className="font-mono text-xs hover:underline"
                  >
                    {r.number}
                  </button>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <div className="font-medium">{r.client}</div>
                <div className="text-xs text-muted-foreground">{r.site}</div>
                <div className="flex justify-between text-xs">
                  <span>Quote Date</span><span>{r.quoteDate ? isoToAU(r.quoteDate) : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Value</span><span className="font-medium">${fmtMoney(r.value)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Follow-up</span><span>{r.followUp ? isoToAU(r.followUp) : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Rejection</span><span>{r.reason || "—"}</span>
                </div>
                <div className="pt-1 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}>
                    View
                  </Button>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onUpdateQuote(r.number); }}>
                    Update
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Active quotes only. Select a row and use <span className="font-medium text-foreground">Quote Activity</span> to update status.
            Accepting a quote creates one job in the Simple Job Cost Ledger and removes the quote from this list.
          </p>
        </>
      )}

      {kind === "jobs" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Source Quote #</TableHead>
                  <TableHead className="text-right">
                    <div className="leading-tight">Income</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">(as per quote)</div>
                  </TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => {
                  const income = u.quoteValue ?? 0;
                  const paid = u.paymentAmount ?? 0;
                  const outstanding = income - paid;
                  const costs =
                    (u.costMaterials ?? 0) + (u.costLabour ?? 0) + (u.costSubcontractors ?? 0) + (u.costOther ?? 0);
                  const gp = income - costs;
                  const gmPct = income > 0 ? Math.round((gp / income) * 100) : u.gm;
                  const m = marginStatus(gmPct);
                  const jobNum = u.jobNumber ?? `J-${1000 + u.n}`;
                  return (
                    <TableRow
                      key={u.n}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => onOpenUnit(u.n)}
                    >
                      <TableCell className="font-mono text-xs">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                          className="hover:underline focus:outline-none"
                        >
                          {jobNum}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                          className="text-left hover:underline focus:outline-none"
                        >
                          <div className="font-medium leading-tight">{u.client}</div>
                          {u.jobSite && (
                            <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{u.sourceQuote ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{income > 0 ? `$${fmtMoney(income)}` : "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${outstanding < 0 ? "text-red-600" : ""}`}>
                        {income > 0 ? fmtSignedMoney(outstanding) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{costs > 0 ? `$${fmtMoney(costs)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{income > 0 ? `$${fmtMoney(gp)}` : "—"}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${m.tone}`}>{gmPct}%</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {units.map((u) => {
              const income = u.quoteValue ?? 0;
              const paid = u.paymentAmount ?? 0;
              const outstanding = income - paid;
              const costs =
                (u.costMaterials ?? 0) + (u.costLabour ?? 0) + (u.costSubcontractors ?? 0) + (u.costOther ?? 0);
              const gp = income - costs;
              const gmPct = income > 0 ? Math.round((gp / income) * 100) : u.gm;
              const m = marginStatus(gmPct);
              const jobNum = u.jobNumber ?? `J-${1000 + u.n}`;
              return (
                <button
                  key={u.n}
                  type="button"
                  onClick={() => onOpenUnit(u.n)}
                  className="block w-full text-left rounded-md border p-3 space-y-1 text-sm hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{jobNum}</span>
                    <Badge variant="outline">{u.status}</Badge>
                  </div>
                  <div className="font-medium">{u.client}</div>
                  {u.jobSite && <div className="text-xs text-muted-foreground">{u.jobSite}</div>}
                  <div className="flex justify-between text-xs"><span>Source Quote</span><span className="font-mono">{u.sourceQuote ?? "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Income (as per quote)</span><span>{income > 0 ? `$${fmtMoney(income)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Outstanding</span><span className={outstanding < 0 ? "text-red-600" : ""}>{income > 0 ? fmtSignedMoney(outstanding) : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>{costs > 0 ? `$${fmtMoney(costs)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross profit</span><span>{income > 0 ? `$${fmtMoney(gp)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${m.tone}`}>{gmPct}%</span></div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {kind === "margin" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => {
                  const income = u.quoteValue ?? 0;
                  const costs =
                    (u.costMaterials ?? 0) + (u.costLabour ?? 0) + (u.costSubcontractors ?? 0) + (u.costOther ?? 0);
                  const gp = income - costs;
                  const pct = income > 0 ? (gp / income) * 100 : 0;
                  const m = marginStatus(pct);
                  const jobNum = u.jobNumber ?? `J-${1000 + u.n}`;
                  return (
                    <TableRow key={u.n}>
                      <TableCell className="font-mono text-xs">{jobNum}</TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{u.client}</div>
                        {u.jobSite && <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">${fmtMoney(income)}</TableCell>
                      <TableCell className="text-right tabular-nums">${fmtMoney(costs)}</TableCell>
                      <TableCell className="text-right tabular-nums">${fmtMoney(gp)}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${m.tone}`}>{pct.toFixed(1)}%</TableCell>
                      <TableCell className={m.tone}>{m.label}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {units.map((u) => {
              const income = u.quoteValue ?? 0;
              const costs =
                (u.costMaterials ?? 0) + (u.costLabour ?? 0) + (u.costSubcontractors ?? 0) + (u.costOther ?? 0);
              const gp = income - costs;
              const pct = income > 0 ? (gp / income) * 100 : 0;
              const m = marginStatus(pct);
              const jobNum = u.jobNumber ?? `J-${1000 + u.n}`;
              return (
                <div key={u.n} className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{jobNum}</span>
                    <span className={`text-xs font-medium ${m.tone}`}>{m.label}</span>
                  </div>
                  <div className="font-medium">{u.client}</div>
                  {u.jobSite && <div className="text-xs text-muted-foreground">{u.jobSite}</div>}
                  <div className="flex justify-between text-xs"><span>Income</span><span>${fmtMoney(income)}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>${fmtMoney(costs)}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross profit</span><span>${fmtMoney(gp)}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${m.tone}`}>{pct.toFixed(1)}%</span></div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Pass ≥ 30%. Watch 20–29%. Fail &lt; 20%. Formula: gross_profit = income − job_costs; gross_margin_% = gross_profit / income.
          </p>
        </>
      )}
    </div>
  );
}

function DrillCurtain({
  drill,
  onOpenChange,
  methodRows,
  onLogActivity,
  quotes,
  selectedQuoteNumber,
  onSelectQuote,
  onQuoteActivity,
  onUpdateQuote,
  onOpenQuoteDetail,
  units,
  onOpenUnit,
}: {
  drill: DrillKey | null;
  onOpenChange: (open: boolean) => void;
  methodRows: typeof METHOD_BASELINE;
  onLogActivity: () => void;
  quotes: Quote[];
  selectedQuoteNumber: string | null;
  onSelectQuote: (n: string) => void;
  onQuoteActivity: () => void;
  onUpdateQuote: (n: string) => void;
  onOpenQuoteDetail: (n: string) => void;
  units: ProofUnit[];
  onOpenUnit: (n: number) => void;
}) {
  const meta = drill ? DRILL_META[drill] : null;
  return (
    <Sheet open={!!drill} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[85vw] lg:w-[80vw] xl:w-[75vw] overflow-y-auto p-0"
      >
        <div className="p-6 space-y-4">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>{meta?.title}</SheetTitle>
                <SheetDescription>{meta?.subtitle}</SheetDescription>
              </div>
              {drill === "leads" && (
                <Button size="sm" onClick={onLogActivity} className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" />
                  Log Activity
                </Button>
              )}
              {drill === "conversions" && (
                <Button size="sm" onClick={onQuoteActivity} className="gap-1.5 shrink-0">
                  Quote Activity
                </Button>
              )}
            </div>
          </SheetHeader>
          {drill && (
            <DrillBody
              kind={drill}
              methodRows={methodRows}
              quotes={quotes}
              selectedQuoteNumber={selectedQuoteNumber}
              onSelectQuote={onSelectQuote}
              onUpdateQuote={onUpdateQuote}
              onOpenQuoteDetail={onOpenQuoteDetail}
              units={units}
              onOpenUnit={onOpenUnit}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


function QuoteActivityDialog({
  quote,
  open,
  onOpenChange,
  onSave,
}: {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (q: Quote, newStatus: QuoteStatus, reason: string) => void;
}) {
  const [status, setStatus] = useState<QuoteStatus>("Sent");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open && quote) {
      setStatus(quote.status);
      setReason(quote.reason || "");
    }
  }, [open, quote]);

  const canSave =
    !!quote && ((status !== "Rejected" && status !== "Declined") || !!reason);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quote Activity</DialogTitle>
          <DialogDescription>
            Update the status of the selected quote. Accepting creates one job in the Simple Job Cost Ledger.
          </DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="space-y-2 text-sm rounded-md border p-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Quote #</span><span className="font-mono">{quote.number}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Client</span><span className="font-medium text-right">{quote.client}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Job Location</span><span className="text-right">{quote.site || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quote Amount</span><span>${fmtMoney(quote.value)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current Status</span><span>{quote.status}</span></div>
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-status">New Status <span className="text-destructive">*</span></Label>
            <select
              id="qa-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuoteStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
              <option value="Expired">Expired</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          {(status === "Rejected" || status === "Declined") && (
            <div className="space-y-1.5">
              <Label htmlFor="qa-reason">Reason <span className="text-destructive">*</span></Label>
              <select
                id="qa-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {status === "Accepted" && (
            <p className="text-xs text-muted-foreground">
              Accepting creates a new job with the next sequential Job # in the Simple Job Cost Ledger and removes this quote from the active board.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => quote && onSave(quote, status, reason)} disabled={!canSave}>
            Save Quote Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogActivityDialog({
  open,
  onOpenChange,
  onSave,
  nextQuoteNumberStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (a: LeadActivity, newQuotes: Quote[]) => void;
  nextQuoteNumberStart: number;
}) {
  const [date, setDate] = useState("");
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [attempts, setAttempts] = useState<string>("");
  const [contacts, setContacts] = useState<string>("");
  const [quotes, setQuotes] = useState<string>("");
  const [notes, setNotes] = useState("");
  type QRow = {
    client: string;
    site: string;
    amount: string;
    followUp: string;
    status: "Sent";
  };
  const blankRow = (): QRow => ({ client: "", site: "", amount: "", followUp: "", status: "Sent" });
  const [rows, setRows] = useState<QRow[]>([]);

  useEffect(() => {
    if (open) {
      setDate(""); setMethod(METHOD_OPTIONS[0]);
      setAttempts(""); setContacts(""); setQuotes(""); setNotes("");
      setRows([]);
    }
  }, [open]);

  const qGen = Math.max(0, parseInt(quotes || "0", 10) || 0);

  // Keep rows count in sync with Quotes Generated input
  useEffect(() => {
    setRows((prev) => {
      if (qGen === prev.length) return prev;
      if (qGen > prev.length) {
        return [...prev, ...Array.from({ length: qGen - prev.length }, blankRow)];
      }
      return prev.slice(0, qGen);
    });
  }, [qGen]);

  const rowComplete = (r: QRow) => {
    const amt = Number(r.amount);
    if (!r.client.trim()) return false;
    if (!r.site.trim()) return false;
    if (isNaN(amt) || amt <= 0) return false;
    if (!r.followUp) return false;
    return true;
  };
  const completeCount = rows.filter(rowComplete).length;
  const countOk = completeCount === qGen;
  const canSave = !!date && !!method && countOk;

  const save = () => {
    const activityId = `act-${Date.now()}`;
    const a: LeadActivity = {
      id: activityId,
      activity_date: date,
      method,
      attempts: Number(attempts) || 0,
      contacts_made: Number(contacts) || 0,
      quotes_generated: qGen,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    };
    const newQuotes: Quote[] = rows.map((r, i) => ({
      number: `Q-${nextQuoteNumberStart + i}`,
      client: r.client.trim(),
      site: r.site.trim(),
      value: Number(r.amount),
      status: r.status as QuoteStatus,
      quoteDate: date,
      followUp: r.followUp,
      reason: "",
      sourceActivityId: activityId,
      sourceActivityDate: date,
      method,
      createdAt: new Date().toISOString(),
    }));
    onSave(a, newQuotes);
  };

  const updateRow = (i: number, patch: Partial<QRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>
            Record a dated lead-generation activity. Aggregates into Lead Method Performance.
            When Quotes Generated is greater than zero, enter matching quote details below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="la-date">Activity Date <span className="text-destructive">*</span></Label>
            <Input id="la-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              {date ? `Entered as ${isoToAU(date)}` : "dd/mm/yyyy (e.g. 28/05/2026)"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-method">Method</Label>
            <select
              id="la-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="la-att">Attempts</Label>
              <Input id="la-att" type="number" min={0} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-con">Contacts Made</Label>
              <Input id="la-con" type="number" min={0} value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-qt">Quotes Generated</Label>
              <Input id="la-qt" type="number" min={0} value={quotes} onChange={(e) => setQuotes(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                How many actual quotes did you issue from this activity session?
              </p>
              <p className="text-[11px] text-muted-foreground">
                If greater than zero, you must enter one quote record for each quote before saving.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-notes">Notes</Label>
            <Input id="la-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Best response 8–10am" />
          </div>

          {qGen > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <div className="text-sm font-semibold">Quote Details Required</div>
                <p className="text-xs text-muted-foreground">
                  You entered {qGen} quote{qGen === 1 ? "" : "s"} generated. Enter {qGen} quote record{qGen === 1 ? "" : "s"} before saving this activity.
                </p>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">Quote {i + 1} of {qGen}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Client <span className="text-destructive">*</span></Label>
                      <Input value={r.client} onChange={(e) => updateRow(i, { client: e.target.value })} placeholder="e.g. M. Patel" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Job Location <span className="text-destructive">*</span></Label>
                      <Input value={r.site} onChange={(e) => updateRow(i, { site: e.target.value })} placeholder="e.g. Unit 4, Buderim" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quote Amount <span className="text-destructive">*</span></Label>
                      <Input type="number" min={0} step="0.01" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Follow-up Date <span className="text-destructive">*</span>
                      </Label>
                      <Input type="date" value={r.followUp} onChange={(e) => updateRow(i, { followUp: e.target.value })} />
                      <p className="text-[11px] text-muted-foreground">
                        {r.followUp ? isoToAU(r.followUp) : "dd/mm/yyyy"}
                      </p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Initial Status</Label>
                      <p className="text-xs text-muted-foreground">
                        Quotes created from Log Activity are saved as <span className="font-medium text-foreground">Sent</span>.
                        Update status later from the Quote Conversion Board.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {!countOk && (
                <p className="text-xs text-destructive">
                  Quotes Generated must match the number of completed quote records. ({completeCount} of {qGen} complete)
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save Activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDetailDialog({
  quote,
  open,
  onOpenChange,
  onSave,
}: {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (patch: Partial<Quote>) => void;
}) {
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [amount, setAmount] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && quote) {
      setClient(quote.client);
      setSite(quote.site || "");
      setAmount(String(quote.value));
      setFollowUp(quote.followUp || "");
      setReason(quote.reason || "");
      setNotes(quote.notes || "");
    }
  }, [open, quote]);

  if (!quote) return null;
  const isConverted = !!quote.converted;
  // Converted quotes can still amend the flow-through fields (client, site, amount).
  // Fully read-only is no longer the default.
  const readOnly = false;
  const isSent = quote.status === "Sent" && !isConverted;
  const isRejected = quote.status === "Rejected" && !isConverted;
  // Fields editable for amendment: Sent OR Converted (flow-through to job)
  const canEditFlowThrough = isSent || isConverted;
  const hadNotes = !!quote.notes;

  const handleSave = () => {
    const patch: Partial<Quote> = {};
    if (canEditFlowThrough) {
      const v = Number(amount);
      patch.client = client.trim() || quote.client;
      patch.site = site.trim();
      patch.value = isNaN(v) ? quote.value : v;
    }
    if (isSent) {
      patch.followUp = followUp;
    }
    if (isRejected) {
      patch.reason = reason;
      if (hadNotes) patch.notes = notes;
    }
    onSave(patch);
  };

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote Detail</DialogTitle>
          <DialogDescription>
            {isConverted
              ? "This quote has been converted into a job. Amendments to client, location, or quote amount will update the linked job and ledger."
              : isSent
                ? "Limited amendments available while quote is Sent. Status changes happen in Quote Activity."
                : "Status changes happen in Quote Activity."}
          </DialogDescription>
        </DialogHeader>

        {isConverted && (
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">This quote has already been converted into a job.</div>
            <div>Changing client, location, or quote amount will update the linked job and ledger.</div>
          </div>
        )}

        <div className="space-y-2 rounded-md border p-3">
          {row("Quote #", <span className="font-mono">{quote.number}</span>)}
          {row("Quote Date", quote.quoteDate ? isoToAU(quote.quoteDate) : "—")}
          {row("Source Activity Date", quote.sourceActivityDate ? isoToAU(quote.sourceActivityDate) : (quote.quoteDate ? isoToAU(quote.quoteDate) : "—"))}
          {row("Lead Method", quote.method || "—")}
          {row("Current Status", quote.status)}
          {quote.converted && row("Converted Job #", <span className="font-mono">{quote.convertedJobNumber || "—"}</span>)}
          {row("Created At", quote.createdAt ? isoToAU(quote.createdAt.slice(0, 10)) : "—")}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Job Location</Label>
            <Input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quote Amount</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up Date</Label>
            <Input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              disabled={!isSent}
            />
            <p className="text-[11px] text-muted-foreground">
              {followUp ? isoToAU(followUp) : "dd/mm/yyyy"}
            </p>
          </div>
          {(quote.status === "Rejected" || isRejected) && (
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!isRejected}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {hadNotes && (
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isRejected}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {(canEditFlowThrough || isRejected) && (
            <Button onClick={handleSave}>Save Changes</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Stage1Dashboard() {
  const bd = useBusinessDetails();
  const [bdOpen, setBdOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [units, setUnits] = useState<ProofUnit[]>(SEED_UNITS);
  const [selectedN, setSelectedN] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportN, setReportN] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [logActOpen, setLogActOpen] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>(SEED_QUOTES);
  const [selectedQuoteNumber, setSelectedQuoteNumber] = useState<string | null>(null);
  const [quoteActivityOpen, setQuoteActivityOpen] = useState(false);
  const [quoteActivityError, setQuoteActivityError] = useState<string | null>(null);
  const [quoteDetailNumber, setQuoteDetailNumber] = useState<string | null>(null);
  const [quoteDetailOpen, setQuoteDetailOpen] = useState(false);

  // ---- Canonical Stage 1 snapshot (READ-ONLY, Supabase RPC by active run) ----
  // Hydrated via public.get_stage1_progress_snapshot_by_run(p_run_id). Supabase
  // resolves identity from the active Autopsy run and remains the source of
  // truth; used only as canonical gate-status display input and never written
  // from this component.
  const [stage1Snapshot, setStage1Snapshot] = useState<Stage1Snapshot | null>(null);
  const [stage1SnapshotLoaded, setStage1SnapshotLoaded] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // ---- Canonical Stage 1 evidence requirements (READ-ONLY, Supabase RPC) ----
  // Hydrated via public.get_stage1_evidence_requirements_snapshot(p_stage_progress_id).
  // Supabase owns the requirement templates + instantiated evidence rows; this
  // component only displays them and never creates/verifies evidence.
  const [stage1Requirements, setStage1Requirements] = useState<Stage1Requirement[]>([]);
  const [stage1RequirementsLoaded, setStage1RequirementsLoaded] = useState(false);
  // Submit-only evidence state. Supabase owns evidence/verification state; the
  // frontend only *requests* a submit and never sets verified / valid / gate.
  const [stage1SubmittingId, setStage1SubmittingId] = useState<string | null>(null);
  const [stage1SubmitError, setStage1SubmitError] = useState<string | null>(null);
  const [stage1SubmitNotes, setStage1SubmitNotes] = useState<Record<string, string>>({});

  // Debug/admin-only verification state. Supabase owns verification; this tracks
  // pending RPC calls and any diagnostic error messages.
  const [stage1VerifyingId, setStage1VerifyingId] = useState<string | null>(null);
  const [stage1VerifyError, setStage1VerifyError] = useState<string | null>(null);

  // ---- Canonical Stage 1 completion evaluation (read-only, Supabase-owned) ----
  // Hydrated via public.evaluate_stage1_completion(p_stage_progress_id).
  // Supabase owns the evaluator; this component only displays the result.
  const [stage1Evaluation, setStage1Evaluation] = useState<Stage1Evaluation | null>(null);
  const [stage1EvaluationLoaded, setStage1EvaluationLoaded] = useState(false);

  // ---- Debug/admin-only gate decision (Supabase-owned) ----
  // Tracks the result of public.apply_stage1_gate_decision and any diagnostic error.
  const [stage1GateDecision, setStage1GateDecision] = useState<Stage1GateDecision | null>(null);
  const [stage1GateDecisionLoading, setStage1GateDecisionLoading] = useState(false);
  const [stage1GateDecisionError, setStage1GateDecisionError] = useState<string | null>(null);

  // ---- Canonical Stage 1 commitments (read-only, Supabase-owned) ----
  // Hydrated via public.get_stage1_commitments_snapshot(p_stage_progress_id).
  // Supabase owns commitment state; this component only displays rows.
  const [stage1Commitments, setStage1Commitments] = useState<Stage1Commitment[]>([]);
  const [stage1CommitmentsLoaded, setStage1CommitmentsLoaded] = useState(false);

  // Read-only hydration through the canonical RPC, keyed by the active Autopsy
  // run id (the only identity the frontend legitimately owns). Guarded +
  // isolated so it never affects the existing quotes/jobs board behaviour.
  useEffect(() => {
    let active = true;
    (async () => {
      // The frontend has no Supabase Auth / user_id. The only identity it owns
      // is the active Autopsy run id; Supabase resolves the operator from it.
      // Never use tester_email, user_id, or a hard-coded test identifier here.
      let runId: string | null = null;
      try {
        runId =
          getActiveRunId() ||
          localStorage.getItem("autopsy_current_run_id");
      } catch {
        runId = null;
      }
      if (active) setActiveRunId(runId);
      if (!runId) {
        if (active) setStage1SnapshotLoaded(true);
        return; // no active run → no RPC call, preserve computed behaviour
      }
      try {
        const { data, error } = await supabase.rpc(
          "get_stage1_progress_snapshot_by_run",
          { p_run_id: runId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_snapshot] RPC by_run failed:", error.message);
          return; // preserve existing computed dashboard behaviour
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setStage1Snapshot(row as Stage1Snapshot);
      } catch (err) {
        console.warn("[stage1_snapshot] RPC by_run threw:", err);
      } finally {
        if (active) setStage1SnapshotLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Debug/admin-only Stage 1 activation. Supabase owns ALL activation logic;
  // this only *requests* activation by the active Autopsy run id and stores the
  // returned canonical snapshot. No client-side eligibility, no direct writes.
  const [stage1Activating, setStage1Activating] = useState(false);
  const [stage1ActivateMsg, setStage1ActivateMsg] = useState<string | null>(null);

  // Read-only hydration of canonical Stage 1 evidence requirements, keyed by the
  // resolved stage_progress_id from the snapshot RPC. Only fires once a
  // stage_progress_id exists; never reads stage_gate_evidence directly and never
  // computes requirement status client-side.
  const stageProgressId = stage1Snapshot?.stage_progress_id ?? null;

  // Reusable read-only fetch for canonical Stage 1 requirements. Used by the
  // hydration effect and re-used after a submit to refresh displayed status.
  const fetchStage1Requirements = async (progressId: string) => {
    const { data, error } = await supabase.rpc(
      "get_stage1_evidence_requirements_snapshot",
      { p_stage_progress_id: progressId },
    );
    if (error) throw error;
    return (Array.isArray(data) ? data : data ? [data] : []) as Stage1Requirement[];
  };

  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1Requirements([]);
      setStage1RequirementsLoaded(false);
      return; // no stage_progress_id → do not call the requirements RPC
    }
    (async () => {
      try {
        const rows = await fetchStage1Requirements(stageProgressId);
        if (!active) return;
        setStage1Requirements(rows);
      } catch (err) {
        console.warn("[stage1_requirements] RPC threw:", err);
      } finally {
        if (active) setStage1RequirementsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Read-only hydration of canonical Stage 1 completion evaluation. Only fires
  // when stage_progress_id exists; never mutates stage_progress or advances gates.
  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1Evaluation(null);
      setStage1EvaluationLoaded(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "evaluate_stage1_completion",
          { p_stage_progress_id: stageProgressId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_evaluation] RPC failed:", error.message);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setStage1Evaluation(row as Stage1Evaluation);
      } catch (err) {
        console.warn("[stage1_evaluation] RPC threw:", err);
      } finally {
        if (active) setStage1EvaluationLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Submit-only evidence action. Calls public.submit_stage1_evidence which moves
  // one requirement to evidence_status='submitted' while keeping verified=false
  // and verified_at=null. Supabase owns evidence/verification/gate state; this
  // never sets verified/valid, never writes stage_gate_evidence directly, and
  // never creates commitments or operator insights. After a successful submit it
  // re-fetches the canonical requirements snapshot to refresh displayed status.
  const submitStage1Evidence = async (req: Stage1Requirement) => {
    const evidenceId = req.stage_gate_evidence_id;
    if (!evidenceId || !stageProgressId) return;
    setStage1SubmittingId(evidenceId);
    setStage1SubmitError(null);
    const note = (stage1SubmitNotes[evidenceId] ?? "").trim();
    try {
      const { error } = await supabase.rpc("submit_stage1_evidence", {
        p_stage_gate_evidence_id: evidenceId,
        // No file-upload architecture exists yet; submit metadata-only evidence.
        p_related_table: null,
        p_related_record_id: null,
        p_evidence_url: null,
        p_evidence_value: {
          source: "stage1_dashboard",
          requirement_code: req.requirement_code,
          ...(note ? { user_note: note } : {}),
        },
      });
      if (error) {
        console.warn("[stage1_submit] RPC failed:", error.message);
        setStage1SubmitError(`Submit failed: ${error.message}`);
        return; // preserve current UI state
      }
      // Re-fetch canonical status; never infer 'submitted' client-side.
      const rows = await fetchStage1Requirements(stageProgressId);
      setStage1Requirements(rows);
    } catch (err) {
      console.warn("[stage1_submit] RPC threw:", err);
      setStage1SubmitError("Submit threw an unexpected error.");
    } finally {
      setStage1SubmittingId(null);
    }
  };

  // Debug/admin-only verification action. Calls public.verify_stage1_evidence which
  // marks one Stage 1 evidence row valid or invalid. Supabase owns verification
  // state; this never writes stage_gate_evidence directly and never advances
  // stage gates or creates commitments/operator insights.
  const verifyStage1Evidence = async (
    req: Stage1Requirement,
    verified: boolean,
  ) => {
    const evidenceId = req.stage_gate_evidence_id;
    if (!evidenceId || !stageProgressId) return;
    setStage1VerifyingId(evidenceId);
    setStage1VerifyError(null);
    try {
      const { error } = await supabase.rpc("verify_stage1_evidence", {
        p_stage_gate_evidence_id: evidenceId,
        p_verified: verified,
        p_verification_notes: verified
          ? "Debug/admin verification from Stage 1 dashboard."
          : "Debug/admin rejection from Stage 1 dashboard.",
      });
      if (error) {
        console.warn("[stage1_verify] RPC failed:", error.message);
        setStage1VerifyError(`Verification failed: ${error.message}`);
        return;
      }
      const rows = await fetchStage1Requirements(stageProgressId);
      setStage1Requirements(rows);
    } catch (err) {
      console.warn("[stage1_verify] RPC threw:", err);
      setStage1VerifyError("Verification threw an unexpected error.");
    } finally {
      setStage1VerifyingId(null);
    }
  };

  // Debug/admin-only gate decision action. Calls public.apply_stage1_gate_decision
  // which evaluates completion server-side, writes a stage_gate_decisions audit row,
  // and only updates stage_progress to passed if all required evidence is valid.
  // Supabase owns evaluation, decision recording, and progression state.
  const applyStage1GateDecision = async () => {
    if (!stageProgressId) {
      setStage1GateDecisionError("No stage_progress_id available.");
      return;
    }
    setStage1GateDecisionLoading(true);
    setStage1GateDecisionError(null);
    setStage1GateDecision(null);
    try {
      const { data, error } = await supabase.rpc("apply_stage1_gate_decision", {
        p_stage_progress_id: stageProgressId,
      });
      if (error) {
        console.warn("[stage1_gate_decision] RPC failed:", error.message);
        setStage1GateDecisionError(`Gate decision failed: ${error.message}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStage1GateDecision(row as Stage1GateDecision);
      }
      // Re-fetch canonical snapshot, requirements, and evaluation
      if (activeRunId) {
        const { data: snapData, error: snapErr } = await supabase.rpc(
          "get_stage1_progress_snapshot_by_run",
          { p_run_id: activeRunId },
        );
        if (!snapErr) {
          const snapRow = Array.isArray(snapData) ? snapData[0] : snapData;
          if (snapRow) setStage1Snapshot(snapRow as Stage1Snapshot);
        }
      }
      if (stageProgressId) {
        const reqRows = await fetchStage1Requirements(stageProgressId);
        setStage1Requirements(reqRows);
        const { data: evalData, error: evalErr } = await supabase.rpc(
          "evaluate_stage1_completion",
          { p_stage_progress_id: stageProgressId },
        );
        if (!evalErr) {
          const evalRow = Array.isArray(evalData) ? evalData[0] : evalData;
          if (evalRow) setStage1Evaluation(evalRow as Stage1Evaluation);
        }
      }
    } catch (err) {
      console.warn("[stage1_gate_decision] RPC threw:", err);
      setStage1GateDecisionError("Gate decision threw an unexpected error.");
    } finally {
      setStage1GateDecisionLoading(false);
    }
  };

  const activateStage1 = async () => {
    if (!activeRunId) {
      setStage1ActivateMsg("No active Autopsy run id available.");
      return;
    }
    setStage1Activating(true);
    setStage1ActivateMsg(null);
    try {
      const { data, error } = await supabase.rpc(
        "activate_stage1_from_autopsy_run",
        { p_run_id: activeRunId },
      );
      if (error) {
        console.warn("[stage1_activate] RPC failed:", error.message);
        setStage1ActivateMsg(`Activation failed: ${error.message}`);
        return; // preserve existing dashboard behaviour
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStage1Snapshot(row as Stage1Snapshot);
        setStage1ActivateMsg(
          `Activated · gate: ${(row as Stage1Snapshot).current_gate_status ?? "—"}`,
        );
      } else {
        setStage1ActivateMsg("Activation returned no snapshot.");
      }
    } catch (err) {
      console.warn("[stage1_activate] RPC threw:", err);
      setStage1ActivateMsg("Activation threw an unexpected error.");
    } finally {
      setStage1Activating(false);
    }
  };

  // Load the persisted Core quote board + job ledger so Stage 1 survives refresh.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { quotes: dbQuotes, jobs: dbJobs } = await loadStage1Board();
        if (!active) return;
        if (dbQuotes.length) {
          setQuotes(dbQuotes.map((q) => ({ ...q, sourceActivityDate: q.quoteDate })));
        }
        if (dbJobs.length) {
          setUnits(
            dbJobs.map((j, i) => ({
              n: i + 1,
              jobNumber: j.jobNumber,
              client: j.client,
              jobSite: j.site || undefined,
              proofType: "Completed Job",
              status: "Scheduled",
              gm: 0,
              evidence: false,
              quoteValue: j.value,
              projectedRevenue: j.value,
              sourceQuote: j.sourceQuote,
              jobId: j.jobId,
              accountId: j.accountId,
              siteId: j.siteId,
              dbQuoteId: j.dbQuoteId,
              dbQuoteNumber: j.dbQuoteNumber,
            })),
          );
        }
      } catch {
        /* board stays empty; nothing persisted yet */
      }
    })();
    return () => { active = false; };
  }, []);

  const methodRows = useMemo(() => {
    const methods = new Set<string>();
    METHOD_BASELINE.forEach((b) => methods.add(b.method));
    activities.forEach((a) => a.method && methods.add(a.method));
    quotes.forEach((q) => q.method && methods.add(q.method));
    return Array.from(methods).map((method) => {
      const baseline = METHOD_BASELINE.find((b) => b.method === method);
      const acts = activities.filter((a) => a.method === method);
      const qs = quotes.filter((q) => q.method === method);
      const jobsCount = units.filter((u) => {
        const src = quotes.find((q) => q.number === u.sourceQuote);
        return src?.method === method;
      }).length;
      const attempts = (baseline?.attempts ?? 0) + acts.reduce((s, a) => s + (a.attempts || 0), 0);
      const contacts = (baseline?.contacts ?? 0) + acts.reduce((s, a) => s + (a.contacts_made || 0), 0);
      const quotesSum = (baseline?.quotes ?? 0) + acts.reduce((s, a) => s + (a.quotes_generated || 0), 0);
      const leads = (baseline?.leads ?? 0) + acts.length;
      const noteParts: string[] = [];
      if (baseline?.notes) noteParts.push(baseline.notes);
      if (acts.length) noteParts.push(`${acts.length} logged activit${acts.length === 1 ? "y" : "ies"}`);
      return {
        method,
        attempts,
        contacts,
        leads,
        quotes: quotesSum,
        jobs: (baseline?.jobs ?? 0) + jobsCount,
        notes: noteParts.join(" · "),
      };
    });
  }, [activities, quotes, units]);

  const openReport = (n: number) => {
    setReportN(n);
    setReportOpen(true);
  };
  const reportUnit = units.find((u) => u.n === reportN) ?? null;

  const scorecard = useMemo(() => computeScorecard(units), [units]);
  const selectedUnit = units.find((u) => u.n === selectedN) ?? null;

  const openUnit = (n: number) => {
    setSelectedN(n);
    setSheetOpen(true);
  };

  // Compute KPI aggregates from current state
  const totalLeads = methodRows.reduce((s, r) => s + r.leads, 0);
  const quotesSent = quotes.length;
  const quotesAccepted = quotes.filter((q) => q.status === "Accepted").length;
  const quoteConvPct = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  // Jobs in the ledger are only those created from accepted, converted quotes.
  const activeJobs = units.filter((u) => u.status !== "Paid" && u.status !== "Voided").length;
  const completedJobs = units.filter((u) => u.status === "Paid").length;
  const totalIncome = units.reduce((s, u) => s + (u.quoteValue ?? 0), 0);
  const totalCosts = units.reduce(
    (s, u) =>
      s +
      (u.costMaterials ?? 0) +
      (u.costLabour ?? 0) +
      (u.costSubcontractors ?? 0) +
      (u.costOther ?? 0),
    0,
  );
  const grossProfit = totalIncome - totalCosts;
  const gmPct = totalIncome ? Math.round((grossProfit / totalIncome) * 100) : 0;
  const gmStatus = marginStatus(gmPct);

  const nextQuoteNumberStart = useMemo(() => {
    const nums = quotes
      .map((q) => parseInt(q.number.replace(/^Q-/, ""), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return max + 1;
  }, [quotes]);

  const handleAcceptAndConvert = async (q: Quote) => {
    const nextN = (units.reduce((m, u) => Math.max(m, u.n), 0) || 0) + 1;
    // Convert the EXISTING accepted quote (lineage preserved) — no duplicate chain.
    let jobNumber = `J-${1000 + nextN}`;
    let jobId: string | undefined;
    if (q.dbId && q.accountId && q.siteId) {
      const res = await convertQuoteToJob({ quoteId: q.dbId, accountId: q.accountId, siteId: q.siteId });
      if (res.ok) {
        jobId = res.jobId;
        if (res.jobNumber) jobNumber = res.jobNumber;
        toast({ title: "Job created", description: `${q.client} — converted from ${q.number}.` });
      } else {
        toast({ title: "Conversion failed", description: res.error });
        return;
      }
    } else {
      toast({
        title: "Cannot persist — backend required",
        description: "This quote has no saved database id. Re-create it from Log Activity so it persists.",
      });
      return;
    }

    const unit: ProofUnit = {
      n: nextN,
      jobNumber,
      client: q.client,
      jobSite: q.site || undefined,
      proofType: "Completed Job",
      status: "Scheduled",
      gm: 0,
      evidence: false,
      isNewClient: true,
      quoteValue: q.value,
      projectedRevenue: q.value,
      sourceQuote: q.number,
      jobId,
      accountId: q.accountId,
      siteId: q.siteId,
      dbQuoteId: q.dbId,
      dbQuoteNumber: q.number,
    };
    setUnits((prev) => [...prev, unit]);
    setQuotes((prev) =>
      prev.map((p) =>
        p.number === q.number
          ? { ...p, status: "Accepted", converted: true, convertedToN: nextN, convertedJobNumber: jobNumber, convertedAt: new Date().toISOString() }
          : p,
      ),
    );
  };

  const handleQuoteActivitySave = async (q: Quote, newStatus: QuoteStatus, reason: string) => {
    if (q.converted) return;
    if (newStatus === "Accepted") {
      await handleAcceptAndConvert(q);
    } else {
      if (q.dbId) {
        const res = await setQuoteOutcome(q.dbId, newStatus, reason);
        if (!res.ok) {
          toast({ title: "Could not save outcome", description: res.error });
          return;
        }
      } else {
        toast({ title: "Cannot persist — backend required", description: "Quote has no saved database id." });
      }
      setQuotes((prev) =>
        prev.map((p) =>
          p.number === q.number
            ? { ...p, status: newStatus, reason: (newStatus === "Rejected" || newStatus === "Declined") ? reason : "" }
            : p,
        ),
      );
    }
    setQuoteActivityOpen(false);
    setSelectedQuoteNumber(null);
  };

  const openQuoteActivity = () => {
    if (!selectedQuoteNumber) {
      setQuoteActivityError("Select a quote first.");
      window.alert("Select a quote first.");
      return;
    }
    setQuoteActivityError(null);
    setQuoteActivityOpen(true);
  };

  // Row-level Update: target that exact row, no prior selection required.
  const handleUpdateQuote = (n: string) => {
    setSelectedQuoteNumber(n);
    setQuoteActivityError(null);
    setQuoteActivityOpen(true);
  };

  const handleOpenQuoteDetail = (n: string) => {
    setQuoteDetailNumber(n);
    setQuoteDetailOpen(true);
  };

  const handleSaveQuoteDetail = (patch: Partial<Quote>) => {
    if (!quoteDetailNumber) return;
    const original = quotes.find((q) => q.number === quoteDetailNumber);
    setQuotes((prev) =>
      prev.map((p) => (p.number === quoteDetailNumber ? { ...p, ...patch } : p)),
    );
    // Flow-through to the linked job if this quote was already converted.
    if (original?.converted && original.convertedToN != null) {
      setUnits((prev) =>
        prev.map((u) => {
          if (u.n !== original.convertedToN) return u;
          const next = { ...u };
          if (patch.client !== undefined) next.client = patch.client;
          if (patch.site !== undefined) next.jobSite = patch.site || undefined;
          if (patch.value !== undefined) {
            next.quoteValue = patch.value;
            next.projectedRevenue = patch.value;
          }
          return next;
        }),
      );
    }
    setQuoteDetailOpen(false);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Stage 1 command centre</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">First 5 Jobs Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Is the candidate moving toward five real jobs with acceptable margin and valid proof?
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bd.loaded && !bd.complete && (
            <Button onClick={() => setBdOpen(true)} className="gap-2">
              <IdCard className="h-4 w-4" />
              Complete Business Details
            </Button>
          )}
          {bd.loaded && bd.complete && (
            <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50 gap-1.5 py-1.5 px-3">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Business Details Verified
            </Badge>
          )}
        </div>
      </header>

      {bd.loaded && bd.complete && (
        <p className="text-xs text-muted-foreground -mt-2">
          Business Details have been verified and may be updated if required. Business Details remain available through the Business Details menu.
        </p>
      )}

      {/* Diagnostics: canonical Stage 1 snapshot RPC hydration (debug-only, read-only) */}
      {isDebug() && stage1SnapshotLoaded && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
          <span className="uppercase tracking-wide mr-2">stage1_snapshot (rpc by_run)</span>
          active_run_id: {activeRunId ?? "—"}
          {" · "}identity_resolved: {stage1Snapshot?.resolved_user_id ? "yes" : "no"}
          {" · "}resolved_user_id present: {stage1Snapshot?.resolved_user_id ? "yes" : "no"}
          {" · "}stage_progress_found: {stage1Snapshot?.stage_progress_id ? "yes" : "no"}
          {" · "}gate: {stage1Snapshot?.current_gate_status ?? "—"}
          {" · "}verified_evidence: {stage1Snapshot?.verified_evidence_count ?? "—"}
          {" · "}met_commitments: {stage1Snapshot?.met_commitment_count ?? "—"}
          {" · "}insights: {stage1Snapshot?.latest_operator_insight_count ?? "—"}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={activateStage1}
              disabled={stage1Activating || !activeRunId}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage1Activating ? "Activating…" : "Activate Stage 1 (debug)"}
            </button>
            {!activeRunId && (
              <span className="text-amber-600">No active Autopsy run id available.</span>
            )}
            {stage1ActivateMsg && <span>{stage1ActivateMsg}</span>}
          </div>
          {stageProgressId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={applyStage1GateDecision}
                disabled={stage1GateDecisionLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage1GateDecisionLoading ? "Applying…" : "Apply Gate Decision (debug)"}
              </button>
              {stage1GateDecisionError && (
                <span className="text-amber-600">{stage1GateDecisionError}</span>
              )}
            </div>
          )}
          {stage1GateDecision && (
            <div className="mt-2 space-y-0.5">
              <div className="uppercase tracking-wide">gate_decision_result</div>
              <div>
                decision_id: {stage1GateDecision.decision_id ?? "—"}
                {" · "}decision_status: {stage1GateDecision.decision_status ?? "—"}
                {" · "}current_gate_status: {stage1GateDecision.current_gate_status ?? "—"}
                {" · "}is_complete: {stage1GateDecision.is_complete ? "yes" : "no"}
                {" · "}valid_count: {stage1GateDecision.valid_count ?? "—"}
                {" / "}total_required: {stage1GateDecision.total_required ?? "—"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Canonical Stage 1 evidence requirements (read-only, Supabase-owned) */}
      {stage1Snapshot?.stage_progress_id && stage1Requirements.length > 0 && (
        <Card className="-mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stage 1 Evidence Requirements</CardTitle>
            <CardDescription>
              Canonical requirements for First 5 Jobs, owned by the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Minimum standard</TableHead>
                    <TableHead>Submit evidence</TableHead>
                    {isDebug() && <TableHead>Debug Verify</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...stage1Requirements]
                    .sort(
                      (a, b) =>
                        (a.display_order ?? 0) - (b.display_order ?? 0),
                    )
                    .map((r) => {
                      const evidenceId = r.stage_gate_evidence_id ?? "";
                      const submitting = stage1SubmittingId === evidenceId;
                      const verifying = stage1VerifyingId === evidenceId;
                      const showDebugControls =
                        isDebug() &&
                        ((r.evidence_status ?? "").toLowerCase() === "submitted" ||
                          (r.evidence_status ?? "").toLowerCase() === "invalid");
                      return (
                        <TableRow key={evidenceId || r.requirement_code || Math.random()}>
                          <TableCell className="font-medium">
                            {r.evidence_label ?? r.requirement_code ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.verified ? "default" : "secondary"}>
                              {r.evidence_status ?? "missing"}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.verified ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.minimum_standard ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                value={stage1SubmitNotes[evidenceId] ?? ""}
                                onChange={(e) =>
                                  setStage1SubmitNotes((p) => ({
                                    ...p,
                                    [evidenceId]: e.target.value,
                                  }))
                                }
                                placeholder="Optional note"
                                className="h-8 w-40"
                                disabled={!evidenceId || submitting || verifying}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => submitStage1Evidence(r)}
                                disabled={!evidenceId || submitting || verifying}
                              >
                                {submitting && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                Submit
                              </Button>
                            </div>
                          </TableCell>
                          {isDebug() && (
                            <TableCell>
                              {showDebugControls ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => verifyStage1Evidence(r, true)}
                                    disabled={verifying}
                                  >
                                    {verifying && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    )}
                                    Mark Valid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => verifyStage1Evidence(r, false)}
                                    disabled={verifying}
                                  >
                                    Mark Invalid
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
            {stage1SubmitError && (
              <p className="mt-3 text-xs text-destructive">{stage1SubmitError}</p>
            )}
            {isDebug() && stage1VerifyError && (
              <p className="mt-3 text-xs text-destructive">{stage1VerifyError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Canonical Stage 1 completion evaluation (read-only, Supabase-owned) */}
      {stage1Evaluation && (
        <Card className="-mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stage 1 Completion Evaluation</CardTitle>
            <CardDescription>
              Canonical evaluator result, owned by the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Valid</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.valid_count ?? 0} / {stage1Evaluation.total_required ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Submitted</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.submitted_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Missing</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.missing_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Invalid</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.invalid_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Complete</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.is_complete ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Recommended Gate</div>
                <div className="mt-1 text-lg font-semibold">
                  {stage1Evaluation.recommended_gate_status ?? "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug-only: evaluator returned no row */}
      {isDebug() &&
        stage1EvaluationLoaded &&
        stageProgressId &&
        !stage1Evaluation && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
            Stage 1 evaluation returned no row for this progress id.
          </div>
        )}

      {/* Debug-only: requirements RPC returned zero rows */}
      {isDebug() &&
        stage1RequirementsLoaded &&
        stage1Snapshot?.stage_progress_id &&
        stage1Requirements.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
            No Stage 1 evidence requirements instantiated.
          </div>
        )}

      {/* ---- Top half: KPI cards ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Leads"
          icon={Users}
          primary={totalLeads}
          secondaries={[{ k: "Total leads", v: totalLeads }]}
          onClick={() => setDrill("leads")}
        />
        <KpiCard
          label="Conversions"
          icon={FileText}
          primary={`${quoteConvPct}%`}
          secondaries={[
            { k: "Quotes sent", v: quotesSent },
            { k: "Quotes accepted", v: quotesAccepted },
          ]}
          onClick={() => setDrill("conversions")}
        />
        <KpiCard
          label="Active Jobs"
          icon={Briefcase}
          primary={activeJobs}
          secondaries={[
            { k: "Active jobs", v: activeJobs },
            { k: "Completed jobs", v: completedJobs },
          ]}
          onClick={() => setDrill("jobs")}
        />
        <KpiCard
          label="Gross Margin"
          icon={TrendingUp}
          tone={gmStatus.tone}
          primary={`${gmPct}%`}
          secondaries={[
            { k: "Total income", v: `$${fmtMoney(totalIncome)}` },
            { k: "Total job costs", v: `$${fmtMoney(totalCosts)}` },
            { k: "Status", v: gmStatus.label },
          ]}
          onClick={() => setDrill("margin")}
        />
      </section>

      {/* ---- Bottom: full-width ledger ---- */}
      <section className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Simple Job Cost Ledger</CardTitle>
              <CardDescription className="text-xs">
                Jobs created by converting accepted quotes from the Quote Conversion Board. Click a row to open the Job / Contract Site Detail curtain.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Proof Type</TableHead>
                    <TableHead className="text-right">
                      <div className="leading-tight">Income</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">(as per quote)</div>
                    </TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Job Costs</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">GM %</TableHead>
                    <TableHead className="text-right">Detailed Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u) => {
                    const isSel = u.n === selectedN;
                    const income = u.quoteValue ?? 0;
                    const paid = u.paymentAmount ?? 0;
                    const outstanding = income - paid;
                    const costs =
                      (u.costMaterials ?? 0) +
                      (u.costLabour ?? 0) +
                      (u.costSubcontractors ?? 0) +
                      (u.costOther ?? 0);
                    const gp = income - costs;
                    const gmPct = income > 0 ? Math.round((gp / income) * 100) : u.gm;
                    const gmTone =
                      gmPct >= 30 ? "text-emerald-600" : gmPct >= 20 ? "text-amber-600" : "text-red-600";
                    return (
                      <TableRow
                        key={u.n}
                        className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                        onClick={() => openUnit(u.n)}
                      >
                        <TableCell className="font-mono text-xs">{u.jobNumber ?? `J-${1000 + u.n}`}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openUnit(u.n); }}
                            className="text-left hover:underline focus:outline-none"
                          >
                            <div className="font-medium leading-tight">{u.client}</div>
                            {u.jobSite ? (
                              <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                            ) : (
                              <div className="text-xs text-amber-600 leading-tight">Site not entered</div>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>{u.proofType}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {income > 0 ? `$${fmtMoney(income)}` : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${outstanding < 0 ? "text-red-600" : ""}`}>
                          {income > 0 ? fmtSignedMoney(outstanding) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {costs > 0 ? `$${fmtMoney(costs)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {income > 0 ? `$${fmtMoney(gp)}` : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${gmTone}`}>
                          {gmPct}%
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); openReport(u.n); }}
                          >
                            Detailed Report
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </section>

      <JobDetailSheet
        unit={selectedUnit}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={(u) => setUnits((prev) => prev.map((p) => (p.n === u.n ? u : p)))}
        onJumpToFinancials={() => { /* no-op on dashboard */ }}
        concentrationClient={scorecard.concentrationClient}
        onVoid={() => { /* no-op */ }}
        onArchive={() => { /* no-op */ }}
        onDelete={() => { /* no-op */ }}
        onOpenDetailedReport={(n) => openReport(n)}
      />
      <BusinessDetailsDialog open={bdOpen} onOpenChange={setBdOpen} hook={bd} />
      <DrillCurtain
        drill={drill}
        onOpenChange={(o) => { if (!o) { setDrill(null); setQuoteActivityError(null); } }}
        methodRows={methodRows}
        onLogActivity={() => setLogActOpen(true)}
        quotes={quotes}
        selectedQuoteNumber={selectedQuoteNumber}
        onSelectQuote={(n) => { setSelectedQuoteNumber(n); setQuoteActivityError(null); }}
        onQuoteActivity={openQuoteActivity}
        onUpdateQuote={handleUpdateQuote}
        onOpenQuoteDetail={handleOpenQuoteDetail}
        units={units}
        onOpenUnit={(n) => { setDrill(null); openUnit(n); }}
      />
      <QuoteActivityDialog
        quote={quotes.find((q) => q.number === selectedQuoteNumber) ?? null}
        open={quoteActivityOpen}
        onOpenChange={setQuoteActivityOpen}
        onSave={handleQuoteActivitySave}
      />
      <QuoteDetailDialog
        quote={quotes.find((q) => q.number === quoteDetailNumber) ?? null}
        open={quoteDetailOpen}
        onOpenChange={setQuoteDetailOpen}
        onSave={handleSaveQuoteDetail}
      />
      <LogActivityDialog
        open={logActOpen}
        onOpenChange={setLogActOpen}
        nextQuoteNumberStart={nextQuoteNumberStart}
        onSave={async (a, newQuotes) => {
          setActivities((prev) => [...prev, a]);
          setLogActOpen(false);
          for (const nq of newQuotes) {
            const res = await createQuote({
              client: nq.client,
              site: nq.site,
              value: nq.value,
              followUp: nq.followUp,
              quoteNotes: nq.notes,
            });
            if (res.ok && res.quote) {
              const saved = { ...res.quote, method: nq.method, sourceActivityId: nq.sourceActivityId, sourceActivityDate: a.activity_date };
              setQuotes((prev) => [saved, ...prev]);
            } else {
              toast({ title: "Quote not saved", description: res.error ?? "Backend write failed." });
            }
          }
        }}
      />
      <DetailedJobCostReport
        unit={reportUnit}
        allUnits={units}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}