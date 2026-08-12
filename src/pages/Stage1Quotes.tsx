import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createStage1LeadRecord, loadStage1Funnel, loadStage1LeadRecords, type Stage1LeadRecord, type Stage1QuoteSummary } from "@/lib/stage1Funnel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptStage1Quote, describeDocumentError, setStage1QuoteRejected } from "@/lib/stage1Documents";
import { toast } from "@/components/ui/sonner";
import { Stage1TourResume, Stage1WelcomeGuide } from "@/components/Stage1WelcomeGuide";
import { STAGE1_DEMO_QUOTES } from "@/lib/stage1Demo";

const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
type QuoteFilter = "all" | "outstanding" | "rejected" | "accepted";
const isRejected = (status: string) => ["rejected", "declined", "expired"].includes(status.toLowerCase());
const quoteBucket = (quote: Stage1QuoteSummary): QuoteFilter => quote.status === "accepted" ? "accepted" : isRejected(quote.status) ? "rejected" : "outstanding";

export default function Stage1Quotes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const isDemo = searchParams.get("demo") === "1";
  const first5JobsPath = isDemo ? "/stage-1?demo=1" : runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  const quotePath = runId ? `/stage-1/quotes/new?runId=${encodeURIComponent(runId)}` : "/stage-1/quotes/new";
  const quoteContactSeparator = quotePath.includes("?") ? "&" : "?";
  const [quotes, setQuotes] = useState<Stage1QuoteSummary[]>([]);
  const [contacts, setContacts] = useState<Stage1LeadRecord[]>([]);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [workingQuoteId, setWorkingQuoteId] = useState<string | null>(null);
  const tourActive = searchParams.get("tour") === "quotes";
  const tourAutoPlay = searchParams.get("autoplay") === "1";
  const tourStepParam = searchParams.get("step");
  const requestedTourStep = tourStepParam == null ? Number.NaN : Number(tourStepParam);
  const initialTourStep = Number.isInteger(requestedTourStep) && requestedTourStep >= 0 ? requestedTourStep : 0;
  const [tourStep, setTourStep] = useState(initialTourStep);
  const closeTour = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("tour");
    next.delete("step");
    next.delete("autoplay");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setQuotes(STAGE1_DEMO_QUOTES);
      setError(null);
      setLoading(false);
      return;
    }
    if (!runId) {
      setError("Open Quotes from your First 5 Jobs page.");
      setLoading(false);
      return;
    }
    try {
      const [snapshot, contactRows] = await Promise.all([loadStage1Funnel(runId), loadStage1LeadRecords(runId)]);
      setQuotes(snapshot.quotes);
      setContacts(contactRows);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [isDemo, runId]);

  useEffect(() => {
    if (!tourActive) return;
    if (tourStep === 2) setFilter("outstanding");
    if (tourStep === 3) setFilter("rejected");
    if (tourStep === 4) setFilter("accepted");
    if (tourStep >= 5) setFilter("outstanding");
  }, [tourActive, tourStep]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    sent: quotes.length,
    outstanding: quotes.filter((quote) => quoteBucket(quote) === "outstanding").length,
    rejected: quotes.filter((quote) => quoteBucket(quote) === "rejected").length,
    accepted: quotes.filter((quote) => quote.status === "accepted").length,
  }), [quotes]);
  const filteredQuotes = useMemo(
    () => filter === "all" ? quotes : quotes.filter((quote) => quoteBucket(quote) === filter),
    [filter, quotes],
  );

  async function changeStatus(quote: Stage1QuoteSummary, next: QuoteFilter) {
    if (isDemo) {
      toast.info("This is sample data. No status was changed.");
      return;
    }
    if (workingQuoteId || next === "all" || quoteBucket(quote) === next) return;
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

  async function saveContact() {
    if (!runId || !contactName.trim() || (!contactPhone.trim() && !contactEmail.trim())) return;
    try {
      await createStage1LeadRecord(runId, {
        client_name: contactName.trim(), contact_name: null,
        contact_email: contactEmail.trim() || null, contact_phone: contactPhone.trim() || null,
        site_address: null, source: "Contact", estimated_value: 0, next_action_at: null, notes: null,
      });
      setContactName(""); setContactPhone(""); setContactEmail(""); setShowContactForm(false);
      toast.success("Contact added to Potential quotes.");
      await refresh();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)); }
  }

  if (loading) {
    return <div className="container max-w-5xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…</div>;
  }

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={first5JobsPath}><ArrowLeft className="mr-1 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
      <header className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${tourActive && (tourStep === 0 || tourStep === 5) ? "relative z-40 rounded-xl ring-4 ring-sky-400 ring-offset-4" : ""}`}>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Quotes {isDemo ? "· Sample workspace" : ""}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Quotes</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Customer and work details begin here. An accepted quote becomes a First 5 Jobs job.</p>
        </div>
        {isDemo ? <Button type="button" onClick={() => toast.info("Jane is demonstrating the real quote workflow. Sample data cannot be changed.")}><Plus className="mr-2 h-4 w-4" /> Create a quote</Button> : <Button asChild><Link to={quotePath}><Plus className="mr-2 h-4 w-4" /> Create a quote</Link></Button>}
      </header>

      {error ? <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-base">Potential quotes</CardTitle><CardDescription className="mt-1">Capture only enough detail to arrange the appointment. Prepare the written quote after the site visit.</CardDescription></div>{!isDemo ? <Button type="button" size="sm" onClick={() => setShowContactForm((current) => !current)}><Plus className="mr-2 h-4 w-4" /> Add contact</Button> : null}</CardHeader>
        <CardContent className="space-y-3">
          {showContactForm ? <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3"><div className="space-y-1.5"><Label htmlFor="potential-name">Name *</Label><Input id="potential-name" value={contactName} onChange={(event) => setContactName(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="potential-phone">Phone</Label><Input id="potential-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="potential-email">Email</Label><Input id="potential-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div><div className="sm:col-span-3 flex justify-end"><Button type="button" onClick={() => void saveContact()} disabled={!contactName.trim() || (!contactPhone.trim() && !contactEmail.trim())}>Save potential quote</Button></div></div> : null}
          {contacts.filter((contact) => !["quoted", "won", "lost"].includes(contact.status)).map((contact) => <div key={contact.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{contact.client_name}</p><p className="text-sm text-muted-foreground">{[contact.contact_phone, contact.contact_email].filter(Boolean).join(" · ")}</p></div><Button asChild size="sm"><Link to={`${quotePath}${quoteContactSeparator}contactId=${encodeURIComponent(contact.id)}`}>Prepare quote <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button></div>)}
          {contacts.every((contact) => ["quoted", "won", "lost"].includes(contact.status)) ? <p className="py-4 text-center text-sm text-muted-foreground">No potential quotes waiting.</p> : null}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Written quotes: {counts.sent}</span> from the start of First 5 Jobs. The selected panel controls the register below.</p>
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${tourActive && tourStep === 1 ? "relative z-40 rounded-xl ring-4 ring-sky-400 ring-offset-4" : ""}`}>
        <FunnelCount label="All written quotes" value={counts.sent} active={filter === "all"} onClick={() => setFilter("all")} />
        <FunnelCount label="Outstanding" value={counts.outstanding} active={filter === "outstanding"} highlighted={tourActive && tourStep === 2} onClick={() => setFilter("outstanding")} />
        <FunnelCount label="Rejected" value={counts.rejected} active={filter === "rejected"} highlighted={tourActive && tourStep === 3} onClick={() => setFilter("rejected")} />
        <FunnelCount label="Accepted" value={counts.accepted} active={filter === "accepted"} highlighted={tourActive && tourStep === 4} onClick={() => setFilter("accepted")} />
      </div>

      <Card className={tourActive && tourStep === 5 ? "relative z-40 ring-4 ring-sky-400 ring-offset-4" : ""}>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> {filter === "all" ? "All written quotes" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} quotes`}</CardTitle><CardDescription>Showing {filteredQuotes.length} of {counts.sent}. Change the status here, or open a quote to print it and review the detail.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {filteredQuotes.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No {filter} quotes.</p> : filteredQuotes.map((quote) => <QuoteRow key={quote.id} quote={quote} runId={runId} isDemo={isDemo} working={workingQuoteId === quote.id} onStatusChange={(next) => void changeStatus(quote, next)} />)}
        </CardContent>
      </Card>
      {tourActive ? <Stage1WelcomeGuide mode="quotes" initialStep={initialTourStep} autoPlay={tourAutoPlay} onClose={closeTour} onStepChange={setTourStep} onJourneyBack={() => window.location.assign("/stage-1?demo=1&tour=1&step=2&autoplay=1")} onJourneyAction={() => { window.location.assign(isDemo ? "/stage-1/quotes/new?demo=1&tour=builder&autoplay=1" : `${quotePath}${quotePath.includes("?") ? "&" : "?"}tour=builder&autoplay=1`); }} /> : null}
      {isDemo && !tourActive ? <Stage1TourResume onClick={() => { const next = new URLSearchParams(searchParams); next.set("tour", "quotes"); setSearchParams(next); }} /> : null}
    </div>
  );
}

function FunnelCount({ label, value, active, highlighted, onClick }: { label: string; value: number; active: boolean; highlighted?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`text-left ${highlighted ? "relative z-40 rounded-xl ring-4 ring-sky-400 ring-offset-4" : ""}`}><Card className={active ? "border-primary ring-1 ring-primary" : "transition-colors hover:border-primary/50"}><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card></button>;
}

function QuoteRow({ quote, runId, isDemo, working, onStatusChange }: { quote: Stage1QuoteSummary; runId: string; isDemo: boolean; working: boolean; onStatusChange: (status: Exclude<QuoteFilter, "all">) => void }) {
  const documentPath = isDemo ? `/stage-1/quote/${quote.id}?demo=1` : `/stage-1/quote/${quote.id}?runId=${encodeURIComponent(runId)}`;
  const status = quoteBucket(quote);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{quote.number} · {quote.clientName}</p><select aria-label={`Status for ${quote.number}`} value={status} disabled={isDemo || working || status === "accepted"} onChange={(event) => onStatusChange(event.target.value as Exclude<QuoteFilter, "all">)} className="h-8 rounded-md border bg-background px-2 text-xs font-medium"><option value="outstanding">Outstanding</option><option value="rejected">Rejected</option><option value="accepted">Accepted — create job</option></select>{working ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div>
        <p className="text-sm text-muted-foreground">{money(quote.totalIncGst)} · {new Date(quote.issuedAt).toLocaleDateString("en-AU")}</p>
      </div>
      <Button asChild variant="outline" size="sm"><Link to={documentPath}>Open quote <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
  );
}
