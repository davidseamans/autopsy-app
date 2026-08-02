import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { loadStage1Funnel, saveStage1LeadCount } from "@/lib/stage1Funnel";

export default function Stage1Leads() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const first5JobsPath = runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  const [leadCount, setLeadCount] = useState(0);
  const [savedLeadCount, setSavedLeadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!runId) {
      setError("Open Leads from your First 5 Jobs page.");
      setLoading(false);
      return;
    }
    try {
      const snapshot = await loadStage1Funnel(runId);
      setLeadCount(snapshot.leadCount);
      setSavedLeadCount(snapshot.leadCount);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveLeadCount() {
    if (!runId || saving) return;
    setSaving(true);
    try {
      const saved = await saveStage1LeadCount(runId, leadCount);
      setLeadCount(saved);
      setSavedLeadCount(saved);
      toast.success("Lead total saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="container max-w-5xl py-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading sales activity…</div>;
  }

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to={first5JobsPath}><ArrowLeft className="mr-1 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
      <header>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Sales Activity</p>
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Keep this simple. Record only the total number of enquiries you receive. Customer details belong in Quotes.</p>
        </div>
      </header>

      {error ? <Card className="border-destructive/50"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Total leads received</CardTitle>
          <CardDescription>Enter one cumulative number. Do not enter names or contact details for people who never reach the quoting stage.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="w-full max-w-xs space-y-1.5">
            <Label htmlFor="lead-count">Leads received so far</Label>
            <Input id="lead-count" type="number" min={0} step={1} value={leadCount} onChange={(event) => setLeadCount(Math.max(0, Math.trunc(Number(event.target.value))))} />
          </div>
          <Button onClick={() => void saveLeadCount()} disabled={saving || leadCount === savedLeadCount}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save total</Button>
          <p className="text-sm text-muted-foreground">Saved total: {savedLeadCount}</p>
        </CardContent>
      </Card>
    </div>
  );
}
