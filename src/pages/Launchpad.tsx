import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchBusinessIdentity } from "@/lib/businessIdentity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IdCard,
  FileText,
  Inbox,
  Briefcase,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

type SetupStatus = "loading" | "complete" | "incomplete";

function StatusPill({ status }: { status: SetupStatus }) {
  if (status === "loading") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </Badge>
    );
  }
  if (status === "complete") {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <AlertCircle className="h-3 w-3" /> Setup Required
    </Badge>
  );
}

export default function Launchpad() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("loading");

  useEffect(() => {
    (async () => {
      if (!runId) {
        setSetupStatus("incomplete");
        return;
      }
      try {
        const { profile } = await fetchBusinessIdentity(runId);
        setSetupStatus(profile?.verified ? "complete" : "incomplete");
      } catch {
        setSetupStatus("incomplete");
      }
    })();
  }, [runId]);

  const withRun = (path: string) => runId ? `${path}?runId=${encodeURIComponent(runId)}` : path;
  const businessDetailsPath = runId
    ? `/business-setup?runId=${encodeURIComponent(runId)}&from=launchpad`
    : "/business-setup?from=launchpad";

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">First 5 Jobs · Launchpad</p>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to your First 5 Jobs</h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Launchpad is a guided Stage 1 intake layer. It captures early commercial evidence without writing premature records into Core.
        </p>
      </header>

      <ol className="space-y-4">
        {/* 1. Business Setup */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <IdCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">1. Business Details</CardTitle>
                  <StatusPill status={setupStatus} />
                </div>
                <CardDescription className="mt-1 leading-relaxed">
                  Confirm your business identity and verify an active, GST-registered ABN. Nothing downstream
                  works without this gate cleared.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to={businessDetailsPath}>
                  Go to Business Details <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>

        {/* 2. Lead Funnel */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">2. Add Leads and Opportunities</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Record each opportunity before quoting it. This lets you see where leads come from and which ones become paying work.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {setupStatus === "complete" ? (
                <Button asChild variant="outline" size="sm">
                  <Link to={withRun("/launchpad/leads")}>
                    Open Lead Funnel <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>Verify Business Details first</Button>
              )}
            </CardContent>
          </Card>
        </li>

        {/* 3. Create and Track Quote */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <Inbox className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">3. Create and Track the Quote</CardTitle>
                </div>
                <CardDescription className="mt-1 leading-relaxed">
                  Select a lead, issue the written quote, then record whether it was accepted, declined or expired.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </li>

        {/* 4. Convert to Job */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">4. Convert Accepted Quote to Job</CardTitle>
                </div>
                <CardDescription className="mt-1 leading-relaxed">
                  Accepted quotes become jobs. The quote reference carries through so the lineage stays intact.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </li>

        {/* 5. Complete Job */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">5. Complete Job</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Completed jobs feed the First 5 Jobs Dashboard — the operational view of your earliest work.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to={withRun("/stage-1")}>
                  View First 5 Jobs Dashboard <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>
      </ol>

      <Card className="bg-muted/30">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <CheckCircle2 className="h-5 w-5 mt-0.5 text-muted-foreground" />
          <div>
            <CardTitle className="text-sm">Why Launchpad exists</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              The Core screens stay separate for later. Launchpad keeps Stage 1 simple: setup → lead → quote →
              outcome → job → dashboard.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
