import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getGatewayPayload } from "@/components/autopsy/rpc";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AutopsyWorksheet() {
  const { runId = "" } = useParams();
  const q = useQuery({
    queryKey: ["autopsy", "payload", runId],
    queryFn: () => getGatewayPayload(runId),
    enabled: !!runId,
  });
  const run = q.data?.run ?? {};
  const primaryRisk = (run.primary_risk as string) ?? "—";
  const weakest = (run.weakest_dimension as string) ?? "—";

  return (
    <div className="min-h-screen bg-[hsl(var(--autopsy-bg))]">
      <div className="container max-w-3xl py-10 space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to={runId ? `/autopsy/run/${runId}` : "/autopsy"}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link
            to="/autopsy/history"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Run History
          </Link>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Worksheet
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Business Structure Worksheet
          </h1>
        </div>

        <Section title="Section 1 — Economic Engine">
          <WField label="Who is your customer?" />
          <WField label="What do they pay for?" />
          <WField label="How often do they buy?" />
        </Section>

        <Section title="Section 2 — Core Offer (Pareto)">
          <WTextarea label="What activities create most value?" />
          <WTextarea label="What can be removed?" />
        </Section>

        <Section title="Section 3 — Failure Point">
          <div className="rounded-lg border border-[hsl(var(--autopsy-warning-border))] bg-[hsl(var(--autopsy-warning-soft))] p-4 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Primary Risk (from backend)
              </div>
              <div className="font-medium">{primaryRisk}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Weakest Dimension (from backend)
              </div>
              <div className="font-medium">{weakest}</div>
            </div>
          </div>
          <WTextarea label="Why does this fail?" />
          <WTextarea label="What is missing?" />
        </Section>

        <Section title="Section 4 — Proof Plan">
          <WTextarea label="What must be proven?" />
          <WTextarea label="How will you test it?" />
          <WTextarea label="What result confirms success?" />
        </Section>

        <p className="text-xs text-muted-foreground">
          Worksheet answers are not persisted yet. Primary risk and weakest
          dimension are sourced from the backend payload.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm p-6 space-y-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function WField({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Input />
    </div>
  );
}

function WTextarea({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Textarea rows={3} />
    </div>
  );
}