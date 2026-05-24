import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
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

const REQUIRED_FIELDS = [
  "business_name",
  "contact_name",
  "phone",
  "email",
  "abn",
  "bank_account_name",
  "bsb",
  "account_number",
];

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
        <CheckCircle2 className="h-3 w-3" /> Complete
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <AlertCircle className="h-3 w-3" /> Incomplete
    </Badge>
  );
}

export default function Launchpad() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("loading");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("business_identity_profile")
        .select("*")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        setSetupStatus("incomplete");
        return;
      }
      const allFilled = REQUIRED_FIELDS.every((k) => !!String((data as any)[k] ?? "").trim());
      const gstOk = !!(data as any).gst_registered_confirmed;
      setSetupStatus(allFilled && gstOk ? "complete" : "incomplete");
    })();
  }, []);

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Launchpad Intake</p>
        <h1 className="text-3xl font-semibold tracking-tight">Get set up before your first job</h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Launchpad is a guided intake layer. It writes to the same underlying records as Core, but keeps
          first-time operators away from technical admin screens.
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
                  <CardTitle className="text-base">1. Complete Business Setup</CardTitle>
                  <StatusPill status={setupStatus} />
                </div>
                <CardDescription className="mt-1 leading-relaxed">
                  Confirm your business identity, ABN, GST status, and bank details. Nothing downstream works
                  without this gate cleared.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to="/business-setup">
                  Go to Business Setup <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>

        {/* 2. Create Written Quote */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">2. Create Written Quote</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Every job must start with a written Quote or Tax Invoice reference. Use the simple guided
                  flow — not the Core Quotes admin table.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to="/launchpad/quote/new">
                  Start Simple Quote <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>

        {/* 3. Track Quote Outcome */}
        <li>
          <Card>
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="rounded-md border p-2 bg-muted/40">
                <Inbox className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">3. Track Quote Outcome</CardTitle>
                  <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
                </div>
                <CardDescription className="mt-1 leading-relaxed">
                  Every quote moves through one of four statuses: <strong>Sent</strong>, <strong>Accepted</strong>,
                  <strong> Declined</strong>, or <strong>Expired</strong>. Tracking lives here once the simple
                  quote flow is built.
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
                  <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
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
                <Link to="/stage-1">
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
              The Core screens (Leads, Accounts, Pipeline, Quotes, Jobs) stay available for advanced users, but
              they are too technical for a first-time operator. Launchpad keeps the path simple: setup → quote →
              outcome → job → dashboard.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}