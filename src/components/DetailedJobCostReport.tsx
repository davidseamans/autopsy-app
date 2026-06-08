import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProofUnit, GBExpense } from "@/pages/Stage1";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type Line = {
  date?: string;
  ref?: string;
  description?: string;
  gross: number;
  gstIncluded: boolean;
  proof?: string;
  supplier?: string;
  category?: string;
  fromJobN?: number;
  fromJobLabel?: string;
};

function splitGst(gross: number, gstIncluded: boolean) {
  if (!gross) return { gross: 0, gst: 0, net: 0 };
  if (gstIncluded) {
    const gst = gross / 11;
    return { gross, gst, net: gross - gst };
  }
  return { gross, gst: 0, net: gross };
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Stage 1 sandbox proof-type / payment-status display labels (mirrors the ledger).
const PROOF_TYPE_LABELS: Record<string, string> = {
  not_yet_proven: "Not yet proven",
  revenue_recorded: "Revenue recorded",
  commercial_proof_recorded: "Commercial proof recorded",
  completed_job: "Completed job",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_invoiced: "Not invoiced",
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
};

// Detail rows fetched live from the Stage 1 sandbox tables (canonical truth).
type Stage1RevenueRow = {
  id: string;
  amount: number | null;
  revenue_type: string | null;
  source: string | null;
  reference: string | null;
  created_at: string | null;
};
type Stage1CostRow = {
  id: string;
  labour_cost: number | null;
  consumables_cost: number | null;
  travel_cost: number | null;
  rework_cost: number | null;
  other_direct_cost: number | null;
  notes: string | null;
  created_at: string | null;
};

function totals(lines: Line[]) {
  return lines.reduce(
    (acc, l) => {
      const s = splitGst(l.gross, l.gstIncluded);
      acc.gross += s.gross;
      acc.gst += s.gst;
      acc.net += s.net;
      return acc;
    },
    { gross: 0, gst: 0, net: 0 },
  );
}

function LineTable({
  lines,
  supplierLabel,
  showFromJob,
  showCategory,
  emptyText,
}: {
  lines: Line[];
  supplierLabel: string;
  showFromJob?: boolean;
  showCategory?: boolean;
  emptyText: string;
}) {
  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>{supplierLabel}</TableHead>
            {showFromJob && <TableHead>Entered From Job</TableHead>}
            <TableHead>Description</TableHead>
            {showCategory && <TableHead>Category</TableHead>}
            <TableHead className="text-right">Gross incl. GST</TableHead>
            <TableHead className="text-right">GST</TableHead>
            <TableHead className="text-right">Net ex GST</TableHead>
            <TableHead>Proof</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => {
            const s = splitGst(l.gross, l.gstIncluded);
            return (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{l.date || "—"}</TableCell>
                <TableCell>{l.supplier || l.ref || "—"}</TableCell>
                {showFromJob && (
                  <TableCell className="text-muted-foreground">
                    {l.fromJobLabel ?? (l.fromJobN ? `Job #${l.fromJobN}` : "—")}
                  </TableCell>
                )}
                <TableCell>{l.description || "—"}</TableCell>
                {showCategory && <TableCell>{l.category || "—"}</TableCell>}
                <TableCell className="text-right tabular-nums">${fmt(s.gross)}</TableCell>
                <TableCell className="text-right tabular-nums">${fmt(s.gst)}</TableCell>
                <TableCell className="text-right tabular-nums">${fmt(s.net)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.proof || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TotalsBlock({
  label,
  t,
}: {
  label: string;
  t: { gross: number; gst: number; net: number };
}) {
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
      <div className="rounded-md border p-2">
        <div className="text-xs text-muted-foreground">Total {label} incl. GST</div>
        <div className="font-semibold tabular-nums">${fmt(t.gross)}</div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-xs text-muted-foreground">GST on {label}</div>
        <div className="font-semibold tabular-nums">${fmt(t.gst)}</div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-xs text-muted-foreground">Net {label} ex GST</div>
        <div className="font-semibold tabular-nums">${fmt(t.net)}</div>
      </div>
    </div>
  );
}

export function DetailedJobCostReport({
  unit,
  allUnits,
  open,
  onOpenChange,
}: {
  unit: ProofUnit | null;
  allUnits: ProofUnit[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  // Detail rows live in the Stage 1 sandbox tables. Hydrate them on open from
  // the SAME persisted source as the ledger (keyed on stage1_job_id), so the
  // modal never resets to zero just because local arrays are empty.
  const stage1JobId = unit?.stage1JobId ?? null;
  const [revenueRows, setRevenueRows] = useState<Stage1RevenueRow[]>([]);
  const [costRows, setCostRows] = useState<Stage1CostRow[]>([]);

  useEffect(() => {
    if (!open || !stage1JobId) {
      setRevenueRows([]);
      setCostRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [rev, cost] = await Promise.all([
        supabase
          .from("stage1_revenue_events")
          .select("id,amount,revenue_type,source,reference,created_at")
          .eq("stage1_job_id", stage1JobId)
          .order("created_at", { ascending: true }),
        supabase
          .from("stage1_job_costs")
          .select(
            "id,labour_cost,consumables_cost,travel_cost,rework_cost,other_direct_cost,notes,created_at",
          )
          .eq("stage1_job_id", stage1JobId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setRevenueRows(((rev.data ?? []) as Stage1RevenueRow[]) || []);
      setCostRows(((cost.data ?? []) as Stage1CostRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, stage1JobId]);

  if (!unit) return null;

  const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : undefined);

  // Income lines — sandbox revenue events (stored EX-GST, so net == gross here).
  const incomeLines: Line[] = revenueRows
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({
      date: dateOnly(r.created_at),
      ref: r.reference ?? undefined,
      supplier: unit.client,
      description:
        (r.revenue_type ? r.revenue_type.charAt(0).toUpperCase() + r.revenue_type.slice(1) : "Invoice") +
        (unit.jobSite ? ` — ${unit.jobSite}` : ""),
      gross: Number(r.amount) || 0,
      gstIncluded: false,
      proof: r.reference || r.source || "Recorded",
    }));

  // Job cost lines — sandbox categorised cost row(s) (stored EX-GST).
  const costLines: Line[] = [];
  for (const c of costRows) {
    const pushBucket = (label: string, amount: number | null) => {
      const amt = Number(amount) || 0;
      if (amt <= 0) return;
      costLines.push({
        date: dateOnly(c.created_at),
        ref: c.notes ?? undefined,
        supplier: c.notes ?? "Supplier",
        description: label,
        gross: amt,
        gstIncluded: false,
        proof: c.notes || "Recorded",
      });
    };
    pushBucket("Labour for job", c.labour_cost);
    pushBucket("Consumables / Materials", c.consumables_cost);
    pushBucket("Travel", c.travel_cost);
    pushBucket("Rework", c.rework_cost);
    pushBucket("Other direct costs", c.other_direct_cost);
  }

  const incomeT = totals(incomeLines);
  const costT = totals(costLines);

  // Summary values come from the persisted Stage 1 margin summary projection on
  // the unit (NOT recomputed from local arrays), so they always match the ledger.
  const revenueAmount = unit.sandboxRevenueAmount ?? unit.invoiceAmount ?? unit.quoteValue ?? 0;
  const totalDirectCost = unit.sandboxTotalDirectCost ?? costT.gross;
  const directCostsRecorded = totalDirectCost > 0;
  const grossProfit =
    unit.sandboxGrossProfit != null
      ? unit.sandboxGrossProfit
      : directCostsRecorded
        ? revenueAmount - totalDirectCost
        : null;
  const gmPct =
    unit.sandboxGrossMarginPct != null
      ? unit.sandboxGrossMarginPct
      : directCostsRecorded && revenueAmount > 0
        ? ((revenueAmount - totalDirectCost) / revenueAmount) * 100
        : null;
  const gmTone =
    gmPct === null
      ? "text-muted-foreground"
      : gmPct >= 30
        ? "text-emerald-600"
        : gmPct >= 20
          ? "text-amber-600"
          : "text-red-600";
  const NOT_YET_PROVEN = "Not Yet Proven";
  const gmPctText = gmPct === null ? NOT_YET_PROVEN : `${gmPct.toFixed(1)}%`;
  const grossProfitText = grossProfit === null ? NOT_YET_PROVEN : `$${fmt(grossProfit)}`;
  const jobCostsText = directCostsRecorded ? `$${fmt(totalDirectCost)}` : "Not Yet Recorded";
  const proofTypeText = unit.sandboxProofType
    ? PROOF_TYPE_LABELS[unit.sandboxProofType] ?? unit.proofType
    : unit.proofType;
  const paymentStatusText = unit.sandboxPaymentStatus
    ? PAYMENT_STATUS_LABELS[unit.sandboxPaymentStatus] ?? "—"
    : "—";

  // Global GB expenses across all units
  const gbLines: Line[] = [];
  for (const u of allUnits) {
    for (const g of u.gbExpenses ?? []) {
      if (!g.amount) continue;
      gbLines.push({
        date: g.expenseDate,
        supplier: g.supplier,
        description: g.description,
        category: g.category,
        gross: g.amount,
        gstIncluded: g.gstIncluded !== false,
        proof: g.receiptName,
        fromJobN: u.n,
        fromJobLabel: `Job #${u.n} — ${u.client}`,
      });
    }
  }
  const gbT = totals(gbLines);

  // Revenue / payment / outstanding come from the persisted sandbox projection.
  const incomeAsPerQuote = revenueAmount;
  const paymentReceived = unit.sandboxPaymentReceivedAmount ?? unit.paymentAmount ?? 0;
  const outstanding =
    unit.sandboxOutstandingAmount != null
      ? unit.sandboxOutstandingAmount
      : incomeAsPerQuote - paymentReceived;
  const jobNumber = unit.jobSequenceNumber != null ? `J-${unit.jobSequenceNumber}` : `J-${unit.n}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[90vw] lg:w-[80vw] xl:w-[75vw] overflow-y-auto p-0"
      >
        <div className="p-6 space-y-6">
          <SheetHeader>
            <SheetTitle>Detailed Job Cost Report</SheetTitle>
            <SheetDescription>
              Income, job costs, gross profit, and general business expenses for the selected job.
            </SheetDescription>
          </SheetHeader>

          {/* Section 1 — Job Summary */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              1. Job Summary
            </h3>
            <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Job #</div>
                <div className="font-mono">{jobNumber}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Source Quote #</div>
                <div className="font-mono">{unit.sourceQuote ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Client</div>
                <div className="font-medium">{unit.client}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Job / Site Location</div>
                <div>{unit.jobSite ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Proof Type</div>
                <div>{proofTypeText}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Job / Contract Status</div>
                <div>
                  <Badge variant="outline">{unit.status}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Income as per quote</div>
                <div className="font-semibold tabular-nums">${fmt(incomeAsPerQuote)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Payment Received</div>
                <div className="font-semibold tabular-nums">${fmt(paymentReceived)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Outstanding</div>
                <div className={`font-semibold tabular-nums ${outstanding > 0 ? "text-amber-600" : ""}`}>
                  ${fmt(outstanding)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Payment Status</div>
                <div>{paymentStatusText}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">GM %</div>
                <div className={`font-medium ${gmTone}`}>{gmPctText}</div>
              </div>
            </div>
          </section>

          {/* Section 2 — Customer Income / Invoices */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              2. Customer Income / Invoices
            </h3>
            <LineTable
              lines={incomeLines}
              supplierLabel="Invoice / Ref"
              emptyText="No customer invoices recorded for this job yet."
            />
            <TotalsBlock label="Income" t={incomeT} />
          </section>

          {/* Section 3 — Job Costs */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              3. Job Costs
            </h3>
            <LineTable
              lines={costLines}
              supplierLabel="Supplier / Ref"
              emptyText="No job costs recorded for this job yet."
            />
            <TotalsBlock label="Job Costs" t={costT} />
          </section>

          {/* Section 4 — Job Gross Profit */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              4. Job Result
            </h3>
            <div className="rounded-md border p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Income</div>
                <div className="font-semibold tabular-nums">${fmt(revenueAmount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Job Costs</div>
                <div className="font-semibold tabular-nums">{jobCostsText}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Gross Profit</div>
                <div className="font-semibold tabular-nums">{grossProfitText}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Gross Margin %</div>
                <div className={`font-semibold ${gmTone}`}>{gmPctText}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Formula: gross_profit = income − job_costs. gross_margin_% = gross_profit / income.
              Values match the front-page Simple Job Cost Ledger.
            </p>
          </section>

          {/* Section 5 — General Business Expenses (global) */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              5. General Business Expenses
            </h3>
            <LineTable
              lines={gbLines}
              supplierLabel="Supplier"
              showFromJob
              showCategory
              emptyText="No general business expenses recorded yet."
            />
            <TotalsBlock label="General Business Expenses" t={gbT} />
            <p className="text-xs text-muted-foreground">
              General business expenses are recorded separately from job costs. They do not change
              this job's gross margin. They may affect whole-business viability, but they do not
              decide whether this job counts toward Stage 1 margin proof.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}