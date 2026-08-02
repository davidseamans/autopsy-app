import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { fetchBusinessIdentity, type PublicBusinessProfile } from "@/lib/businessIdentity";
import {
  createStandardQuote,
  describeDocumentError,
  fetchStage1CleanTypePricingRules,
  type QuoteLineDraft,
  type Stage1CleanTypePricingRule,
} from "@/lib/stage1Documents";
import { calculateGuidedQuoteTotals } from "@/lib/stage1Pricing";

const isoAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const blankLine = (): QuoteLineDraft => ({ description: "", estimatedHours: 1 });
const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function Stage1QuoteNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const backTo = runId ? `/stage-1/quotes?runId=${encodeURIComponent(runId)}` : "/stage-1/quotes";
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientContactName, setClientContactName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [validUntil, setValidUntil] = useState(isoAfterDays(14));
  const [paymentTerms, setPaymentTerms] = useState("Payment Due on Completion");
  const [cleanTypeCode, setCleanTypeCode] = useState("");
  const [cleanTypeRules, setCleanTypeRules] = useState<Stage1CleanTypePricingRule[]>([]);
  const [chargeOutRateExGst, setChargeOutRateExGst] = useState(0);
  const [items, setItems] = useState<QuoteLineDraft[]>([blankLine()]);

  useEffect(() => {
    if (!runId) {
      setError("Open the quote form from your First 5 Jobs sales activity page.");
      setLoading(false);
      return;
    }
    void Promise.all([fetchBusinessIdentity(runId), fetchStage1CleanTypePricingRules()])
      .then(([{ profile: current }, rules]) => {
        if (!current?.verified) throw new Error("Verify Business Details before creating a quote.");
        if (rules.length === 0) throw new Error("The guided clean types are not available.");
        setProfile(current);
        setCleanTypeRules(rules);
      })
      .catch((loadError) => setError(describeDocumentError(loadError)))
      .finally(() => setLoading(false));
  }, [runId]);

  const totals = useMemo(() => {
    const selectedRule = cleanTypeRules.find((rule) => rule.code === cleanTypeCode) ?? null;
    return {
      selectedRule,
      ...calculateGuidedQuoteTotals({ items, chargeOutRateExGst, rule: selectedRule }),
    };
  }, [chargeOutRateExGst, cleanTypeCode, cleanTypeRules, items]);

  const formReady = Boolean(
    profile?.verified && clientName.trim() && clientEmail.trim() && siteAddress.trim()
      && validUntil
      && totals.selectedRule
      && items.length > 0
      && items.every((item) => item.description.trim() && item.estimatedHours > 0)
      && chargeOutRateExGst > 0
      && totals.total > 0,
  );

  const updateLine = (index: number, patch: Partial<QuoteLineDraft>) => {
    setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  async function issueQuote() {
    if (!formReady || saving) return;
    setSaving(true);
    try {
      const created = await createStandardQuote({
        runId,
        clientName,
        clientContactName,
        clientEmail,
        clientPhone,
        siteAddress,
        serviceDescription: serviceDescription.trim()
          || items.map((item) => `${item.description.trim()} — ${item.estimatedHours} hours`).join("; "),
        validUntil,
        paymentTerms,
        cleanTypeCode,
        chargeOutRateExGst,
        items,
      });
      toast.success(`${created.quoteNumber} created.`);
      navigate(`/stage-1/quote/${created.quoteId}?runId=${encodeURIComponent(runId)}`);
    } catch (saveError) {
      toast.error(describeDocumentError(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="container max-w-4xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading quote form…</div>;
  }

  return (
    <div className="container max-w-4xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={backTo}><ArrowLeft className="mr-1 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Written Quote</p>
        <h1 className="text-3xl font-semibold tracking-tight">Create a standard quote</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Customer and work details begin here. If the customer accepts, this quote becomes the job and then the tax invoice.</p>
      </header>

      {error ? <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      {profile ? (
        <Card>
          <CardHeader><CardTitle className="text-base">From</CardTitle><CardDescription>Locked from your verified Business Details.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Business:</span> {profile.businessName}</p>
            <p><span className="text-muted-foreground">Registered:</span> {profile.registeredName}</p>
            <p><span className="text-muted-foreground">ABN:</span> {profile.abn}</p>
            <p><span className="text-muted-foreground">Contact:</span> {profile.contactName}</p>
            <p>{profile.email}</p><p>{profile.phone}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Customer and work</CardTitle><CardDescription>Capture these details because this opportunity is now ready to quote.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="client-name" label="Customer or business" value={clientName} onChange={setClientName} required />
          <Field id="client-contact" label="Contact person" value={clientContactName} onChange={setClientContactName} />
          <Field id="client-email" label="Customer email" type="email" value={clientEmail} onChange={setClientEmail} required />
          <Field id="client-phone" label="Customer phone" value={clientPhone} onChange={setClientPhone} />
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="site-address">Service address *</Label><Textarea id="site-address" value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="scope">Notes or exclusions (optional)</Label><Textarea id="scope" rows={3} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Add anything the customer should know. The work items and hours are added to the quote automatically." /></div>
          <Field id="valid-until" label="Quote valid until" type="date" value={validUntil} onChange={setValidUntil} required />
          <div className="space-y-1.5">
            <Label htmlFor="terms">Payment terms *</Label>
            <select
              id="terms"
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="Payment Due on Completion">Payment Due on Completion</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Choose the type of clean</CardTitle><CardDescription>Make one choice. First 5 Jobs will allow for the expected supplies automatically.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Type of clean">
          {cleanTypeRules.map((rule) => {
            const selected = cleanTypeCode === rule.code;
            return (
              <button
                key={`${rule.code}-${rule.ruleVersion}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`rounded-lg border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
                onClick={() => setCleanTypeCode(rule.code)}
              >
                <span className="block font-medium">{rule.label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{rule.guidance}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Estimate the work</CardTitle><CardDescription>Break the job into a few plain work items. Enter the hours you expect, then use one hourly charge-out rate for the whole quote.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="charge-out-rate">Your charge-out rate, ex GST *</Label>
            <Input id="charge-out-rate" type="number" min={0.01} step="0.01" value={chargeOutRateExGst} onChange={(event) => setChargeOutRateExGst(Number(event.target.value))} />
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_150px_42px]">
              <Field id={`line-${index}`} label="Work item" value={item.description} onChange={(value) => updateLine(index, { description: value })} />
              <NumberField id={`hours-${index}`} label="Estimated hours" value={item.estimatedHours} min={0.25} onChange={(value) => updateLine(index, { estimatedHours: value })} />
              <Button type="button" variant="ghost" size="icon" className="self-end" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove line ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, blankLine()])} disabled={items.length >= 20}><Plus className="mr-2 h-4 w-4" /> Add work item</Button>
          <dl className="ml-auto grid max-w-sm grid-cols-2 gap-2 border-t pt-4 text-sm">
            <dt className="text-muted-foreground">Estimated hours</dt><dd className="text-right">{totals.totalHours}</dd>
            <dt className="text-muted-foreground">Rate per hour ex GST</dt><dd className="text-right">{money(chargeOutRateExGst)}</dd>
            <dt className="text-muted-foreground">Cleaning service</dt><dd className="text-right">{money(totals.serviceAmount)}</dd>
            <dt className="text-muted-foreground">Supplies included</dt><dd className="text-right">{totals.selectedRule ? money(totals.consumablesSellAmount) : "Choose a clean type"}</dd>
            <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{money(totals.subtotal)}</dd>
            <dt className="text-muted-foreground">GST</dt><dd className="text-right">{money(totals.gst)}</dd>
            <dt className="font-semibold">Total including GST</dt><dd className="text-right font-semibold">{money(totals.total)}</dd>
          </dl>
          {totals.selectedRule ? (
            <p className="ml-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
              {totals.selectedRule.label}: First 5 Jobs has budgeted {money(totals.consumablesCost)} for supplies and included {money(totals.consumablesSellAmount)} in the quote. The supplies amount includes a {totals.selectedRule.targetConsumablesMarginPct}% margin.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end"><Button onClick={() => void issueQuote()} disabled={!formReady || saving || Boolean(error)}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create written quote</Button></div>
    </div>
  );
}

function Field({ id, label, value, onChange, type = "text", required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}

function NumberField({ id, label, value, min, onChange }: { id: string; label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label} *</Label><Input id={id} type="number" min={min} step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}
