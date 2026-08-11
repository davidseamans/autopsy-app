import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";

interface CoreAccount {
  id: string;
  name: string;
  relationship_status: string;
}

interface CoreMarginRow {
  job_id: string;
  job_status: string;
  scheduled_date: string | null;
  quote_id: string | null;
  quote_amount: number | null;
  revenue_amount: number;
  total_direct_cost: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
}

const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);

const percentage = (value: number | null) => value == null ? "—" : `${value.toFixed(2)}%`;

async function loadCoreOverview() {
  const [accounts, margins] = await Promise.all([
    supabase.from("core_accounts").select("id,name,relationship_status").order("created_at"),
    supabase
      .from("core_job_margin_summary")
      .select("job_id,job_status,scheduled_date,quote_id,quote_amount,revenue_amount,total_direct_cost,gross_profit,gross_margin_pct")
      .order("scheduled_date", { ascending: false }),
  ]);

  if (accounts.error) throw accounts.error;
  if (margins.error) throw margins.error;
  return {
    accounts: (accounts.data ?? []) as CoreAccount[],
    margins: (margins.data ?? []) as CoreMarginRow[],
  };
}

function CoreOverviewContent() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["core-operator-overview"],
    queryFn: loadCoreOverview,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">BuildOS / Core</h1>
          <Badge variant="outline">Read only</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tenant-scoped Core records. Values are projections from the governed Core relations; this surface does not activate Control or promote Discover records.
        </p>
      </header>

      <Alert>
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>Promotion unavailable</AlertTitle>
        <AlertDescription>
          Selective Discover-to-Control promotion is not implemented. Browser-direct Core writes are disabled and no action on this page reports a promotion success.
        </AlertDescription>
      </Alert>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading tenant-scoped Core records…</p> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Core records unavailable</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "The tenant-scoped read failed."}</AlertDescription>
        </Alert>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader><CardTitle>Accounts ({data.accounts.length})</CardTitle></CardHeader>
            <CardContent>
              {data.accounts.length ? data.accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between border-t py-3 first:border-t-0">
                  <span className="font-medium">{account.name}</span>
                  <Badge variant="secondary">{account.relationship_status}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground">No tenant-visible Core accounts.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job accounting summary</CardTitle>
              <p className="text-sm text-muted-foreground">
                Read from <code>core_job_margin_summary</code>. Quote value is not revenue; revenue and margin use ex-GST revenue events.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Job</TableHead><TableHead>Quote</TableHead><TableHead>Revenue (ex GST)</TableHead>
                  <TableHead>Direct costs</TableHead><TableHead>Gross profit</TableHead><TableHead>Gross margin</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.margins.length ? data.margins.map((row) => (
                    <TableRow key={row.job_id}>
                      <TableCell><span className="font-mono text-xs">{row.job_id.slice(0, 8)}</span><br /><span className="text-xs text-muted-foreground">{row.job_status}</span></TableCell>
                      <TableCell>{money(row.quote_amount)}</TableCell>
                      <TableCell>{money(row.revenue_amount)}</TableCell>
                      <TableCell>{money(row.total_direct_cost)}</TableCell>
                      <TableCell>{money(row.gross_profit)}</TableCell>
                      <TableCell>{percentage(row.gross_margin_pct)}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No tenant-visible job summaries.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function CoreOverview() {
  return <AuthGate heading="Sign in to Core" description="An authenticated tenant membership is required."><CoreOverviewContent /></AuthGate>;
}
