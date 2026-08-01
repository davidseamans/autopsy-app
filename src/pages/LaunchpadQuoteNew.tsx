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
import { createStandardQuote, describeDocumentError, type QuoteLineDraft } from "@/lib/stage1Documents";

const isoAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const blankLine = (): QuoteLineDraft => ({ description: "", quantity: 1, unitPriceExGst: 0 });
const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function LaunchpadQuoteNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const backTo = runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
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
  const [paymentTerms, setPaymentTerms] = useState("Payment due within 7 days of invoice.");
  const [items, setItems] = useState<QuoteLineDraft[]>([blankLine()]);

  useEffect(() => {
    if (!runId) {
      setError("Open New Quote from your First 5 Jobs dashboard.");
      setLoading(false);
      return;
    }
    void fetchBusinessIdentity(runId)
      .then(({ profile: current }) => {
        if (!current?.verified) throw new Error("Verify Business Details before creating a quote.");
        setProfile(current);
      })
      .catch((loadError) => setError(describeDocumentError(loadError)))
      .finally(() => setLoading(false));
  }, [runId]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceExGst, 0);
    const gst = Math.round(subtotal * 10) / 100;
    return { subtotal, gst, total: subtotal + gst };
  }, [items]);

  const formReady = Boolean(
    profile?.verified && clientName.trim() && clientEmail.trim() && siteAddress.trim()
      && serviceDescription.trim() && validUntil
      && items.length > 0
      && items.every((item) => item.description.trim() && item.quantity > 0 && item.unitPriceExGst >= 0)
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
        serviceDescription,
        validUntil,
        paymentTerms,
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
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Give the customer a clear written scope and price. If they accept, this exact quote becomes the job and then the tax invoice.</p>
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
        <CardHeader><CardTitle className="text-base">Customer and work</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="client-name" label="Customer or business" value={clientName} onChange={setClientName} required />
          <Field id="client-contact" label="Contact person" value={clientContactName} onChange={setClientContactName} />
          <Field id="client-email" label="Customer email" type="email" value={clientEmail} onChange={setClientEmail} required />
          <Field id="client-phone" label="Customer phone" value={clientPhone} onChange={setClientPhone} />
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="site-address">Service address *</Label><Textarea id="site-address" value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="scope">Work included *</Label><Textarea id="scope" rows={5} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Describe exactly what you will do, where, and any important exclusions." /></div>
          <Field id="valid-until" label="Quote valid until" type="date" value={validUntil} onChange={setValidUntil} required />
          <Field id="terms" label="Payment terms" value={paymentTerms} onChange={setPaymentTerms} required />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Price</CardTitle><CardDescription>Enter prices before GST. GST and the customer total are calculated automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_110px_150px_42px]">
              <Field id={`line-${index}`} label="Description" value={item.description} onChange={(value) => updateLine(index, { description: value })} />
              <NumberField id={`quantity-${index}`} label="Quantity" value={item.quantity} min={0.01} onChange={(value) => updateLine(index, { quantity: value })} />
              <NumberField id={`price-${index}`} label="Price ex GST" value={item.unitPriceExGst} min={0} onChange={(value) => updateLine(index, { unitPriceExGst: value })} />
              <Button type="button" variant="ghost" size="icon" className="self-end" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove line ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, blankLine()])} disabled={items.length >= 20}><Plus className="mr-2 h-4 w-4" /> Add line</Button>
          <dl className="ml-auto grid max-w-sm grid-cols-2 gap-2 border-t pt-4 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{money(totals.subtotal)}</dd>
            <dt className="text-muted-foreground">GST</dt><dd className="text-right">{money(totals.gst)}</dd>
            <dt className="font-semibold">Total including GST</dt><dd className="text-right font-semibold">{money(totals.total)}</dd>
          </dl>
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
