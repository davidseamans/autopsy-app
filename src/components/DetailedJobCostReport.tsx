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
  if (!unit) return null;

  // Income lines (one customer invoice line if present)
  const incomeLines: Line[] = [];
  if (unit.invoiceAmount) {
    incomeLines.push({
      date: unit.invoiceDate,
      ref: unit.invoiceDocName,
      supplier: unit.client,
      description:
        unit.invoiceDocType ?? (unit.jobSite ? `Invoice — ${unit.jobSite}` : "Customer invoice"),
      gross: unit.invoiceAmount,
      gstIncluded: true,
      proof: unit.invoiceDocName || (unit.evidence ? "Attached" : "Missing"),
    });
  }

  // Job cost lines (one synthetic line per cost bucket)
  const costLines: Line[] = [];
  const pushCost = (
    label: string,
    amount: number | undefined,
    opts: { supplier?: string; gstIncluded?: boolean; proof?: string } = {},
  ) => {
    if (!amount) return;
    costLines.push({
      date: unit.invoiceDate,
      ref: unit.costDocName,
      supplier: opts.supplier ?? unit.costDocType ?? "Supplier",
      description: label,
      gross: amount,
      gstIncluded: opts.gstIncluded ?? true,
      proof: opts.proof ?? unit.costDocName ?? "Missing",
    });
  };
  pushCost("Labour for job", unit.costLabour, {
    supplier: "Cleaner hours",
    gstIncluded: false,
    proof: "Missing",
  });
  pushCost("Materials / supplies", unit.costMaterials, {
    supplier: "Bunnings",
    gstIncluded: true,
    proof: unit.costDocName ?? "Attached",
  });
  pushCost("Subcontractors", unit.costSubcontractors, { gstIncluded: true });
  pushCost("Other direct costs", unit.costOther, { gstIncluded: true });

  const incomeT = totals(incomeLines);
  const costT = totals(costLines);
  // Governance: zero recorded cost is NOT the same as proven zero cost.
  // Only calculate gross profit / margin when direct costs are actually recorded.
  const directCostStatus = (unit as { directCostStatus?: string }).directCostStatus;
  const directCostDisplay = (unit as { directCostDisplay?: string }).directCostDisplay;
  const directCostsRecorded =
    costT.gross > 0 &&
    directCostStatus !== "not_yet_recorded" &&
    directCostDisplay !== "Not Yet Recorded";
  // GST is excluded from gross margin. Gross profit and GM % are calculated
  // from ex-GST (net) revenue and ex-GST direct costs only.
  const grossProfit = directCostsRecorded ? incomeT.net - costT.net : null;
  const gmPct =
    directCostsRecorded && incomeT.net > 0
      ? ((incomeT.net - costT.net) / incomeT.net) * 100
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
  const jobCostsText = directCostsRecorded ? `$${fmt(costT.net)}` : "Not Yet Recorded";

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

  const evidenceStatus = unit.evidence ? "Attached" : "Missing";
  const incomeAsPerQuote = unit.quoteValue ?? 0;
  const paymentReceived = unit.paymentAmount ?? 0;
  const outstanding = incomeAsPerQuote - paymentReceived;
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
                <div>{unit.proofType}</div>
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
                <div className="text-xs text-muted-foreground">Evidence</div>
                <div>{evidenceStatus}</div>
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
                <div className="font-semibold tabular-nums">${fmt(incomeT.gross)}</div>
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