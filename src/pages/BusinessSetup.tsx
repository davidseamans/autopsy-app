import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, History, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { formatAbn, isValidAbnChecksum, normalizeAbn } from "@/lib/abn";
import {
  fetchBusinessIdentity,
  updateBusinessName,
  verifyAndSaveBusinessIdentity,
  type IdentityAuditRow,
  type PublicBusinessProfile,
} from "@/lib/businessIdentity";

const ABN_APPLICATION_URL =
  "https://www.abr.gov.au/business-super-funds-charities/applying-abn";
const BUSINESS_NAME_REGISTRATION_URL = "https://australiabusinessnames.com.au/";

type FormState = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  abn: string;
};

const empty: FormState = { businessName: "", contactName: "", phone: "", email: "", abn: "" };

export default function BusinessSetup() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const returnTo = runId
    ? `/stage-1?runId=${encodeURIComponent(runId)}`
    : "/stage-1";
  const [form, setForm] = useState<FormState>(empty);
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [history, setHistory] = useState<IdentityAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setLoadError("Return to your First 5 Jobs page and open Business Details from there.");
      setLoading(false);
      return;
    }
    void fetchBusinessIdentity(runId)
      .then(({ profile: existing, history: audit }) => {
        setProfile(existing);
        setHistory(audit);
        if (existing) {
          setForm({
            businessName: existing.businessName ?? "",
            contactName: existing.contactName ?? "",
            phone: existing.phone ?? "",
            email: existing.email ?? "",
            abn: formatAbn(existing.abn ?? ""),
          });
        }
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, [runId]);

  const missing = Object.entries(form).filter(([, value]) => !value.trim()).map(([key]) => key);
  const checksumValid = isValidAbnChecksum(normalizeAbn(form.abn));
  const verified = profile?.verified === true;
  const businessNameChanged = form.businessName.trim() !== (profile?.businessName ?? "").trim();
  const canSave = verified
    ? Boolean(form.businessName.trim()) && businessNameChanged && !saving
    : missing.length === 0 && checksumValid && !saving;

  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!runId || !canSave) return;
    setSaving(true);
    try {
      const result = verified
        ? await updateBusinessName({ runId, businessName: form.businessName })
        : await verifyAndSaveBusinessIdentity({ runId, ...form });
      setProfile(result.profile);
      setForm((current) => ({ ...current, abn: formatAbn(result.profile.abn) }));
      toast.success(verified ? "Business name updated." : "Business Details verified with ABN Lookup.");
      const refreshed = await fetchBusinessIdentity(runId);
      setHistory(refreshed.history);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Business Details could not be verified.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="container max-w-2xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Business Details…</div>;
  }

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Business Details control centre</p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-semibold tracking-tight">Business Details</h1>
          {profile?.verified ? (
            <Badge className="gap-1.5 bg-emerald-600"><CheckCircle2 className="h-4 w-4" /> ABN verified</Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5"><AlertTriangle className="h-4 w-4" /> Setup required</Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Complete these details before you create quotes or record First 5 Jobs activity. BuildOS requires an active ABN and GST registration from day one so your records are ready for Core and QBO later.
        </p>
      </header>

      {loadError ? (
        <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your customer-facing business identity</CardTitle>
            <CardDescription>
              {verified
                ? "Your verified identity is locked. You may change only the business name shown to customers."
                : "All fields are required. Nothing is saved until the full check passes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="business-name" label="Business name shown to customers" value={form.businessName} onChange={(value) => set("businessName", value)} />
            <Field id="contact-name" label="Contact name" value={form.contactName} onChange={(value) => set("contactName", value)} disabled={verified} />
            <Field id="phone" label="Phone" value={form.phone} onChange={(value) => set("phone", value)} disabled={verified} />
            <Field id="email" label="Email" type="email" value={form.email} onChange={(value) => set("email", value)} disabled={verified} />
            <div className="space-y-2 md:col-span-2">
              <Field id="abn" label="ABN" value={form.abn} onChange={(value) => set("abn", value)} disabled={verified} />
              {form.abn.trim() && !checksumValid ? <p className="text-xs text-destructive">Check the ABN. It must be a valid 11-digit number.</p> : null}
            </div>

            {profile?.verified ? (
              <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" /> Verified registry result</p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Result label="Registered name" value={profile.registeredName} />
                  <Result label="Entity status" value={profile.entityStatus} />
                  <Result label="GST status" value={profile.gstRegistered ? "Registered" : "Not registered"} />
                  <Result label="Checked" value={profile.verifiedAt ? new Date(profile.verifiedAt).toLocaleString("en-AU") : "—"} />
                </dl>
              </div>
            ) : null}

            <p className="md:col-span-2 text-xs leading-5 text-muted-foreground">
              Active ABN and GST registration are BuildOS entry standards. They prepare the business to reclaim eligible GST, keep proper records, and move into Core and QBO without rebuilding its foundations.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline"><Link to={returnTo}>Back to First 5 Jobs</Link></Button>
        <Button onClick={() => void save()} disabled={!canSave || Boolean(loadError)} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {verified ? "Save business name" : "Save and verify ABN"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ABN and business name</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Use the official Australian Business Register application. Applying is free. The government service will explain eligibility and what information you need.</p>
          <Button asChild variant="outline"><a href={ABN_APPLICATION_URL} target="_blank" rel="noreferrer">Official ABN application guide <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
          <p className="text-xs">Return here after the ABN is active and its GST registration appears in ABN Lookup.</p>
          <p>You may trade under your own personal name—or all partners’ names for a partnership—without registering another business name. Any different customer-facing name must be registered.</p>
          <Button asChild variant="outline"><a href={BUSINESS_NAME_REGISTRATION_URL} target="_blank" rel="noreferrer">Register a business name <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
          <p className="text-xs">This link is a private registration service, not ASIC. Its service fee may be higher than registering directly with the government.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Standards before the first customer payment</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Open a separate business bank account. First 5 Jobs will use it to keep customer money and business spending separate before Core and QBO begin.</p>
          <p>Order a small first batch of business cards with an uncluttered back for handwritten notes. Opportunities do not arrive on a timetable.</p>
          <p>Buy only what the next booked job requires. Customers and completed work come before a branding or equipment spree.</p>
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Change history</CardTitle><CardDescription>Read-only changes to Business Name and ABN.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {history.map((entry) => <div key={entry.id} className="grid gap-1 border-b pb-3 last:border-0 sm:grid-cols-[1fr_1fr_1fr]"><span>{entry.field_name === "abn" ? "ABN" : "Business name"}</span><span className="text-muted-foreground">{entry.old_value || "—"} → {entry.new_value || "—"}</span><span className="text-muted-foreground sm:text-right">{new Date(entry.changed_at).toLocaleString("en-AU")}</span></div>)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ id, label, value, onChange, type = "text", disabled = false }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label} <span className="text-destructive">*</span></Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /></div>;
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-emerald-700">{label}</dt><dd className="text-right font-medium text-emerald-950">{value || "—"}</dd></div>;
}
