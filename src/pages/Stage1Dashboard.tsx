import { useEffect, useMemo, useState } from "react";
import {
  SEED_UNITS,
  computeScorecard,
  JobDetailSheet,
  type ProofUnit,
} from "./Stage1";
import { supabase } from "@/lib/supabase";
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
  Lock,
  IdCard,
  Loader2,
  Plus,
} from "lucide-react";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
const METHOD_BASELINE = [
  { method: "Phone Outreach", attempts: 18, contacts: 7, leads: 5, quotes: 2, jobs: 1, notes: "Best mornings 8–10am" },
  { method: "Referral Request", attempts: 6, contacts: 4, leads: 4, quotes: 3, jobs: 2, notes: "Highest converting" },
  { method: "Local Flyer", attempts: 150, contacts: 3, leads: 2, quotes: 1, jobs: 0, notes: "Slow conversion" },
];
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

const QUOTE_STATUSES = ["Draft", "Sent", "Pending", "Accepted", "Rejected", "Expired"] as const;
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
  sourceActivityId?: string;
  method?: string;
};

// Seed: the five accepted quotes that produced the five ledger jobs,
// plus a handful of in-flight / rejected quotes for the conversion board.
const SEED_QUOTES: Quote[] = [
  { number: "Q-1001", client: "M. Patel",      site: "Unit 4, Buderim",                value: 1200, status: "Accepted", quoteDate: "2026-04-28", followUp: "", reason: "", converted: true, convertedToN: 1 },
  { number: "Q-1002", client: "K. Nguyen",     site: "12 Beach Rd, Mooloolaba",        value: 1850, status: "Accepted", quoteDate: "2026-05-01", followUp: "", reason: "", converted: true, convertedToN: 2 },
  { number: "Q-1003", client: "Sunrise Cafe",  site: "Main Street kitchen clean",      value: 2400, status: "Accepted", quoteDate: "2026-05-06", followUp: "", reason: "", converted: true, convertedToN: 3 },
  { number: "Q-1004", client: "QML",           site: "Maroochydore Service Centre",    value: 5000, status: "Accepted", quoteDate: "2026-05-18", followUp: "", reason: "", converted: true, convertedToN: 4 },
  { number: "Q-1005", client: "QML",           site: "Nambour Service Centre",         value: 6050, status: "Accepted", quoteDate: "2026-05-22", followUp: "", reason: "", converted: true, convertedToN: 5 },
  { number: "Q-1006", client: "Coastal Dental",site: "Mooloolaba reception fit-out",   value: 3200, status: "Sent",     quoteDate: "2026-05-20", followUp: "2026-05-28", reason: "" },
  { number: "Q-1007", client: "QML",           site: "Caloundra Service Centre",       value: 5800, status: "Pending",  quoteDate: "2026-05-22", followUp: "2026-05-29", reason: "" },
  { number: "Q-0998", client: "B. Adams",      site: "Caloundra residence",            value: 800,  status: "Rejected", quoteDate: "2026-04-12", followUp: "", reason: "Too expensive" },
];

const JOB_ROWS = [
  { job: "J-001", client: "M. Patel", site: "Unit 4, Buderim", status: "Paid", start: "2026-05-04", income: 1200, costs: 864, gm: 28, evidence: "Attached" },
  { job: "J-002", client: "K. Nguyen", site: "12 Beach Rd, Mooloolaba", status: "Paid", start: "2026-05-08", income: 1850, costs: 1443, gm: 22, evidence: "Attached" },
  { job: "J-003", client: "Sunrise Cafe", site: "Main Street kitchen clean", status: "Active", start: "2026-05-12", income: 2400, costs: 1872, gm: 22, evidence: "Missing" },
  { job: "J-004", client: "QML", site: "Maroochydore Service Centre", status: "Signed", start: "2026-05-26", income: 5000, costs: 3250, gm: 35, evidence: "Attached" },
  { job: "J-005", client: "QML", site: "Nambour Service Centre", status: "Mobilising", start: "2026-05-30", income: 6050, costs: 3932.5, gm: 35, evidence: "Missing" },
];

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
  onConvert,
}: {
  kind: DrillKey;
  methodRows: typeof METHOD_BASELINE;
  quotes: Quote[];
  onConvert: (q: Quote) => void;
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
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Rejection</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((r) => (
                  <TableRow key={r.number}>
                    <TableCell className="font-mono text-xs">{r.number}</TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight">{r.client}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{r.site}</div>
                    </TableCell>
                    <TableCell className="text-right">${fmtMoney(r.value)}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.followUp ? isoToAU(r.followUp) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "Accepted" ? (
                        r.converted ? (
                          <span className="text-xs text-muted-foreground">Already converted</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => onConvert(r)}>
                            Convert to Job
                          </Button>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {quotes.map((r) => (
              <div key={r.number} className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{r.number}</span>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <div className="font-medium">{r.client}</div>
                <div className="text-xs text-muted-foreground">{r.site}</div>
                <div className="flex justify-between text-xs">
                  <span>Value</span><span className="font-medium">${fmtMoney(r.value)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Follow-up</span><span>{r.followUp ? isoToAU(r.followUp) : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Rejection</span><span>{r.reason || "—"}</span>
                </div>
                {r.status === "Accepted" && (
                  <div className="pt-1">
                    {r.converted ? (
                      <span className="text-xs text-muted-foreground">Already converted</span>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => onConvert(r)}>
                        Convert to Job
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Allowed statuses: Draft, Sent, Pending, Accepted, Rejected, Expired. Allowed rejection reasons:
            Too expensive, No confidence, Poor fit, Slow response, Competitor chosen, Scope unclear, No budget, Other.
            Only accepted quotes can be converted to jobs.
          </p>
        </>
      )}

      {kind === "jobs" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {JOB_ROWS.map((r) => {
                  const m = marginStatus(r.gm);
                  return (
                    <TableRow key={r.job}>
                      <TableCell className="font-mono text-xs">{r.job}</TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{r.client}</div>
                        <div className="text-xs text-muted-foreground leading-tight">{r.site}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{r.start}</TableCell>
                      <TableCell className="text-right">${fmtMoney(r.income)}</TableCell>
                      <TableCell className="text-right">${fmtMoney(r.costs)}</TableCell>
                      <TableCell className={`text-right font-medium ${m.tone}`}>{r.gm}%</TableCell>
                      <TableCell>{r.evidence}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {JOB_ROWS.map((r) => {
              const m = marginStatus(r.gm);
              return (
                <div key={r.job} className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{r.job}</span>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                  <div className="font-medium">{r.client}</div>
                  <div className="text-xs text-muted-foreground">{r.site}</div>
                  <div className="flex justify-between text-xs"><span>Start</span><span>{r.start}</span></div>
                  <div className="flex justify-between text-xs"><span>Income</span><span>${fmtMoney(r.income)}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>${fmtMoney(r.costs)}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${m.tone}`}>{r.gm}%</span></div>
                  <div className="flex justify-between text-xs"><span>Evidence</span><span>{r.evidence}</span></div>
                </div>
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
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {JOB_ROWS.map((r) => {
                  const gp = r.income - r.costs;
                  const m = marginStatus(r.gm);
                  return (
                    <TableRow key={r.job}>
                      <TableCell>
                        <div className="font-medium leading-tight">{r.client}</div>
                        <div className="text-xs text-muted-foreground leading-tight">{r.site}</div>
                      </TableCell>
                      <TableCell className="text-right">${fmtMoney(r.income)}</TableCell>
                      <TableCell className="text-right">${fmtMoney(r.costs)}</TableCell>
                      <TableCell className="text-right">${fmtMoney(gp)}</TableCell>
                      <TableCell className={`text-right font-medium ${m.tone}`}>{r.gm}%</TableCell>
                      <TableCell className={m.tone}>{m.label}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {JOB_ROWS.map((r) => {
              const gp = r.income - r.costs;
              const m = marginStatus(r.gm);
              return (
                <div key={r.job} className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{r.job}</span>
                    <span className={`text-xs font-medium ${m.tone}`}>{m.label}</span>
                  </div>
                  <div className="flex justify-between text-xs"><span>Income</span><span>${fmtMoney(r.income)}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>${fmtMoney(r.costs)}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross profit</span><span>${fmtMoney(gp)}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${m.tone}`}>{r.gm}%</span></div>
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
  onConvert,
}: {
  drill: DrillKey | null;
  onOpenChange: (open: boolean) => void;
  methodRows: typeof METHOD_BASELINE;
  onLogActivity: () => void;
  quotes: Quote[];
  onConvert: (q: Quote) => void;
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
            </div>
          </SheetHeader>
          {drill && (
            <DrillBody
              kind={drill}
              methodRows={methodRows}
              quotes={quotes}
              onConvert={onConvert}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


function AddQuoteDialog({
  open,
  onOpenChange,
  onSave,
  nextNumber,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (q: Quote) => void;
  nextNumber: string;
}) {
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<string>("");
  const [followUp, setFollowUp] = useState<string>("");
  const [status, setStatus] = useState<QuoteStatus>("Draft");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open) {
      setClient(""); setSite(""); setAmount(""); setQuoteDate("");
      setFollowUp(""); setStatus("Draft"); setReason("");
    }
  }, [open]);

  const amt = Number(amount);
  const needsReason = status === "Rejected";
  const canSave =
    client.trim().length > 0 &&
    !isNaN(amt) && amt > 0 &&
    (!needsReason || reason.trim().length > 0);

  const save = () => {
    const q: Quote = {
      number: nextNumber,
      client: client.trim(),
      site: site.trim(),
      value: amt,
      status,
      quoteDate,
      followUp,
      reason: needsReason ? reason : "",
    };
    onSave(q);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Quote</DialogTitle>
          <DialogDescription>
            Create a quote record. Jobs are created later by converting an accepted quote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="aq-client">Client <span className="text-destructive">*</span></Label>
            <Input id="aq-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. M. Patel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aq-site">Job Location</Label>
            <Input id="aq-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Unit 4, Buderim" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aq-amt">Quote Amount (incl. GST) <span className="text-destructive">*</span></Label>
            <Input id="aq-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="aq-qd">Quote Date</Label>
              <Input id="aq-qd" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
              {quoteDate && <p className="text-[11px] text-muted-foreground">{isoToAU(quoteDate)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aq-fu">Follow-up Date</Label>
              <Input id="aq-fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              {followUp && <p className="text-[11px] text-muted-foreground">{isoToAU(followUp)}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aq-status">Status</Label>
            <select
              id="aq-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuoteStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="aq-reason">Rejection Reason <span className="text-destructive">*</span></Label>
              <select
                id="aq-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save Quote</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertQuoteDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
}: {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (q: Quote) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert this accepted quote into a job?</DialogTitle>
          <DialogDescription>
            A job shell will be created in the Simple Job Cost Ledger using this quote's details.
            You can then add invoices, costs and payment proof from the Job / Contract Site Detail curtain.
          </DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="space-y-2 text-sm rounded-md border p-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Quote #</span><span className="font-mono">{quote.number}</span></div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Client</span>
              <span className="text-right">
                <div className="font-medium">{quote.client}</div>
                <div className="text-xs text-muted-foreground">{quote.site}</div>
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quote Amount</span><span>${fmtMoney(quote.value)}</span></div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => quote && onConfirm(quote)} disabled={!quote}>Convert to Job</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogActivityDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (a: LeadActivity) => void;
}) {
  const [date, setDate] = useState("");
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [attempts, setAttempts] = useState<string>("");
  const [contacts, setContacts] = useState<string>("");
  const [quotes, setQuotes] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDate(""); setMethod(METHOD_OPTIONS[0]);
      setAttempts(""); setContacts(""); setQuotes(""); setNotes("");
    }
  }, [open]);

  const canSave = !!date && !!method;

  const save = () => {
    const a: LeadActivity = {
      id: `act-${Date.now()}`,
      activity_date: date,
      method,
      attempts: Number(attempts) || 0,
      contacts_made: Number(contacts) || 0,
      quotes_generated: Number(quotes) || 0,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    };
    onSave(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>
            Record a dated lead-generation activity. Aggregates into Lead Method Performance.
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
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-notes">Notes</Label>
            <Input id="la-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Best response 8–10am" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save Activity</Button>
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
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [convertQuote, setConvertQuote] = useState<Quote | null>(null);

  const methodRows = useMemo(() => {
    return METHOD_BASELINE.map((b) => {
      const acts = activities.filter((a) => a.method === b.method);
      const addAtt = acts.reduce((s, a) => s + (a.attempts || 0), 0);
      const addCon = acts.reduce((s, a) => s + (a.contacts_made || 0), 0);
      const addQt  = acts.reduce((s, a) => s + (a.quotes_generated || 0), 0);
      const extraNote = acts.length
        ? `${acts.length} logged activit${acts.length === 1 ? "y" : "ies"}`
        : "";
      return {
        ...b,
        attempts: b.attempts + addAtt,
        contacts: b.contacts + addCon,
        quotes: b.quotes + addQt,
        notes: extraNote ? `${b.notes} · ${extraNote}` : b.notes,
      };
    });
  }, [activities]);

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
  const quotesSent = quotes.filter((q) => q.status !== "Draft").length;
  const quotesAccepted = quotes.filter((q) => q.status === "Accepted").length;
  const quoteConvPct = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  // Jobs in the ledger are only those created from accepted, converted quotes.
  const activeJobs = units.filter((u) => u.status !== "Paid" && u.status !== "Voided").length;
  const completedJobs = units.filter((u) => u.status === "Paid").length;
  const totalIncome = JOB_ROWS.reduce((s, r) => s + r.income, 0);
  const totalCosts = JOB_ROWS.reduce((s, r) => s + r.costs, 0);
  const grossProfit = totalIncome - totalCosts;
  const gmPct = totalIncome ? Math.round((grossProfit / totalIncome) * 100) : 0;
  const gmStatus = marginStatus(gmPct);

  const nextQuoteNumber = useMemo(() => {
    const nums = quotes
      .map((q) => parseInt(q.number.replace(/^Q-/, ""), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return `Q-${max + 1}`;
  }, [quotes]);

  const handleConvert = (q: Quote) => {
    const nextN = (units.reduce((m, u) => Math.max(m, u.n), 0) || 0) + 1;
    const unit: ProofUnit = {
      n: nextN,
      client: q.client,
      jobSite: q.site || undefined,
      proofType: "Completed Job",
      status: "Not Started",
      gm: 0,
      evidence: false,
      isNewClient: true,
      quoteValue: q.value,
      projectedRevenue: q.value,
      sourceQuote: q.number,
    };
    setUnits((prev) => [...prev, unit]);
    setQuotes((prev) =>
      prev.map((p) => (p.number === q.number ? { ...p, converted: true, convertedToN: nextN } : p)),
    );
    setConvertQuote(null);
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
              <Lock className="h-3.5 w-3.5" />
              Business details locked
            </Badge>
          )}
        </div>
      </header>

      {bd.loaded && bd.complete && (
        <p className="text-xs text-muted-foreground -mt-2">
          Business details are locked. Contact support to request a change.
        </p>
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
          {scorecard.blockers.map((b) => (
            <div key={b} className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              <span className="font-semibold">Blocker: </span>{b}
            </div>
          ))}
          {scorecard.warnings.map((w) => (
            <div key={w} className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">Risk warning: </span>{w}
            </div>
          ))}
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
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Proof Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Job Costs</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">GM %</TableHead>
                    <TableHead className="text-right">Detailed Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u) => {
                    const isSel = u.n === selectedN;
                    const income = u.invoiceAmount ?? 0;
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
                        <TableCell className="font-medium">{u.n}</TableCell>
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
                        <TableCell>{u.status}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {income > 0 ? `$${fmtMoney(income)}` : "—"}
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
        onOpenChange={(o) => { if (!o) setDrill(null); }}
        methodRows={methodRows}
        onLogActivity={() => setLogActOpen(true)}
        quotes={quotes}
        onAddQuote={() => setAddQuoteOpen(true)}
        onConvert={(q) => setConvertQuote(q)}
      />
      <AddQuoteDialog
        open={addQuoteOpen}
        onOpenChange={setAddQuoteOpen}
        onSave={(q) => {
          setQuotes((prev) => [q, ...prev]);
          setAddQuoteOpen(false);
        }}
        nextNumber={nextQuoteNumber}
      />
      <ConvertQuoteDialog
        quote={convertQuote}
        open={!!convertQuote}
        onOpenChange={(o) => { if (!o) setConvertQuote(null); }}
        onConfirm={handleConvert}
      />
      <LogActivityDialog
        open={logActOpen}
        onOpenChange={setLogActOpen}
        onSave={(a) => {
          setActivities((prev) => [...prev, a]);
          setLogActOpen(false);
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