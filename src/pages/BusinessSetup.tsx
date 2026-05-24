import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Loader2, ShieldCheck } from "lucide-react";

type FormState = {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  abn: string;
  gst_registered_confirmed: boolean;
  bank_account_name: string;
  bsb: string;
  account_number: string;
  logo_url: string;
};

const empty: FormState = {
  business_name: "",
  contact_name: "",
  phone: "",
  email: "",
  abn: "",
  gst_registered_confirmed: false,
  bank_account_name: "",
  bsb: "",
  account_number: "",
  logo_url: "",
};

const REQUIRED: (keyof FormState)[] = [
  "business_name",
  "contact_name",
  "phone",
  "email",
  "abn",
  "bank_account_name",
  "bsb",
  "account_number",
];

export default function BusinessSetup() {
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);

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
          gst_registered_confirmed: !!data.gst_registered_confirmed,
          bank_account_name: data.bank_account_name ?? "",
          bsb: data.bsb ?? "",
          account_number: data.account_number ?? "",
          logo_url: data.logo_url ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const missing = REQUIRED.filter((k) => !String(form[k] ?? "").trim());
  const canSave = missing.length === 0 && !!form.gst_registered_confirmed;

  async function handleSave() {
    if (!canSave) {
      toast.error("Complete all required fields and confirm GST status.");
      return;
    }
    setSaving(true);
    const payload: any = { ...form, logo_url: form.logo_url || null };
    if (rowId) payload.id = rowId;
    const { data, error } = await supabase
      .from("business_identity_profile")
      .upsert(payload)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    if (data?.id) setRowId(data.id);
    toast.success("Business identity saved.");
  }

  if (loading) {
    return (
      <div className="container max-w-3xl py-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Business Identity Gate</p>
        <h1 className="text-3xl font-semibold tracking-tight">Business Setup</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is the identity gate for everything downstream. Quotes, jobs, and the First 5 Jobs Dashboard
          all assume these details are present and correct.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business details</CardTitle>
          <CardDescription>Legal and contact identity for your business.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="business_name" label="Business name" required value={form.business_name} onChange={(v) => set("business_name", v)} />
          <Field id="contact_name" label="Contact name" required value={form.contact_name} onChange={(v) => set("contact_name", v)} />
          <Field id="phone" label="Phone" required value={form.phone} onChange={(v) => set("phone", v)} />
          <Field id="email" label="Email" required type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field id="abn" label="ABN" required value={form.abn} onChange={(v) => set("abn", v)} />
          <Field id="logo_url" label="Logo URL (optional)" value={form.logo_url} onChange={(v) => set("logo_url", v)} placeholder="https://…" />

          <div className="md:col-span-2 flex items-start gap-3 rounded-md border p-3 bg-muted/30">
            <Checkbox
              id="gst"
              checked={form.gst_registered_confirmed}
              onCheckedChange={(c) => set("gst_registered_confirmed", !!c)}
            />
            <div className="space-y-1">
              <Label htmlFor="gst" className="cursor-pointer">
                I confirm my GST registration status is correct
              </Label>
              <p className="text-xs text-muted-foreground">
                Required. Tick to confirm you have verified your GST status with the ATO.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Bank details
          </CardTitle>
          <CardDescription>Used on quotes and invoices for customer payments.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="bank_account_name" label="Account name" required value={form.bank_account_name} onChange={(v) => set("bank_account_name", v)} />
          <Field id="bsb" label="BSB" required value={form.bsb} onChange={(v) => set("bsb", v)} placeholder="000-000" />
          <Field id="account_number" label="Account number" required value={form.account_number} onChange={(v) => set("account_number", v)} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {canSave
            ? "All required fields complete."
            : `Missing: ${[...missing, ...(form.gst_registered_confirmed ? [] : ["gst_confirmation"])].join(", ")}`}
        </p>
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save business identity
        </Button>
      </div>
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
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}