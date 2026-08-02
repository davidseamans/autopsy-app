import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStage1Funnel, type Stage1QuoteSummary } from "@/lib/stage1Funnel";

const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function Stage1Quotes() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const first5JobsPath = runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  const quotePath = runId ? `/stage-1/quotes/new?runId=${encodeURIComponent(runId)}` : "/stage-1/quotes/new";
  const [quotes, setQuotes] = useState<Stage1QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    quotes: quotes.length,
    accepted: quotes.filter((quote) => quote.status === "accepted").length,
    jobs: quotes.filter((quote) => Boolean(quote.jobId)).length,
  }), [quotes]);

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

      <div className="grid grid-cols-3 gap-3">
        <FunnelCount label="Quotes" value={counts.quotes} />
        <FunnelCount label="Accepted" value={counts.accepted} />
        <FunnelCount label="Jobs" value={counts.jobs} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Written quotes</CardTitle><CardDescription>Open a quote to print it, record acceptance and create the job.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {quotes.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No quotes yet. Create one when an opportunity is ready for a written price.</p> : quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} runId={runId} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelCount({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>;
}

function QuoteRow({ quote, runId }: { quote: Stage1QuoteSummary; runId: string }) {
  const documentPath = `/stage-1/quote/${quote.id}?runId=${encodeURIComponent(runId)}`;
  const status = quote.status === "accepted" ? "Accepted" : quote.status === "sent" ? "Sent" : quote.status.charAt(0).toUpperCase() + quote.status.slice(1);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{quote.number} · {quote.clientName}</p><Badge variant="outline">{status}</Badge></div>
        <p className="text-sm text-muted-foreground">{money(quote.totalIncGst)} · {new Date(quote.issuedAt).toLocaleDateString("en-AU")}</p>
      </div>
      <Button asChild variant="outline" size="sm"><Link to={documentPath}>Open quote <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
  );
}
