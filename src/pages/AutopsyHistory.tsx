import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RunRow {
  id: string;
  run_name: string | null;
  created_at: string;
  score_total: number | null;
  verdict_name: string | null;
  weakest_dimension: string | null;
  scenario: string | null;
  operator_class: string | null;
}

export default function AutopsyHistory() {
  const q = useQuery({
    queryKey: ["autopsy", "history"],
    queryFn: async (): Promise<RunRow[]> => {
      const { data, error } = await supabase
        .from("autopsy_runs")
        .select(
          "id, run_name, created_at, score_total, verdict_name, weakest_dimension, scenario, operator_class",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run history</h1>
          <p className="text-sm text-muted-foreground">Prior autopsy runs from the backend.</p>
        </div>
        <Button asChild>
          <Link to="/autopsy">New run</Link>
        </Button>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading runs…</p>}
      {q.error && (
        <p className="text-sm text-destructive">
          Failed to load runs: {(q.error as any)?.message}
        </p>
      )}

      <div className="grid gap-3">
        {(q.data ?? []).map((r) => (
          <Link key={r.id} to={`/autopsy/run/${r.id}`}>
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base truncate">
                    {r.run_name ?? r.id}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-sm flex flex-wrap gap-2 items-center">
                {r.verdict_name && <Badge>{r.verdict_name}</Badge>}
                {r.scenario && <Badge variant="secondary">{r.scenario}</Badge>}
                {r.operator_class && <Badge variant="outline">{r.operator_class}</Badge>}
                {r.score_total != null && (
                  <span className="text-muted-foreground">Score {r.score_total}</span>
                )}
                {r.weakest_dimension && (
                  <span className="text-muted-foreground">
                    · Weakest: {r.weakest_dimension}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {q.data && q.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </div>
    </div>
  );
}