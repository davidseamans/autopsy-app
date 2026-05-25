import { useEffect, useState } from "react";
import Stage1 from "./Stage1";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
  IdCard,
  Loader2,
} from "lucide-react";

// ---------- Sample fixtures for the KPI drill-downs ----------
// These mirror the operating story used by the existing ledger.
const METHOD_ROWS = [
  { method: "Phone Outreach", attempts: 18, contacts: 7, leads: 5, quotes: 2, jobs: 1, notes: "Best mornings 8–10am" },
  { method: "Referral Request", attempts: 6, contacts: 4, leads: 4, quotes: 3, jobs: 2, notes: "Highest converting" },
  { method: "Local Flyer", attempts: 150, contacts: 3, leads: 2, quotes: 1, jobs: 0, notes: "Slow conversion" },
];

const QUOTE_ROWS = [
  { number: "Q-1001", client: "M. Patel", site: "Unit 4, Buderim", value: 1200, status: "Accepted", followUp: "", reason: "" },
  { number: "Q-1002", client: "K. Nguyen", site: "12 Beach Rd, Mooloolaba", value: 900, status: "Accepted", followUp: "", reason: "" },
  { number: "Q-1003", client: "Sunrise Cafe", site: "Main Street kitchen", value: 2400, status: "Sent", followUp: "2026-05-28", reason: "" },
  { number: "Q-1004", client: "QML", site: "Maroochydore", value: 6000, status: "Accepted", followUp: "", reason: "" },
  { number: "Q-1005", client: "QML", site: "Nambour", value: 6000, status: "Pending", followUp: "2026-05-29", reason: "" },
  { number: "Q-0998", client: "B. Adams", site: "Caloundra", value: 800, status: "Rejected", followUp: "", reason: "Too expensive" },
];

const JOB_ROWS = [
  { job: "J-001", client: "M. Patel", site: "Unit 4, Buderim", status: "Completed", start: "2026-05-04", income: 1200, costs: 864, gm: 28, evidence: "Attached" },
  { job: "J-002", client: "K. Nguyen", site: "12 Beach Rd", status: "Completed", start: "2026-05-08", income: 900, costs: 702, gm: 22, evidence: "Attached" },
  { job: "J-003", client: "Sunrise Cafe", site: "Main Street", status: "Active", start: "2026-05-12", income: 2400, costs: 1872, gm: 22, evidence: "Missing" },
  { job: "J-004", client: "QML", site: "Maroochydore", status: "Scheduled", start: "2026-05-26", income: 6000, costs: 3900, gm: 35, evidence: "Attached" },
  { job: "J-005", client: "QML", site: "Nambour", status: "Accepted", start: "2026-05-30", income: 6000, costs: 3900, gm: 35, evidence: "Missing" },
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
  industry: string;
  service_area: string;
  notes: string;
};
const EMPTY_BD: BDForm = {
  business_name: "",
  abn: "",
  trading_name: "",
  business_address: "",
  contact_name: "",
  phone: "",
  email: "",
  industry: "",
  service_area: "",
  notes: "",
};
const BD_REQUIRED: (keyof BDForm)[] = [
  "business_name", "abn", "business_address", "contact_name", "phone", "email", "industry", "service_area",
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
            industry: extras.industry ?? "",
            service_area: extras.service_area ?? "",
            notes: extras.notes ?? "",
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
        industry: next.industry,
        service_area: next.service_area,
        notes: next.notes,
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

  const F = ({ id, label, required, type = "text" }: { id: keyof BDForm; label: string; required?: boolean; type?: string }) => (
    <div className="space-y-1.5">
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
          <F id="business_name" label="Business name" required />
          <F id="abn" label="ABN" required />
          <F id="trading_name" label="Trading name (if different)" />
          <F id="business_address" label="Business address" required />
          <F id="contact_name" label="Contact name" required />
          <F id="phone" label="Contact phone" required />
          <F id="email" label="Contact email" required type="email" />
          <F id="industry" label="Industry" required />
          <div className="md:col-span-2">
            <F id="service_area" label="Service area" required />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
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

// ---------- Drill-down sheets ----------
type DrillKey = null | "leads" | "conversions" | "jobs" | "margin";

function DrillSheet({
  open,
  onClose,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  kind: DrillKey;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        {kind === "leads" && (
          <>
            <SheetHeader>
              <SheetTitle>Method Performance</SheetTitle>
              <SheetDescription>Where leads are coming from and what's converting.</SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
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
                {METHOD_ROWS.map((r) => (
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
          </>
        )}

        {kind === "conversions" && (
          <>
            <SheetHeader>
              <SheetTitle>Quote Status</SheetTitle>
              <SheetDescription>Quote pipeline and rejection reasons.</SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Rejection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {QUOTE_ROWS.map((r) => (
                  <TableRow key={r.number}>
                    <TableCell className="font-mono text-xs">{r.number}</TableCell>
                    <TableCell>{r.client}</TableCell>
                    <TableCell className="text-muted-foreground">{r.site}</TableCell>
                    <TableCell className="text-right">${r.value.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.followUp || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Allowed statuses: Draft, Sent, Pending, Accepted, Rejected, Expired. Allowed rejection reasons:
              Too expensive, No confidence, Poor fit, Slow response, Competitor chosen, Scope unclear, No budget, Other.
            </p>
          </>
        )}

        {kind === "jobs" && (
          <>
            <SheetHeader>
              <SheetTitle>Job Register</SheetTitle>
              <SheetDescription>Active and completed jobs with margin and evidence status.</SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
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
                      <TableCell>{r.client}</TableCell>
                      <TableCell className="text-muted-foreground">{r.site}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{r.start}</TableCell>
                      <TableCell className="text-right">${r.income.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${r.costs.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-medium ${m.tone}`}>{r.gm}%</TableCell>
                      <TableCell>{r.evidence}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        {kind === "margin" && (
          <>
            <SheetHeader>
              <SheetTitle>Margin Summary</SheetTitle>
              <SheetDescription>Gross profit and margin status by job.</SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
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
                      <TableCell className="font-mono text-xs">{r.job}</TableCell>
                      <TableCell className="text-right">${r.income.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${r.costs.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${gp.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-medium ${m.tone}`}>{r.gm}%</TableCell>
                      <TableCell className={m.tone}>{m.label}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Pass ≥ 30%. Watch 20–29%. Fail &lt; 20%. Formula: gross_profit = income − job_costs; gross_margin_% = gross_profit / income.
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Stage1Dashboard() {
  const bd = useBusinessDetails();
  const [bdOpen, setBdOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey>(null);

  // Compute KPI aggregates from fixtures
  const totalLeads = METHOD_ROWS.reduce((s, r) => s + r.leads, 0);
  const quotesSent = QUOTE_ROWS.filter((q) => q.status !== "Draft").length;
  const quotesAccepted = QUOTE_ROWS.filter((q) => q.status === "Accepted").length;
  const quoteConvPct = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  const activeJobs = JOB_ROWS.filter((j) => ["Active", "Scheduled", "Accepted"].includes(j.status)).length;
  const completedJobs = JOB_ROWS.filter((j) => j.status === "Completed").length;
  const totalIncome = JOB_ROWS.reduce((s, r) => s + r.income, 0);
  const totalCosts = JOB_ROWS.reduce((s, r) => s + r.costs, 0);
  const grossProfit = totalIncome - totalCosts;
  const gmPct = totalIncome ? Math.round((grossProfit / totalIncome) * 100) : 0;
  const gmStatus = marginStatus(gmPct);

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
            { k: "Total income", v: `$${totalIncome.toLocaleString()}` },
            { k: "Total job costs", v: `$${totalCosts.toLocaleString()}` },
            { k: "Status", v: gmStatus.label },
          ]}
          onClick={() => setDrill("margin")}
        />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            First 5 Jobs Progress &amp; Simple Job Cost Ledger
          </CardTitle>
          <CardDescription className="text-xs">
            The proof table and Job / Contract Site Detail modal below are preserved unchanged from the working ledger.
            Click any row to open the Job / Contract Site Detail modal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* ---- Bottom half: existing Simple Job Cost Ledger + Job/Contract Site Detail modal ---- */}
          <div className="border-t">
            <Stage1 />
          </div>
        </CardContent>
      </Card>

      <DrillSheet open={drill !== null} onClose={() => setDrill(null)} kind={drill} />
      <BusinessDetailsDialog open={bdOpen} onOpenChange={setBdOpen} hook={bd} />
    </div>
  );
}