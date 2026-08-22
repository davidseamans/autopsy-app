import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, PlayCircle, ShieldCheck } from "lucide-react";
import { HudsonSupportButton } from "@/components/HudsonSupportButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/sonner";
import { fetchBusinessIdentity } from "@/lib/businessIdentity";
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
const QUEENSLAND_BLUE_CARD_URL = "https://www.qld.gov.au/jobs/blue-card";

const initialProgress: Stage1OnboardingProgress = {
  abnPath: null,
  businessNamePath: null,
  savedAt: null,
};

export default function Stage1Orientation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const runId = searchParams.get("runId") ?? "";
  const isDemo = searchParams.get("demo") === "1";
  const [progress, setProgress] = useState(initialProgress);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    if (!runId) {
      setError("Return to First 5 Jobs and open setup from there.");
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
  }, [isDemo, runId]);

  const readyToSave = Boolean(progress.abnPath && progress.businessNamePath);

  async function saveAndContinue() {
    if (isDemo) {
      navigate("/stage-1?demo=1");
      return;
    }
    if (!runId || !readyToSave) return;
    setSaving(true);
    try {
      const saved = await saveStage1Onboarding(runId, {
        abnPath: progress.abnPath,
        businessNamePath: progress.businessNamePath,
      });
      setProgress(saved);
      toast.success("First 5 Jobs setup choices saved.");
      navigate(
        businessVerified
          ? `/stage-1?runId=${encodeURIComponent(runId)}`
          : `/business-setup?runId=${encodeURIComponent(runId)}`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Setup choices could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="container max-w-3xl py-12 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading First 5 Jobs setup…</div>;
  }

  return (
    <main className="container max-w-3xl py-10 space-y-6">
      <Button asChild variant="ghost" className="-ml-3"><Link to={isDemo ? "/stage-1?demo=1" : runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1"}><ArrowLeft className="mr-2 h-4 w-4" /> Back to First 5 Jobs</Link></Button>

      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">First 5 Jobs · setup</p>
        <h1 className="text-3xl font-semibold tracking-tight">Before your first job</h1>
        <p className="text-muted-foreground">Hudson will show you through your First 5 Jobs workspace, then you choose the setup path that applies to you.</p>
      </header>

      {error ? <Card className="border-destructive/40"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      {!error ? <>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <CardTitle>Meet Hudson</CardTitle>
            <CardDescription>Hudson is your guide and support person throughout First 5 Jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>Hudson will take you through Leads, Quotes, Jobs, Margin and Money Owing in your actual workspace. Use the buttons below his video to move directly to the area you are discussing.</p>
            <p>Ask Hudson what a screen means or where to find something whenever you need help. BuildOS continues to control records and progression in the background.</p>
            <p>He cannot issue your Verdict, open a gate, accept payment, waive ABN or GST requirements, or alter authoritative records.</p>
            <div className="flex flex-wrap gap-2">
              {!isDemo ? <HudsonSupportButton
                runId={runId}
                label="Open Hudson and tour First 5 Jobs"
                onOpened={() => navigate(`/stage-1?runId=${encodeURIComponent(runId)}&tour=hudson&step=2`)}
              /> : null}
              <Button asChild variant="outline" className="gap-2">
                <Link to={isDemo ? "/stage-1?demo=1&tour=1" : `/stage-1?runId=${encodeURIComponent(runId)}&tour=1`}>
                  <PlayCircle className="h-4 w-4" /> Tour without live video
                </Link>
              </Button>
            </div>
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
          <CardHeader><CardTitle>Start with business habits</CardTitle><CardDescription>Useful starting guidance—not a test or acknowledgement.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <ul className="list-disc space-y-2 pl-5">
              <li>Open a separate business bank account.</li>
              <li>Order only a small first batch of business cards, with room for notes on the back.</li>
              <li>Buy only what booked work requires.</li>
              <li>
                <strong className="font-medium text-foreground">Check the requirements of each target market before you approach it.</strong>{" "}
                Some contracts require screening, licences, training or site-specific credentials. For example, regulated child-related cleaning work in Queensland can require a current blue card. Confirm the requirements for the actual role and location; if you hold a relevant credential, show it clearly on your business card and quote. It tells the customer you already understand their environment.
                <span className="mt-2 block">
                  <a className="font-medium text-foreground underline underline-offset-4" href={QUEENSLAND_BLUE_CARD_URL} target="_blank" rel="noreferrer">Check Queensland blue card guidance <ExternalLink className="ml-1 inline h-3.5 w-3.5" /></a>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <span>{progress.savedAt ? "Your current ABN and trading-name choices are shown above. Change them only if your circumstances have changed." : "Choose your ABN and trading-name paths to continue."}</span>
          </div>
          <Button onClick={() => void saveAndContinue()} disabled={(!isDemo && !readyToSave) || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isDemo ? "Return to sample First 5 Jobs" : businessVerified ? "Save choices and open First 5 Jobs" : "Save choices and open Business Details"}
          </Button>
        </div>
      </> : null}
    </main>
  );
}

function ChoiceCard({ title, description, value, onChange, options }: { title: string; description: string; value: string | null; onChange: (value: string) => void; options: [string, string, string][] }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><RadioGroup value={value ?? ""} onValueChange={onChange} className="gap-3">{options.map(([optionValue, label, detail]) => <Label key={optionValue} htmlFor={optionValue} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/40"><RadioGroupItem id={optionValue} value={optionValue} className="mt-0.5" /><span><span className="block font-medium text-foreground">{label}</span><span className="mt-1 block font-normal leading-5 text-muted-foreground">{detail}</span></span></Label>)}</RadioGroup></CardContent></Card>;
}
