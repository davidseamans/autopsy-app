import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { createStage1Lead, loadStage1Leads, type Stage1Lead } from "@/lib/stage1Funnel";

const sourceOptions = ["Referral", "Past customer", "Walk-in conversation", "Phone outreach", "Flyer", "Website", "Social media", "Other"];
const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export default function LaunchpadLeads() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const launchpadPath = runId ? `/launchpad?runId=${encodeURIComponent(runId)}` : "/launchpad";
  const [leads, setLeads] = useState<Stage1Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [source, setSource] = useState(sourceOptions[0]);
  const [estimatedValue, setEstimatedValue] = useState(0);
  const [nextActionAt, setNextActionAt] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    if (!runId) {
      setError("Open the lead funnel from your First 5 Jobs Launchpad.");
      setLoading(false);
      return;
    }
    try {
      setLeads(await loadStage1Leads(runId));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    new: leads.filter((lead) => lead.status === "new").length,
    quoted: leads.filter((lead) => lead.status === "quoted").length,
    won: leads.filter((lead) => lead.status === "won").length,
    lost: leads.filter((lead) => lead.status === "lost").length,
  }), [leads]);

  async function saveLead() {
    if (!runId || !clientName.trim() || saving) return;
    setSaving(true);
    try {
      await createStage1Lead({
        runId, clientName, contactName, contactEmail, contactPhone, siteAddress,
        source, estimatedValue, nextActionAt, notes,
      });
      toast.success("Lead added to your funnel.");
      setClientName(""); setContactName(""); setContactEmail(""); setContactPhone("");
      setSiteAddress(""); setEstimatedValue(0); setNextActionAt(""); setNotes("");
      setShowForm(false);
      await refresh();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="container max-w-5xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading lead funnel…</div>;
  }

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={launchpadPath}><ArrowLeft className="mr-1 h-4 w-4" /> Back to Launchpad</Link></Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Lead Funnel</p>
          <h1 className="text-3xl font-semibold tracking-tight">Turn opportunities into jobs</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Record the opportunity first. The quote and job will stay attached to it, so you can see where work comes from and what converts.</p>
        </div>
        <Button onClick={() => setShowForm((current) => !current)}><Plus className="mr-2 h-4 w-4" /> Add a lead</Button>
      </header>

      {error ? <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FunnelCount label="New" value={counts.new} />
        <FunnelCount label="Quoted" value={counts.quoted} />
        <FunnelCount label="Won" value={counts.won} />
        <FunnelCount label="Lost" value={counts.lost} />
      </div>

      {showForm ? (
        <Card>
          <CardHeader><CardTitle className="text-base">New lead</CardTitle><CardDescription>Capture enough to follow up. You can complete the service detail in the quote.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="lead-client" label="Customer or prospect" value={clientName} onChange={setClientName} required />
            <Field id="lead-contact" label="Contact person" value={contactName} onChange={setContactName} />
            <Field id="lead-email" label="Email" type="email" value={contactEmail} onChange={setContactEmail} />
            <Field id="lead-phone" label="Phone" value={contactPhone} onChange={setContactPhone} />
            <div className="space-y-1.5"><Label htmlFor="lead-source">How did they find you?</Label><select id="lead-source" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={source} onChange={(event) => setSource(event.target.value)}>{sourceOptions.map((option) => <option key={option}>{option}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="lead-value">Rough job value</Label><Input id="lead-value" type="number" min={0} step="1" value={estimatedValue} onChange={(event) => setEstimatedValue(Number(event.target.value))} /></div>
            <Field id="lead-next" label="Next follow-up" type="datetime-local" value={nextActionAt} onChange={setNextActionAt} />
            <Field id="lead-site" label="Likely service address" value={siteAddress} onChange={setSiteAddress} />
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="lead-notes">What do they need?</Label><Textarea id="lead-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={() => void saveLead()} disabled={!clientName.trim() || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save lead</Button></div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Your opportunities</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {leads.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No leads yet. Add the first opportunity before writing a quote.</p> : leads.map((lead) => <LeadRow key={lead.id} lead={lead} runId={runId} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelCount({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>;
}

function LeadRow({ lead, runId }: { lead: Stage1Lead; runId: string }) {
  const quotePath = `/launchpad/quote/new?runId=${encodeURIComponent(runId)}&leadId=${encodeURIComponent(lead.id)}`;
  const documentPath = lead.activeQuoteId ? `/stage-1/quote/${lead.activeQuoteId}?runId=${encodeURIComponent(runId)}` : "";
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{lead.clientName}</p><Badge variant="outline">{lead.status === "new" ? "New" : lead.status === "quoted" ? "Quoted" : lead.status === "won" ? "Won" : "Lost"}</Badge></div>
        <p className="text-sm text-muted-foreground">{lead.source}{lead.contactName ? ` · ${lead.contactName}` : ""}{lead.estimatedValue > 0 ? ` · ${money(lead.estimatedValue)}` : ""}</p>
        {lead.nextActionAt ? <p className="text-xs text-muted-foreground">Follow up: {new Date(lead.nextActionAt).toLocaleString("en-AU")}</p> : null}
      </div>
      <div className="shrink-0">
        {lead.status === "quoted" && documentPath ? <Button asChild variant="outline" size="sm"><Link to={documentPath}>Open {lead.activeQuoteNumber ?? "quote"} <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
          : lead.status === "won" && documentPath ? <Button asChild variant="outline" size="sm"><Link to={documentPath}>View job chain <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
          : <Button asChild size="sm"><Link to={quotePath}>{lead.status === "lost" ? "Create new quote" : "Create quote"} <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, type = "text", required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}
