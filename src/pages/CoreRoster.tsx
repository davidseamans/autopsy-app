import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadCoreWeeklyRoster } from "@/lib/core/rosterRepository";
import { getRosterWeek } from "@/lib/core/rosterWeek";

const hours = (minutes: number | null) =>
  minutes == null ? "—" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(minutes / 60);

const clock = (value: string) =>
  new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

function CoreRosterContent() {
  const [anchor, setAnchor] = useState(() => new Date());
  const week = getRosterWeek(anchor);
  const { data = [], error, isLoading } = useQuery({
    queryKey: ["core-weekly-roster", week.startsOn, week.endsOn],
    queryFn: () => loadCoreWeeklyRoster(week),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Weekly roster</h1>
          <Badge variant="outline">Read only</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tenant-scoped planned labour and approved actual hours. Payroll handoff remains outside this screen.
        </p>
      </header>

      <Alert>
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>Planning writes remain disabled</AlertTitle>
        <AlertDescription>
          This browser surface can inspect the governed roster projection but cannot create, move, publish, approve, or delete records.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{format(parseISO(week.startsOn), "d MMM")} – {format(parseISO(week.endsOn), "d MMM yyyy")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{data.length} tenant-visible shift{data.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor((value) => addDays(value, -7))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor((value) => addDays(value, 7))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading tenant-scoped roster…</p> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Roster unavailable</AlertTitle>
              <AlertDescription>{error instanceof Error ? error.message : "The tenant-scoped read failed."}</AlertDescription>
            </Alert>
          ) : null}
          {!isLoading && !error ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Day</TableHead><TableHead>Employee</TableHead><TableHead>Job / site</TableHead>
                <TableHead>Shift</TableHead><TableHead>Planned</TableHead><TableHead>Approved actual</TableHead>
                <TableHead>Variance</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.length ? data.map((row) => (
                  <TableRow key={row.shift_id}>
                    <TableCell><span className="font-medium">{format(parseISO(row.work_date), "EEE")}</span><br /><span className="text-xs text-muted-foreground">{format(parseISO(row.work_date), "d MMM")}</span></TableCell>
                    <TableCell>{row.employee_name}</TableCell>
                    <TableCell><span className="font-medium">#{row.job_sequence_number}</span><br /><span className="text-xs text-muted-foreground">{row.site_name ?? "No site"}</span></TableCell>
                    <TableCell>{clock(row.starts_at)}–{clock(row.ends_at)}</TableCell>
                    <TableCell>{hours(row.planned_minutes)} h</TableCell>
                    <TableCell>{row.actual_minutes == null ? "—" : `${hours(row.actual_minutes)} h`}</TableCell>
                    <TableCell>{row.variance_minutes == null ? "—" : `${row.variance_minutes > 0 ? "+" : ""}${hours(row.variance_minutes)} h`}</TableCell>
                    <TableCell><Badge variant="secondary">{row.shift_status}</Badge>{row.time_entry_status ? <span className="ml-2 text-xs text-muted-foreground">{row.time_entry_status}</span> : null}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No tenant-visible shifts for this week.</TableCell></TableRow>}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CoreRoster() {
  return <AuthGate heading="Sign in to Core roster" description="An authenticated tenant membership is required."><CoreRosterContent /></AuthGate>;
}
