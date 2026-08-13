import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, MessageCircle, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/lib/auth";
import { fetchBusinessIdentity } from "@/lib/businessIdentity";
import { openHudsonDock } from "@/lib/hudsonDock";
import {
  fetchStage1Onboarding,
  saveStage1Onboarding,
  type AbnPath,
  type BusinessNamePath,
  type Stage1OnboardingProgress,
} from "@/lib/stage1Onboarding";

const ABN_URL = "https://www.abr.gov.au/business-super-funds-charities/applying-abn";
const ASIC_NAME_URL = "https://www.asic.gov.au/for-business-and-companies/business-names/register-a-business-name/how-to-register-a-business-name-with-asic/";
const PRIVATE_NAME_URL = "https://australiabusinessnames.com.au/";

const initialProgress: Stage1OnboardingProgress = {
  welcomeAcknowledged: false,
  abnPath: null,
  businessNamePath: null,
  operatingStandardsAcknowledged: false,
  completedAt: null,
};

export default function Stage1Orientation() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const runId = searchParams.get("runId") ?? "";
  const [progress, setProgress] = useState(initialProgress);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingHudson, setStartingHudson] = useState(false);
  const hudsonRequestId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setError("Return to First 5 Jobs and open the orientation from there.");
      setLoading(false);
      return;
    }
    void Promise.all([fetchStage1Onboarding(runId), fetchBusinessIdentity(runId)])
      .then(([saved, identity]) => {
        setProgress(saved);
        setBusinessVerified(identity.profile?.verified === true);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [runId]);

  const readyToSave = Boolean(
    progress.welcomeAcknowledged &&
      progress.abnPath &&
      progress.businessNamePath &&
      progress.operatingStandardsAcknowledged,
  );

  async function saveAndContinue() {
    if (!runId || !readyToSave) return;
    setSaving(true);
    try {
      const saved = await saveStage1Onboarding(runId, progress);
      setProgress(saved);
      toast.success("Orientation complete.");
      navigate(
        businessVerified
          ? `/stage-1?runId=${encodeURIComponent(runId)}`
          : `/business-setup?runId=${encodeURIComponent(runId)}`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Orientation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function startHudson() {
    if (!runId || !session?.access_token || startingHudson) return;
    setStartingHudson(true);
    try {
      hudsonRequestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/hudson/session-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId: hudsonRequestId.current, runId, mode: "first_5_jobs" }),
      });
      const payload = await response.json() as { conversationUrl?: string; error?: string };
      if (!response.ok || !payload.conversationUrl) throw new Error(payload.error || "Hudson could not start.");
      const requestId = hudsonRequestId.current;
      hudsonRequestId.current = null;
      openHudsonDock({ conversationUrl: payload.conversationUrl, runId, requestId });
      navigate(`/stage-1?runId=${encodeURIComponent(runId)}&tour=hudson&step=2`);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("start a new session")) hudsonRequestId.current = null;
      toast.error(cause instanceof Error ? cause.message : "Hudson could not start.");
    } finally {
      setStartingHudson(false);
    }
  }

  if (loading) {
    return <div className="container max-w-3xl py-12 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your orientation…</div>;
  }

  return (
    <main className="container max-w-3xl py-10 space-y-6">
      <Button asChild variant="ghost" className="-ml-3"><Link to={runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1"}><ArrowLeft className="mr-2 h-4 w-4" /> Back to First 5 Jobs</Link></Button>

      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">First 5 Jobs · orientation</p>
        <h1 className="text-3xl font-semibold tracking-tight">Before your first job</h1>
        <p className="text-muted-foreground">A short handover from Hudson, then choose the setup path that applies to you.</p>
      </header>

      {error ? <Card className="border-destructive/40"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      {!error ? <>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-emerald-900 p-2 text-white"><MessageCircle className="h-5 w-5" /></span>
              <div><CardTitle>Meet Hudson</CardTitle><CardDescription className="mt-1">Your conversational guide to the First 5 Jobs screen and six-week test.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>Hudson can explain the screen, ask questions, clarify your answers and help you practise. He cannot issue your Verdict, open a gate, accept payment, waive ABN or GST requirements, or alter authoritative records.</p>
            <Button type="button" onClick={startHudson} disabled={startingHudson || !session?.access_token} className="gap-2 bg-emerald-900 text-white hover:bg-emerald-800">
              {startingHudson ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {startingHudson ? "Opening Hudson…" : "Start a session with Hudson"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-sky-200 bg-sky-50/40">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-[#082849] p-2 text-white"><PlayCircle className="h-5 w-5" /></span>
              <div><CardTitle>Welcome from Hudson</CardTitle><CardDescription className="mt-1">Watch the guided handover or read the same words below.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>You have passed Autopsy because you are ready to test a real business. First 5 Jobs is a controlled six-week start—not a classroom exercise and not a full accounting system.</p>
            <p>Record how many leads you receive. Prepare a written quote when an opportunity is real. An accepted quote becomes a job and an invoice. Finish each job in the Job Cost Summary with the actual hours, costs, payments and any useful attachments.</p>
            <p>Keep it lean. Buy what booked work needs, learn from the figures, and complete five genuine jobs before adding complexity.</p>
            <Button asChild className="gap-2 bg-[#082849] text-white hover:bg-[#0b345c]"><Link to={`/stage-1?runId=${encodeURIComponent(runId)}&tour=1`}><PlayCircle className="h-4 w-4" /> Tour your actual First 5 Jobs screen</Link></Button>
            <CheckLine id="welcome" checked={progress.welcomeAcknowledged} onChange={(checked) => setProgress((current) => ({ ...current, welcomeAcknowledged: checked }))} label="I understand how First 5 Jobs works." />
          </CardContent>
        </Card>

        <ChoiceCard title="1. Choose your ABN path" description="BuildOS requires an active ABN and GST registration before quoting through First 5 Jobs." value={progress.abnPath} onChange={(value) => setProgress((current) => ({ ...current, abnPath: value as AbnPath }))} options={[
          ["already_have_abn", "I already have an ABN", "I will enter it in Business Details for verification."],
          ["apply_for_abn", "I need to apply for an ABN", "Use the official ABR guidance, then return when the ABN and GST registration are active."],
        ]} />
        <Card><CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
          <p>Have your TFN ready if you have one. It can help the Australian Business Register confirm your identity, but BuildOS never asks for or stores your TFN.</p>
          <Button asChild variant="outline"><a href={ABN_URL} target="_blank" rel="noreferrer">Official ABN application guide <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
        </CardContent></Card>

        <ChoiceCard title="2. Choose how you will trade" description="Use the path that matches the name customers will see." value={progress.businessNamePath} onChange={(value) => setProgress((current) => ({ ...current, businessNamePath: value as BusinessNamePath }))} options={[
          ["own_legal_name", "Trade under my own legal name", "A sole trader named John Smith can trade as John Smith. A partnership can use all partners’ legal names."],
          ["register_business_name", "Register a different business name", "John Smith Cleaning is different from John Smith, so it must be registered as a business name before it is used."],
        ]} />
        <Card><CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
          <p>People often call this a “trading name”. The current registered name is a <strong className="font-medium text-foreground">business name</strong>. Old unregistered trading names do not count as registered business names.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href={ASIC_NAME_URL} target="_blank" rel="noreferrer">ASIC registration guide <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
            <Button asChild variant="outline"><a href={PRIVATE_NAME_URL} target="_blank" rel="noreferrer">Private registration service <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
          </div>
          <p className="text-xs">The second link is a private service, not ASIC, and may charge more than registering directly with the government.</p>
        </CardContent></Card>

        <Card>
          <CardHeader><CardTitle>3. Start with business habits</CardTitle><CardDescription>These standards prepare your records for Core and QBO later.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <ul className="list-disc space-y-2 pl-5"><li>Open a separate business bank account.</li><li>Order only a small first batch of business cards, with room for notes on the back.</li><li>Buy only what booked work requires.</li></ul>
            <CheckLine id="standards" checked={progress.operatingStandardsAcknowledged} onChange={(checked) => setProgress((current) => ({ ...current, operatingStandardsAcknowledged: checked }))} label="I understand these starting standards." />
          </CardContent>
        </Card>

        <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 text-emerald-600" /><span>{progress.completedAt ? "Orientation already completed. You can review and save it again." : "Complete all four choices to continue."}</span></div>
          <Button onClick={() => void saveAndContinue()} disabled={!readyToSave || saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{businessVerified ? "Save and return to First 5 Jobs" : "Save and set up Business Details"}</Button>
        </div>
      </> : null}
    </main>
  );
}

function CheckLine({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <div className="flex items-start gap-3 rounded-lg border bg-white p-3"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} /><Label htmlFor={id} className="cursor-pointer leading-5">{label}</Label></div>;
}

function ChoiceCard({ title, description, value, onChange, options }: { title: string; description: string; value: string | null; onChange: (value: string) => void; options: [string, string, string][] }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><RadioGroup value={value ?? ""} onValueChange={onChange} className="gap-3">{options.map(([optionValue, label, detail]) => <Label key={optionValue} htmlFor={optionValue} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/40"><RadioGroupItem id={optionValue} value={optionValue} className="mt-0.5" /><span><span className="block font-medium text-foreground">{label}</span><span className="mt-1 block font-normal leading-5 text-muted-foreground">{detail}</span></span></Label>)}</RadioGroup></CardContent></Card>;
}
