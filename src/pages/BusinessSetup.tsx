import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { isValidAbnChecksum, normalizeAbn, formatAbn } from "@/lib/abn";
import { lookupAbr, type AbrLookupResult } from "@/lib/abrLookup";
import {
  isBusinessVerified,
  writeIdentityAudit,
  fetchIdentityAudit,
  type IdentityAuditRow,
} from "@/lib/businessIdentity";

type FormState = {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  abn: string;
};

const empty: FormState = {
  business_name: "",
  contact_name: "",
  phone: "",
  email: "",
  abn: "",
};

const REQUIRED: (keyof FormState)[] = ["business_name", "contact_name", "phone", "email", "abn"];

export default function BusinessSetup() {
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);

  // ABN verification state
  const [abnChecksumValid, setAbnChecksumValid] = useState<boolean | null>(null);
  const [abnError, setAbnError] = useState<string | null>(null);
  const [abr, setAbr] = useState<AbrLookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Originals for audit comparison + saved-verified status
  const [orig, setOrig] = useState<{ business_name: string; abn: string } | null>(null);
  const [savedVerified, setSavedVerified] = useState(false);
  const [history, setHistory] = useState<IdentityAuditRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("business_identity_profile")
        .select("*")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setRowId((data as any).id ?? null);
        setForm({
          business_name: data.business_name ?? "",
          contact_name: data.contact_name ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          abn: data.abn ?? "",
        });
        setOrig({ business_name: data.business_name ?? "", abn: data.abn ?? "" });
        setAbnChecksumValid(
          typeof data.abn_checksum_valid === "boolean" ? data.abn_checksum_valid : null,
        );
        if (data.abr_entity_status || data.abr_registered_name) {
          setAbr({
            abn: data.abn ?? "",
            registeredName: data.abr_registered_name ?? "",
            entityStatus: data.abr_entity_status ?? "",
            gstRegistered: !!data.abr_gst_registered,
            verifiedAt: data.abr_verified_at ?? "",
            simulated: true,
          });
        }
        setSavedVerified(isBusinessVerified(data as any));
        const pid = (data as any).id;
        if (pid) setHistory(await fetchIdentityAudit(pid));
      }
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Reset ABR verification whenever the ABN text changes.
  function onAbnChange(v: string) {
    set("abn", v);
    setAbnChecksumValid(null);
    setAbnError(null);
    setAbr(null);
  }

  async function onAbnBlur() {
    const digits = normalizeAbn(form.abn);
    if (!digits) {
      setAbnChecksumValid(null);
      setAbnError(null);
      setAbr(null);
      return;
    }
    // Step 1 — checksum
    const ok = isValidAbnChecksum(digits);
    setAbnChecksumValid(ok);
    if (!ok) {
      setAbnError("Invalid ABN. Please check the ABN and try again.");
      setAbr(null);
      return;
    }
    setAbnError(null);
    set("abn", formatAbn(digits));
    // Step 2 — ABR lookup (simulated)
    setLookingUp(true);
    try {
      const result = await lookupAbr(digits);
      setAbr(result);
    } catch {
      setAbr(null);
      setAbnError("ABR lookup failed. Please try again.");
    } finally {
      setLookingUp(false);
    }
  }

  const missing = REQUIRED.filter((k) => !String(form[k] ?? "").trim());
  const entityActive = !!abr && abr.entityStatus.toLowerCase() === "active";
  const gstRegistered = !!abr && abr.gstRegistered;

  const canSave =
    missing.length === 0 &&
    abnChecksumValid === true &&
    !!abr &&
    entityActive &&
    gstRegistered &&
    !lookingUp;

  async function handleSave() {
    if (!canSave || !abr) {
      toast.error("Complete all required fields and verify an active, GST-registered ABN.");
      return;
    }
    setSaving(true);
    const payload: any = {
      business_name: form.business_name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      abn: form.abn,
      abn_checksum_valid: true,
      abr_registered_name: abr.registeredName,
      abr_entity_status: abr.entityStatus,
      abr_gst_registered: abr.gstRegistered,
      abr_verified_at: abr.verifiedAt,
    };
    if (rowId) payload.id = rowId;

    const { data, error } = await supabase
      .from("business_identity_profile")
      .upsert(payload)
      .select()
      .maybeSingle();

    if (error) {
      setSaving(false);
      toast.error(`Save failed: ${error.message}`);
      return;
    }

    const newId = data?.id ?? rowId;
    if (data?.id) setRowId(data.id);

    // Audit: record changes to business_name / abn against the previous values.
    if (newId && orig) {
      if (orig.business_name && orig.business_name !== form.business_name) {
        await writeIdentityAudit(newId, "business_name", orig.business_name, form.business_name);
      }
      if (orig.abn && normalizeAbn(orig.abn) !== normalizeAbn(form.abn)) {
        await writeIdentityAudit(newId, "abn", orig.abn, form.abn);
      }
    }

    setOrig({ business_name: form.business_name, abn: form.abn });
    setSavedVerified(true);
    if (newId) setHistory(await fetchIdentityAudit(newId));
    setSaving(false);
    toast.success("✓ Business Details Verified");
  }

  if (loading) {
    return (
      <div className="container max-w-2xl py-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading business details…
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Business Details Control Centre
        </p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-semibold tracking-tight">Business Details</h1>
          <StatusIndicator verified={savedVerified} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your verified commercial identity. Business Details must be complete and verified before
          customer-facing quotes can be issued. This screen stays available for future edits.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business identity</CardTitle>
          <CardDescription>All fields are required. No partial save.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="business_name" label="Business Name" required value={form.business_name} onChange={(v) => set("business_name", v)} />
          <Field id="contact_name" label="Contact Name" required value={form.contact_name} onChange={(v) => set("contact_name", v)} />
          <Field id="phone" label="Phone" required value={form.phone} onChange={(v) => set("phone", v)} />
          <Field id="email" label="Email" required type="email" value={form.email} onChange={(v) => set("email", v)} />

          {/* ABN field spans full width with its verification block */}
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="abn">
              ABN <span className="text-destructive">*</span>
            </Label>
            <Input
              id="abn"
              value={form.abn}
              inputMode="numeric"
              placeholder="11 222 333 444"
              onChange={(e) => onAbnChange(e.target.value)}
              onBlur={onAbnBlur}
              aria-invalid={abnChecksumValid === false}
            />

            {lookingUp && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking the Australian Business Register…
              </p>
            )}

            {abnError && (
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <XCircle className="h-4 w-4" /> {abnError}
              </p>
            )}

            {abr && !lookingUp && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> ABN Verified
                  {abr.simulated && (
                    <Badge variant="outline" className="ml-1 text-amber-700 border-amber-300 bg-amber-50">
                      DEV / SIMULATED
                    </Badge>
                  )}
                </div>
                <ResultRow label="Registered Name" value={abr.registeredName} ok />
                <ResultRow
                  label="Entity Status"
                  value={abr.entityStatus}
                  ok={entityActive}
                />
                <ResultRow
                  label="GST Status"
                  value={abr.gstRegistered ? "Registered" : "Not registered"}
                  ok={gstRegistered}
                />
                {abr.simulated && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Simulated result for development only — not production verification.
                  </p>
                )}
              </div>
            )}

            {abr && !entityActive && (
              <p className="text-sm font-medium text-destructive">Business entity is not active.</p>
            )}
            {abr && entityActive && !gstRegistered && (
              <p className="text-sm font-medium text-destructive">
                GST registration is required to use First 5 Jobs.
              </p>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              First 5 Jobs is designed for operators building a genuine commercial business. Your ABN
              must be active and registered for GST before you can issue quotes through this system.
            </p>
          </div>
        </CardContent>
      </Card>

      {!canSave && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <CardTitle className="text-sm text-amber-900">Business Details Incomplete</CardTitle>
              <CardDescription className="mt-1 text-amber-800/90">
                Your business details have not been saved. Complete all required fields and verify an
                active GST-registered ABN before continuing.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {canSave ? "All checks passed — ready to save." : "Save unlocks when every check passes."}
        </p>
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <ShieldCheck className="h-4 w-4 mr-1" /> Save Business Details
        </Button>
      </div>
    </div>
  );
}

function StatusIndicator({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-transparent text-sm py-1 px-3">
        <CheckCircle2 className="h-4 w-4" /> Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 text-sm py-1 px-3">
      <AlertTriangle className="h-4 w-4" /> Setup Required
    </Badge>
  );
}

function ResultRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${ok ? "text-foreground" : "text-destructive"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
