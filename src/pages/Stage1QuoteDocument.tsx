import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Briefcase, FileCheck2, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { fetchBusinessIdentity, type PublicBusinessProfile } from "@/lib/businessIdentity";
import {
  acceptStage1Quote,
  createInvoiceFromQuote,
  describeDocumentError,
  fetchStage1QuoteDocument,
  type Stage1QuoteDocument as QuoteDocument,
} from "@/lib/stage1Documents";

const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const auDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU") : "—";
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Stage1QuoteDocument() {
  const { quoteId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const [quote, setQuote] = useState<QuoteDocument | null>(null);
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  const reload = useCallback(async () => {
    if (!quoteId || !runId) throw new Error("The quote or Autopsy run is missing.");
    const [document, identity] = await Promise.all([
      fetchStage1QuoteDocument(quoteId),
      fetchBusinessIdentity(runId),
    ]);
    if (document.runId !== runId) throw new Error("This quote does not belong to the selected First 5 Jobs run.");
    if (!identity.profile?.verified) throw new Error("Verified Business Details are required.");
    setQuote(document);
    setProfile(identity.profile);
    if (document.invoice) setShowInvoice(true);
  }, [quoteId, runId]);

  useEffect(() => {
    void reload()
      .catch((loadError) => setError(describeDocumentError(loadError)))
      .finally(() => setLoading(false));
  }, [reload]);

  async function accept() {
    if (!quote || working) return;
    setWorking(true);
    try {
      const job = await acceptStage1Quote(quote.id);
      toast.success(`${quote.number} accepted and converted to ${job.jobNumber}.`);
      await reload();
    } catch (actionError) {
      toast.error(describeDocumentError(actionError));
    } finally {
      setWorking(false);
    }
  }

  async function invoice() {
    if (!quote || working) return;
    setWorking(true);
    try {
      const created = await createInvoiceFromQuote(quote.id, todayIso());
      toast.success(`${created.invoiceNumber} created from ${quote.number}.`);
      await reload();
      setShowInvoice(true);
    } catch (actionError) {
      toast.error(describeDocumentError(actionError));
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="container max-w-4xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading document…</div>;

  const backTo = runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  if (error || !quote || !profile) {
    return <div className="container max-w-4xl py-10 space-y-4"><Button asChild variant="ghost"><Link to={backTo}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button><Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error ?? "Document not found."}</CardContent></Card></div>;
  }

  const invoiceDocument = showInvoice && quote.invoice;
  const issuer = invoiceDocument
    ? {
        businessName: invoiceDocument.issuerBusinessName,
        registeredName: invoiceDocument.issuerRegisteredName,
        abn: invoiceDocument.issuerAbn,
        contactName: invoiceDocument.issuerContactName,
        phone: invoiceDocument.issuerPhone,
        email: invoiceDocument.issuerEmail,
      }
    : profile;

  return (
    <div className="container max-w-5xl py-8 space-y-5">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link to={backTo}><ArrowLeft className="mr-1 h-4 w-4" /> First 5 Jobs</Link></Button>
        <div className="flex flex-wrap gap-2">
          {quote.invoice ? <Button variant="outline" onClick={() => setShowInvoice((current) => !current)}>{showInvoice ? "View original quote" : "View tax invoice"}</Button> : null}
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print or save PDF</Button>
          {quote.status !== "accepted" ? <Button onClick={() => void accept()} disabled={working}><Briefcase className="mr-2 h-4 w-4" /> Customer accepted — create job</Button> : null}
          {quote.status === "accepted" && !quote.invoice ? <Button onClick={() => void invoice()} disabled={working}><FileCheck2 className="mr-2 h-4 w-4" /> Create tax invoice</Button> : null}
        </div>
      </div>

      <article className="rounded-xl border bg-white p-6 text-slate-950 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-10">
        <header className="flex flex-col justify-between gap-8 border-b pb-7 sm:flex-row">
          <div>
            <p className="text-2xl font-bold">{issuer.businessName}</p>
            {issuer.registeredName && issuer.registeredName !== issuer.businessName ? <p className="mt-1 text-sm text-slate-600">{issuer.registeredName}</p> : null}
            <p className="mt-3 text-sm">ABN {issuer.abn}</p>
            <p className="text-sm">{issuer.contactName}</p>
            <p className="text-sm">{issuer.phone} · {issuer.email}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{invoiceDocument ? "Tax Invoice" : "Quote"}</p>
            <p className="mt-2 font-mono text-xl font-semibold">{invoiceDocument ? invoiceDocument.number : quote.number}</p>
            <p className="mt-3 text-sm">Issued: {auDate(invoiceDocument ? invoiceDocument.issuedAt : quote.issuedAt)}</p>
            <p className="text-sm">{invoiceDocument ? `Due: ${auDate(invoiceDocument.dueDate)}` : `Valid until: ${auDate(quote.validUntil)}`}</p>
            <Badge variant="outline" className="mt-3">{invoiceDocument ? invoiceDocument.status : quote.status}</Badge>
          </div>
        </header>

        <section className="grid gap-6 py-7 sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">For</p><p className="mt-2 font-semibold">{quote.clientName}</p><p className="text-sm">{quote.clientContactName}</p><p className="text-sm">{quote.clientEmail}</p><p className="text-sm">{quote.clientPhone}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Service address</p><p className="mt-2 whitespace-pre-wrap text-sm">{quote.siteAddress}</p>{quote.jobNumber ? <p className="mt-2 font-mono text-xs text-slate-500">Job {quote.jobNumber}</p> : null}</div>
        </section>

        <section className="border-y py-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Work included</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{quote.serviceDescription}</p></section>

        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500"><th className="py-3">Work item</th><th className="py-3 text-right">Estimated hours</th><th className="py-3 text-right">Rate ex GST</th><th className="py-3 text-right">Amount ex GST</th></tr></thead>
            <tbody>
              {quote.lines.map((line) => <tr key={line.id} className="border-b"><td className="py-4 pr-4">{line.description}</td><td className="py-4 text-right">{line.estimatedHours}</td><td className="py-4 text-right">{money(line.chargeOutRateExGst)}</td><td className="py-4 text-right">{money(line.lineTotalExGst)}</td></tr>)}
              {quote.consumablesSellAmount > 0 ? (
                <tr className="border-b">
                  <td className="py-4 pr-4">Supplies allowance{quote.cleanTypeLabel ? ` — ${quote.cleanTypeLabel}` : ""}</td>
                  <td className="py-4 text-right">—</td>
                  <td className="py-4 text-right">—</td>
                  <td className="py-4 text-right">{money(quote.consumablesSellAmount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-2 text-sm"><dt className="text-slate-600">Subtotal</dt><dd className="text-right">{money(quote.subtotalExGst)}</dd><dt className="text-slate-600">GST</dt><dd className="text-right">{money(quote.gstAmount)}</dd><dt className="border-t pt-3 text-base font-bold">Total AUD</dt><dd className="border-t pt-3 text-right text-base font-bold">{money(quote.totalIncGst)}</dd></dl>

        <footer className="mt-8 border-t pt-6 text-sm"><p className="font-semibold">Payment terms</p><p className="mt-1 text-slate-600">{quote.paymentTerms}</p>{!invoiceDocument ? <p className="mt-5 text-xs text-slate-500">Acceptance confirms that the customer agrees to the work, price and terms shown in this quote.</p> : null}</footer>
      </article>
    </div>
  );
}
