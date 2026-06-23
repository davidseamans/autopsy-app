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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProofUnit, GBExpense } from "@/pages/Stage1";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { computeGstSplit, type GstTreatment } from "@/lib/gst";

type Line = {
  date?: string;
  ref?: string;
  description?: string;
  /** GST-INCLUSIVE gross amount as entered (source of truth). */
  gross: number;
  gstIncluded: boolean;
  gstTreatment?: GstTreatment;
  gstOverride?: number;
  overridden?: boolean;
  proof?: string;
  supplier?: string;
  category?: string;
  fromJobN?: number;
  fromJobLabel?: string;
};

// Split a line into gross (inc GST) / GST / net (ex GST) using its GST
// treatment. The entered amount is the GST-inclusive gross; GST and ex-GST are
// derived deterministically — never gross = ex-GST x 1.1.
function splitLine(l: Line) {
  const split = computeGstSplit({
    inclusive: l.gross,
    treatment: l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst"),
    gstOverride: l.gstOverride,
    overridden: l.overridden,
  });
  return { gross: split.inclusive, gst: split.gst, net: split.exGst };
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
      const s = splitLine(l);
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
  totalLabel,
  total,
}: {
  lines: Line[];
  supplierLabel: string;
  showFromJob?: boolean;
  showCategory?: boolean;
  emptyText: string;
  totalLabel: string;
  total: { gross: number; gst: number; net: number };
}) {
  const labelColSpan = 3 + (showFromJob ? 1 : 0) + (showCategory ? 1 : 0);
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
          {lines.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={labelColSpan + 4}
                className="text-xs text-muted-foreground italic"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : lines.map((l, i) => {
            const s = splitLine(l);
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
        <TableFooter>
          <TableRow>
            <TableCell colSpan={labelColSpan} className="font-semibold">
              Totals
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="text-xs text-muted-foreground">Total {totalLabel} incl. GST</div>
              <div className="font-semibold">${fmt(total.gross)}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="text-xs text-muted-foreground">GST on {totalLabel}</div>
              <div className="font-semibold">${fmt(total.gst)}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="text-xs text-muted-foreground">Net {totalLabel} ex GST</div>
              <div className="font-semibold">${fmt(total.net)}</div>
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export function DetailedJobCostReport({
  unit,
  allUnits,
  open,
  onOpenChange,
  onEditInDetail,
}: {
  unit: ProofUnit | null;
  allUnits: ProofUnit[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEditInDetail?: (n: number) => void;
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

  // Income line — built from the UNIT (source of truth): the GST-INCLUSIVE gross
  // amount + GST treatment. GST + ex-GST are derived via computeGstSplit so the
  // report matches the Job Detail and the Simple Job Cost Ledger exactly. The
  // sandbox revenue rows are used only to enrich date / reference.
  const invoiceTreatment = unit.invoiceGstTreatment ?? "no_gst";
  const invoiceGross = unit.invoiceAmount ?? 0;
  const incomeLines: Line[] =
    invoiceGross > 0
      ? [
          {
            date: dateOnly(revenueRows[0]?.created_at),
            ref: revenueRows[0]?.reference ?? unit.invoiceDocName ?? undefined,
            supplier: unit.client,
            description: "Invoice" + (unit.jobSite ? ` — ${unit.jobSite}` : ""),
            gross: invoiceGross,
            gstIncluded: invoiceTreatment === "gst_included" || invoiceTreatment === "manual",
            gstTreatment: invoiceTreatment,
            gstOverride: unit.invoiceGstAmount,
            overridden: unit.invoiceGstOverridden,
            proof: revenueRows[0]?.reference || revenueRows[0]?.source || "Recorded",
          },
        ]
      : [];

  // Job cost lines — built from the UNIT's cost lines (each carries its own
  // GST-INCLUSIVE gross + GST treatment). Sandbox cost rows enrich date / ref.
  const costLines: Line[] = (unit.costLines ?? [])
    .filter((l) => (l.amount ?? 0) > 0)
    .map((l, i) => {
      const treatment = l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst");
      return {
        date: l.date ? dateOnly(l.date) : dateOnly(costRows[i]?.created_at),
        ref: l.docName ?? costRows[i]?.notes ?? undefined,
        supplier: costRows[i]?.notes ?? "Supplier",
        description: l.description || "Job cost",
        gross: l.amount ?? 0,
        gstIncluded: treatment === "gst_included" || treatment === "manual",
        gstTreatment: treatment,
        gstOverride: l.gstAmount,
        overridden: l.gstOverridden,
        proof: l.docName || costRows[i]?.notes || "Recorded",
      };
    });

  const incomeT = totals(incomeLines);
  const costT = totals(costLines);

  // GST-correct summary values. Gross (inc GST), GST and ex-GST all derive from
  // the same line totals used above, so the report matches the Job Detail and
  // the Simple Job Cost Ledger under both GST and No-GST treatments. Gross
  // margin uses ex-GST revenue and ex-GST job costs only.
  const revenueIncGst = incomeT.gross; // Client Invoices inc GST (gross/input)
  const revenueExGst = incomeT.net; // Revenue ex GST (drives margin)
  const totalDirectCost = costT.net; // Job Costs ex GST (drives margin)
  const directCostsRecorded = totalDirectCost > 0;
  const grossProfit = directCostsRecorded ? revenueExGst - totalDirectCost : null;
  const gmPct =
    directCostsRecorded && revenueExGst > 0
      ? (grossProfit! / revenueExGst) * 100
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

  // Outstanding is based on the gross/input (inc GST) invoice amount, matching
  // the Simple Job Cost Ledger.
  const incomeAsPerQuote = revenueIncGst;
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
            <div className="flex items-start justify-between gap-3 pr-10">
              <div className="min-w-0">
                <SheetTitle>Job Cost Summary Report</SheetTitle>
                <SheetDescription>
                  Read-only report. Income, job costs, gross profit, and general business expenses for the selected job.
                </SheetDescription>
              </div>
              {onEditInDetail && unit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => onEditInDetail(unit.n)}
                >
                  Edit in Job / Contract Site Detail
                </Button>
              )}
            </div>
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
                <div className="text-xs text-muted-foreground">Client Invoices inc GST</div>
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

          {/* Section 2 — Client Invoices */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              2. Client Invoices
            </h3>
            <LineTable
              lines={incomeLines}
              supplierLabel="Invoice / Ref"
              emptyText="No customer invoices recorded for this job yet."
              totalLabel="Client Invoices"
              total={incomeT}
            />
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
              totalLabel="Job Costs"
              total={costT}
            />
          </section>

          {/* Section 4 — Job Gross Profit */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              4. Job Result
            </h3>
            <div className="rounded-md border p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Revenue ex GST</div>
                <div className="font-semibold tabular-nums">${fmt(revenueExGst)}</div>
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
              totalLabel="General Business Expenses"
              total={gbT}
            />
            <p className="text-xs text-muted-foreground">
              General business expenses are recorded separately from job costs. They do not change
              this job's gross margin. They may affect whole-business viability, but they do not
              decide whether this job counts toward Stage 1 margin proof.
            </p>
          </section>

          {/* Section 6 — Report Notes */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              6. Report Notes
            </h3>
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              {unit.notes?.trim() || "No report notes recorded."}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
