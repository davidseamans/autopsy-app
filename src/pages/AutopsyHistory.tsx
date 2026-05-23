import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function humanize(value: any): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

interface RunRow {
  id: string;
  run_name: string | null;
  created_at: string;
  score_total: number | null;
  verdict_name: string | null;
  weakest_dimension: string | null;
  scenario: string | null;
  operator_class: string | null;
  industry: string | null;
  primary_risk: string | null;
}

export default function AutopsyHistory() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["autopsy", "history"],
    queryFn: async (): Promise<RunRow[]> => {
      const { data, error } = await supabase
        .from("autopsy_runs")
        .select(
          "id, run_name, created_at, score_total, verdict_name, weakest_dimension, scenario, operator_class, industry, primary_risk",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const rows = q.data ?? [];
  const completed = rows.filter((r) => !!r.verdict_name);
  const inProgress = rows.filter((r) => !r.verdict_name);

  function handleBack() {
    navigate("/autopsy");
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--autopsy-bg))]">
      <div className="container max-w-3xl py-10 space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Button
            asChild
            className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            <Link to="/autopsy">New Run</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run History</h1>
          <p className="text-sm text-muted-foreground">
            Review previous Autopsy assessments.
          </p>
        </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading runs…</p>}
      {q.error && (
        <p className="text-sm text-destructive">
          Failed to load runs: {(q.error as any)?.message}
        </p>
      )}

      <div className="grid gap-3">
        {completed.map((r) => (
          <RunCard key={r.id} r={r} />
        ))}
        {inProgress.length > 0 && (
          <div className="pt-4 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            In progress
          </div>
        )}
        {inProgress.map((r) => (
          <RunCard key={r.id} r={r} inProgress />
        ))}
        {rows.length === 0 && !q.isLoading && (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </div>
      </div>
    </div>
  );
}

function RunCard({ r, inProgress }: { r: RunRow; inProgress?: boolean }) {
  const date = r.created_at;
  const score = Number(r.score_total);
  const isPerfectScore = Number.isFinite(score) && score === 36;
  const isStructurallyViable = Number.isFinite(score) && score >= 30 && score < 36 && /structurally\s*viable/i.test(String(r.verdict_name ?? ""));
  const constraint = isPerfectScore
    ? "No active blocker identified"
    : isStructurallyViable
      ? "Execution watchpoints"
      : humanize(r.primary_risk ?? r.weakest_dimension);
  return (
    <Link to={`/autopsy/run/${r.id}`}>
      <Card className={`hover:bg-muted/40 transition-colors rounded-2xl ${inProgress ? "opacity-80" : ""}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {r.verdict_name ? (
                <Badge className="bg-[hsl(var(--autopsy-accent))] text-[hsl(var(--autopsy-accent-foreground))] hover:bg-[hsl(var(--autopsy-accent))]/90 shrink-0">
                  {r.verdict_name}
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 uppercase tracking-wider text-[10px]">
                  In Progress
                </Badge>
              )}
              <CardTitle className="text-base truncate">{r.run_name ?? r.id}</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(date).toLocaleString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            {r.industry && <Badge variant="secondary">{r.industry}</Badge>}
            {r.scenario && <Badge variant="secondary">{humanize(r.scenario)}</Badge>}
            {r.operator_class && <Badge variant="outline">{humanize(r.operator_class)}</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {r.score_total != null && (
              <span>
                Score <span className="text-foreground font-medium">{r.score_total}</span> / 36
              </span>
            )}
            {constraint && (
              <span>
                {isPerfectScore || isStructurallyViable ? "Watchpoint:" : "Primary constraint:"}{" "}
                <span className="text-foreground font-medium">{constraint}</span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}