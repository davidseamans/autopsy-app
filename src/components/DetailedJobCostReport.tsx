import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CostLine, GBExpense, ProofUnit } from "@/pages/Stage1";
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
  onEdit?: () => void;
};

type TransactionDraft = {
  kind: "invoice" | "payment" | "cost" | "gb";
  index?: number;
  date: string;
  ref: string;
  description: string;
  amount: string;
  proof: string;
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
  nettMargin,
}: {
  lines: Line[];
  supplierLabel: string;
  showFromJob?: boolean;
  showCategory?: boolean;
  emptyText: string;
  totalLabel: string;
  total: { gross: number; gst: number; net: number };
  nettMargin?: { amount: number | null; pct: number | null; tone: string };
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
            <TableHead className="text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={labelColSpan + 5}
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
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      l.onEdit?.();
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
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
            <TableCell />
          </TableRow>
          {nettMargin && (
            <TableRow>
              <TableCell colSpan={labelColSpan + 2} className="font-semibold">
                Nett Margin
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {nettMargin.amount !== null ? `$${fmt(nettMargin.amount)}` : "—"}
              </TableCell>
              <TableCell className={`text-right font-semibold tabular-nums ${nettMargin.tone}`}>
                {nettMargin.pct !== null ? `${nettMargin.pct.toFixed(1)}%` : "—"}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          )}
        </TableFooter>
      </Table>
    </div>
  );
}

function PaymentTable({
  payment,
  outstanding,
  onAdd,
  onEdit,
}: {
  payment: { date?: string; client: string; description: string; amount: number } | null;
  outstanding: number;
  onAdd: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
            <TableHead className="text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payment ? (
            <TableRow>
              <TableCell className="text-muted-foreground">{payment.date || "—"}</TableCell>
              <TableCell>{payment.client}</TableCell>
              <TableCell>{payment.description}</TableCell>
              <TableCell className="text-right tabular-nums">${fmt(payment.amount)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={onEdit}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-xs text-muted-foreground italic">
                No client payments recorded for this job yet.
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={onAdd}>
                  Add
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="font-semibold">
              Total Payments Received
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              ${fmt(payment?.amount ?? 0)}
            </TableCell>
            <TableCell />
          </TableRow>
          <TableRow>
            <TableCell colSpan={3} className="font-semibold">
              Amount Outstanding
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              ${fmt(outstanding)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function TransactionDialog({
  draft,
  open,
  saving,
  onDraftChange,
  onOpenChange,
  onSave,
}: {
  draft: TransactionDraft | null;
  open: boolean;
  saving: boolean;
  onDraftChange: (draft: TransactionDraft) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  const title =
    draft.kind === "invoice"
      ? "Client Invoice"
      : draft.kind === "payment"
        ? "Client Payment"
        : draft.kind === "cost"
          ? "Job Cost"
          : "General Business Expense";
  const patch = (next: Partial<TransactionDraft>) => onDraftChange({ ...draft, ...next });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft.index == null ? `Add ${title}` : `Edit ${title}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{draft.kind === "payment" ? "Method" : "Invoice / Ref"}</Label>
            <Input value={draft.ref} onChange={(e) => patch({ ref: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Description</Label>
            <Input value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{draft.kind === "payment" ? "Total Amount" : "Gross incl. GST"}</Label>
            <Input type="number" value={draft.amount} onChange={(e) => patch({ amount: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Proof</Label>
            <Input value={draft.proof} onChange={(e) => patch({ proof: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DetailedJobCostReport({
  unit,
  open,
  onOpenChange,
  onSave,
}: {
  unit: ProofUnit | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave?: (unit: ProofUnit) => Promise<void> | void;
}) {
  // Detail rows live in the Stage 1 sandbox tables. Hydrate them on open from
  // the SAME persisted source as the ledger (keyed on stage1_job_id), so the
  // modal never resets to zero just because local arrays are empty.
  const stage1JobId = unit?.stage1JobId ?? null;
  const [revenueRows, setRevenueRows] = useState<Stage1RevenueRow[]>([]);
  const [costRows, setCostRows] = useState<Stage1CostRow[]>([]);
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft | null>(null);
  const [transactionSaving, setTransactionSaving] = useState(false);

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
  const closeTransactionDialog = () => setTransactionDraft(null);
  const openInvoiceDialog = () =>
    setTransactionDraft({
      kind: "invoice",
      date: unit.invoiceDate ?? "",
      ref: unit.invoiceRef ?? unit.invoiceDocName ?? "",
      description: "Invoice" + (unit.jobSite ? ` - ${unit.jobSite}` : ""),
      amount: unit.invoiceAmount != null ? String(unit.invoiceAmount) : "",
      proof: unit.invoiceDocName ?? "",
    });
  const openPaymentDialog = () =>
    setTransactionDraft({
      kind: "payment",
      date: unit.paymentDate ?? "",
      ref: unit.paymentMethod ?? "",
      description: unit.paymentMethod ?? "Payment received",
      amount: unit.paymentAmount != null ? String(unit.paymentAmount) : "",
      proof: unit.paymentProofName ?? "",
    });
  const openCostDialog = (line?: CostLine, index?: number) =>
    setTransactionDraft({
      kind: "cost",
      index,
      date: line?.date ?? "",
      ref: line?.docName ?? "",
      description: line?.description ?? "",
      amount: line?.amount != null ? String(line.amount) : "",
      proof: line?.docName ?? "",
    });
  const openGbDialog = (expense?: GBExpense, index?: number) =>
    setTransactionDraft({
      kind: "gb",
      index,
      date: expense?.expenseDate ?? "",
      ref: expense?.supplier ?? "",
      description: expense?.description ?? "",
      amount: expense?.amount != null ? String(expense.amount) : "",
      proof: expense?.receiptName ?? "",
    });
  const saveTransaction = async () => {
    if (!transactionDraft || !onSave) return;
    setTransactionSaving(true);
    try {
      const parsedAmount = transactionDraft.amount === "" ? undefined : Number(transactionDraft.amount);
      const amount = parsedAmount !== undefined && Number.isFinite(parsedAmount) ? parsedAmount : undefined;
      let next: ProofUnit = { ...unit };
      if (transactionDraft.kind === "invoice") {
        next = {
          ...next,
          invoiceAmount: amount,
          invoiceDate: transactionDraft.date || undefined,
          invoiceRef: transactionDraft.ref || undefined,
          invoiceDocName: transactionDraft.proof || transactionDraft.ref || undefined,
          evidence: Boolean(transactionDraft.proof || transactionDraft.ref || next.evidence),
        };
      } else if (transactionDraft.kind === "payment") {
        next = {
          ...next,
          paymentAmount: amount,
          paymentDate: transactionDraft.date || undefined,
          paymentMethod: (transactionDraft.ref || undefined) as ProofUnit["paymentMethod"],
          paymentProofName: transactionDraft.proof || undefined,
        };
      } else if (transactionDraft.kind === "cost") {
        const lines = [...(next.costLines ?? [])];
        const existing = transactionDraft.index == null ? undefined : lines[transactionDraft.index];
        const line: CostLine = {
          id: existing?.id ?? crypto.randomUUID(),
          description: transactionDraft.description,
          amount,
          date: transactionDraft.date || undefined,
          docName: transactionDraft.proof || transactionDraft.ref || undefined,
          gstIncluded: existing?.gstIncluded ?? true,
          gstTreatment: existing?.gstTreatment ?? "gst_included",
          gstAmount: existing?.gstAmount,
          gstOverridden: existing?.gstOverridden,
        };
        if (transactionDraft.index == null) lines.push(line);
        else lines[transactionDraft.index] = line;
        next = { ...next, costLines: lines };
      } else {
        const expenses = [...(next.gbExpenses ?? [])];
        const existing = transactionDraft.index == null ? undefined : expenses[transactionDraft.index];
        const expense: GBExpense = {
          id: existing?.id ?? crypto.randomUUID(),
          expenseDate: transactionDraft.date || undefined,
          supplier: transactionDraft.ref || undefined,
          description: transactionDraft.description || undefined,
          amount,
          gstIncluded: existing?.gstIncluded ?? true,
          receiptName: transactionDraft.proof || undefined,
          category: existing?.category,
          notes: existing?.notes,
        };
        if (transactionDraft.index == null) expenses.push(expense);
        else expenses[transactionDraft.index] = expense;
        next = { ...next, gbExpenses: expenses };
      }
      await onSave(next);
      closeTransactionDialog();
    } finally {
      setTransactionSaving(false);
    }
  };

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
            onEdit: openInvoiceDialog,
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
        onEdit: () => openCostDialog(l, i),
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
      : gmPct >= 35
        ? "text-emerald-600"
        : "text-red-600";

  // General business expenses are kept separate from job margin.
  const gbLines: Line[] = [];
  for (const [i, g] of (unit.gbExpenses ?? []).entries()) {
    if (!g.amount) continue;
    gbLines.push({
      date: g.expenseDate,
      ref: g.supplier,
      description: g.description,
      gross: g.amount,
      gstIncluded: g.gstIncluded !== false,
      proof: g.receiptName,
      onEdit: () => openGbDialog(g, i),
    });
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
  const paymentLine =
    paymentReceived > 0
      ? {
          date: unit.paymentDate,
          client: unit.client,
          description: unit.paymentMethod ?? "Payment received",
          amount: paymentReceived,
        }
      : null;
  const jobNumber = unit.jobSequenceNumber != null ? `J-${unit.jobSequenceNumber}` : `J-${unit.n}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[90vw] lg:w-[80vw] xl:w-[75vw] overflow-y-auto p-0"
      >
        <div className="p-6 space-y-6">
          <SheetHeader>
            <SheetTitle>Job Cost Summary Report</SheetTitle>
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
            </div>
          </section>

          {/* Section 2 — Client Invoices */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                2. Client Invoices
              </h3>
              <Button size="sm" variant="outline" onClick={openInvoiceDialog}>
                Add Client Invoice
              </Button>
            </div>
            <LineTable
              lines={incomeLines}
              supplierLabel="Invoice / Ref"
              emptyText="No customer invoices recorded for this job yet."
              totalLabel="Client Invoices"
              total={incomeT}
            />
          </section>

          {/* Section 2a — Client Payments */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                2a. Client Payments
              </h3>
              <Button size="sm" variant="outline" onClick={openPaymentDialog}>
                Add Client Payment
              </Button>
            </div>
            <PaymentTable
              payment={paymentLine}
              outstanding={outstanding}
              onAdd={openPaymentDialog}
              onEdit={openPaymentDialog}
            />
          </section>

          {/* Section 3 — Job Costs */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                3. Job Costs
              </h3>
              <Button size="sm" variant="outline" onClick={() => openCostDialog()}>
                Add Job Cost
              </Button>
            </div>
            <LineTable
              lines={costLines}
              supplierLabel="Supplier / Ref"
              emptyText="No job costs recorded for this job yet."
              totalLabel="Job Costs"
              total={costT}
              nettMargin={{ amount: grossProfit, pct: gmPct, tone: gmTone }}
            />
          </section>

          {/* Section 4 — General Business Expenses */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                4. General Business Expenses
              </h3>
              <Button size="sm" variant="outline" onClick={() => openGbDialog()}>
                Add General Business Expense
              </Button>
            </div>
            <LineTable
              lines={gbLines}
              supplierLabel="Invoice / Ref"
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
          <TransactionDialog
            draft={transactionDraft}
            open={transactionDraft !== null}
            saving={transactionSaving}
            onDraftChange={setTransactionDraft}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closeTransactionDialog();
            }}
            onSave={saveTransaction}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
