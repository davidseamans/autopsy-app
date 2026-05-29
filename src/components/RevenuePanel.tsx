import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, Loader2, Receipt, Wallet } from "lucide-react";

// ---------- Money + date helpers ----------
const fmtMoney = (n: number) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | null | undefined) => `$${fmtMoney(Number(n ?? 0))}`;
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

// ---------- Revenue type + source options ----------
const REVENUE_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "part_payment", label: "Part Payment" },
  { value: "balance_payment", label: "Balance Payment" },
  { value: "full_payment", label: "Full Payment" },
] as const;

const PAYMENT_SOURCES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

const revenueTypeLabel = (v: string) =>
  REVENUE_TYPES.find((t) => t.value === v)?.label ?? v;
const paymentSourceLabel = (v: string) =>
  PAYMENT_SOURCES.find((s) => s.value === v)?.label ?? v;

// ---------- Collection status display ----------
function CollectionStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "fully_collected":
      return (
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
          <CheckCircle2 className="h-3.5 w-3.5" /> Fully Collected
        </Badge>
      );
    case "outstanding_balance":
      return (
        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
          Outstanding Balance
        </Badge>
      );
    case "over_collected_review":
      return (
        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">
          Over-Collection — Review Required
        </Badge>
      );
    case "missing_quote_control":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Missing Quote Control
        </Badge>
      );
    default:
      return <Badge variant="outline">{status ?? "—"}</Badge>;
  }
}

// ---------- Types ----------
type RevenueControl = {
  job_id: string;
  approved_job_value: number | null;
  revenue_collected: number | null;
  outstanding_balance: number | null;
  collection_status: string | null;
};

type RevenueEvent = {
  id: string;
  job_id: string;
  amount: number;
  revenue_type: string;
  source: string;
  reference: string | null;
  created_at: string;
};

type JobRow = {
  job_id: string;
  label: string;
  sub: string;
  control: RevenueControl | null;
};

// ---------- Main panel ----------
export function RevenuePanel() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Jobs + linked client (account) + quote reference for human-readable labels.
    const [jobsRes, controlRes, eventsRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, po_number, status, created_at, account_id, quote_id")
        .order("created_at", { ascending: false }),
      supabase.from("job_revenue_control").select("*"),
      supabase.from("revenue_events").select("*").order("created_at", { ascending: false }),
    ]);

    const jobsData = (jobsRes.data ?? []) as any[];
    const control = (controlRes.data ?? []) as RevenueControl[];
    const evs = (eventsRes.data ?? []) as RevenueEvent[];

    // Resolve client + quote labels via separate lookups (avoids FK-embed assumptions).
    const accountIds = [...new Set(jobsData.map((j) => j.account_id).filter(Boolean))];
    const quoteIds = [...new Set(jobsData.map((j) => j.quote_id).filter(Boolean))];
    const [accRes, qRes] = await Promise.all([
      accountIds.length
        ? supabase.from("accounts").select("id, name").in("id", accountIds)
        : Promise.resolve({ data: [] as any[] }),
      quoteIds.length
        ? supabase.from("quotes").select("id, quote_number").in("id", quoteIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const accMap = new Map((accRes.data ?? []).map((a: any) => [a.id, a.name]));
    const qMap = new Map((qRes.data ?? []).map((q: any) => [q.id, q.quote_number]));
    const controlMap = new Map(control.map((c) => [c.job_id, c]));

    const rows: JobRow[] = jobsData.map((j) => {
      const client = accMap.get(j.account_id) ?? "Unnamed job";
      const quoteNo = qMap.get(j.quote_id);
      const ref = quoteNo ? `Quote ${quoteNo}` : j.po_number ? `PO ${j.po_number}` : `Job ${String(j.id).slice(0, 8)}`;
      return {
        job_id: j.id,
        label: client,
        sub: ref,
        control: controlMap.get(j.id) ?? null,
      };
    });

    setJobs(rows);
    setEvents(evs);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeJob = useMemo(
    () => jobs.find((j) => j.job_id === activeJobId) ?? null,
    [jobs, activeJobId],
  );

  const openPayment = (jobId: string) => {
    setActiveJobId(jobId);
    setPayOpen(true);
  };

  const handleSaved = async () => {
    setPayOpen(false);
    toast.success("Payment recorded.");
    await loadData(); // re-fetch job_revenue_control + events from source records
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading revenue…
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Revenue &amp; Payments
          </CardTitle>
          <CardDescription className="text-xs">
            Record each payment as it comes in — deposits, part-payments, and final payments.
            Revenue collected and outstanding balance are calculated from the saved payment records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No jobs yet. Jobs appear here once they exist, ready to record payments against.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {jobs.map((job) => {
                const c = job.control;
                return (
                  <div key={job.job_id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium leading-tight truncate">{job.label}</div>
                        <div className="text-xs text-muted-foreground leading-tight">{job.sub}</div>
                      </div>
                      <CollectionStatusBadge status={c?.collection_status ?? "missing_quote_control"} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <Metric label="Approved Value" value={money(c?.approved_job_value)} />
                      <Metric label="Collected" value={money(c?.revenue_collected)} />
                      <Metric
                        label="Outstanding"
                        value={money(c?.outstanding_balance)}
                        tone={
                          (c?.outstanding_balance ?? 0) > 0
                            ? "text-amber-700"
                            : (c?.outstanding_balance ?? 0) < 0
                              ? "text-red-700"
                              : "text-emerald-700"
                        }
                      />
                    </div>

                    <Button size="sm" className="w-full gap-2" onClick={() => openPayment(job.job_id)}>
                      <Receipt className="h-4 w-4" /> Record Payment
                    </Button>

                    <PaymentHistory rows={events.filter((e) => e.job_id === job.job_id)} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        jobs={jobs}
        defaultJobId={activeJob?.job_id ?? null}
        onSaved={handleSaved}
      />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

// ---------- Read-only payment history ----------
function PaymentHistory({ rows }: { rows: RevenueEvent[] }) {
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No payments recorded yet.</p>;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-right text-xs">Amount</TableHead>
            <TableHead className="text-xs">Revenue Type</TableHead>
            <TableHead className="text-xs">Source</TableHead>
            <TableHead className="text-xs">Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(r.created_at)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs font-medium">{money(r.amount)}</TableCell>
              <TableCell className="text-xs">{revenueTypeLabel(r.revenue_type)}</TableCell>
              <TableCell className="text-xs">{paymentSourceLabel(r.source)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Record Payment dialog ----------
function RecordPaymentDialog({
  open,
  onOpenChange,
  jobs,
  defaultJobId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: JobRow[];
  defaultJobId: string | null;
  onSaved: () => void;
}) {
  const [jobId, setJobId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [revenueType, setRevenueType] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Reset / seed each time the dialog opens.
  useEffect(() => {
    if (open) {
      setJobId(defaultJobId ?? "");
      setAmount("");
      setRevenueType("");
      setSource("");
      setReference("");
    }
  }, [open, defaultJobId]);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const canSave = !!jobId && amountValid && !!revenueType && !!source && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase.from("revenue_events").insert({
      job_id: jobId,
      amount: amountNum,
      revenue_type: revenueType,
      source,
      reference: reference.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(`Could not record payment: ${error.message}`);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Add a single payment event. Each payment is saved separately — totals update automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Job <span className="text-destructive">*</span>
            </Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.job_id} value={j.job_id}>
                    {j.label} — {j.sub}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pay-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amount !== "" && !amountValid}
              />
              {amount !== "" && !amountValid && (
                <p className="text-xs text-destructive">Amount must be greater than zero.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Revenue Type <span className="text-destructive">*</span>
              </Label>
              <Select value={revenueType} onValueChange={setRevenueType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Payment Source <span className="text-destructive">*</span>
            </Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference / Notes</Label>
            <Textarea
              id="pay-ref"
              placeholder="Optional reference or note"
              value={reference}
              maxLength={500}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}