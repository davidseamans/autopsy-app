import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStage1Funnel, type Stage1QuoteSummary } from "@/lib/stage1Funnel";
import { acceptStage1Quote, describeDocumentError, setStage1QuoteRejected } from "@/lib/stage1Documents";
import { toast } from "@/components/ui/sonner";

const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
type QuoteFilter = "outstanding" | "rejected" | "accepted";
const isRejected = (status: string) => ["rejected", "declined", "expired"].includes(status.toLowerCase());
const quoteBucket = (quote: Stage1QuoteSummary): QuoteFilter => quote.status === "accepted" ? "accepted" : isRejected(quote.status) ? "rejected" : "outstanding";

export default function Stage1Quotes() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const first5JobsPath = runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  const quotePath = runId ? `/stage-1/quotes/new?runId=${encodeURIComponent(runId)}` : "/stage-1/quotes/new";
  const [quotes, setQuotes] = useState<Stage1QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuoteFilter>("outstanding");
  const [workingQuoteId, setWorkingQuoteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!runId) {
      setError("Open Quotes from your First 5 Jobs page.");
      setLoading(false);
      return;
    }
    try {
      const snapshot = await loadStage1Funnel(runId);
      setQuotes(snapshot.quotes);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    sent: quotes.length,
    outstanding: quotes.filter((quote) => quoteBucket(quote) === "outstanding").length,
    rejected: quotes.filter((quote) => quoteBucket(quote) === "rejected").length,
    accepted: quotes.filter((quote) => quote.status === "accepted").length,
  }), [quotes]);
  const filteredQuotes = useMemo(() => quotes.filter((quote) => quoteBucket(quote) === filter), [filter, quotes]);

  async function changeStatus(quote: Stage1QuoteSummary, next: QuoteFilter) {
    if (workingQuoteId || quoteBucket(quote) === next) return;
    setWorkingQuoteId(quote.id);
    try {
      if (next === "accepted") {
        const job = await acceptStage1Quote(quote.id);
        toast.success(`${quote.number} accepted and converted to ${job.jobNumber}.`);
      } else {
        await setStage1QuoteRejected(quote.id, next === "rejected");
        toast.success(`${quote.number} marked ${next}.`);
      }
      await refresh();
      setFilter(next);
    } catch (statusError) {
      toast.error(describeDocumentError(statusError));
    } finally {
      setWorkingQuoteId(null);
    }
  }

  if (loading) {
    return <div className="container max-w-5xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…</div>;
  }

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={first5JobsPath}><ArrowLeft className="mr-1 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Quotes</p>
          <h1 className="text-3xl font-semibold tracking-tight">Quotes</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Customer and work details begin here. An accepted quote becomes a First 5 Jobs job.</p>
        </div>
        <Button asChild><Link to={quotePath}><Plus className="mr-2 h-4 w-4" /> Create a quote</Link></Button>
      </header>

      {error ? <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Quotes sent: {counts.sent}</span> from the start of First 5 Jobs.</p>
      <div className="grid grid-cols-3 gap-3">
        <FunnelCount label="Outstanding" value={counts.outstanding} active={filter === "outstanding"} onClick={() => setFilter("outstanding")} />
        <FunnelCount label="Rejected" value={counts.rejected} active={filter === "rejected"} onClick={() => setFilter("rejected")} />
        <FunnelCount label="Accepted" value={counts.accepted} active={filter === "accepted"} onClick={() => setFilter("accepted")} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> {filter.charAt(0).toUpperCase() + filter.slice(1)} quotes</CardTitle><CardDescription>Change the status here, or open a quote to print it and review the detail.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {filteredQuotes.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No {filter} quotes.</p> : filteredQuotes.map((quote) => <QuoteRow key={quote.id} quote={quote} runId={runId} working={workingQuoteId === quote.id} onStatusChange={(next) => void changeStatus(quote, next)} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelCount({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-left"><Card className={active ? "border-primary ring-1 ring-primary" : "transition-colors hover:border-primary/50"}><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card></button>;
}

function QuoteRow({ quote, runId, working, onStatusChange }: { quote: Stage1QuoteSummary; runId: string; working: boolean; onStatusChange: (status: QuoteFilter) => void }) {
  const documentPath = `/stage-1/quote/${quote.id}?runId=${encodeURIComponent(runId)}`;
  const status = quoteBucket(quote);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{quote.number} · {quote.clientName}</p><select aria-label={`Status for ${quote.number}`} value={status} disabled={working || status === "accepted"} onChange={(event) => onStatusChange(event.target.value as QuoteFilter)} className="h-8 rounded-md border bg-background px-2 text-xs font-medium"><option value="outstanding">Outstanding</option><option value="rejected">Rejected</option><option value="accepted">Accepted — create job</option></select>{working ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div>
        <p className="text-sm text-muted-foreground">{money(quote.totalIncGst)} · {new Date(quote.issuedAt).toLocaleDateString("en-AU")}</p>
      </div>
      <Button asChild variant="outline" size="sm"><Link to={documentPath}>Open quote <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
  );
}
