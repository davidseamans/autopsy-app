import { useMemo, useState } from "react";
import type { Stage1LeadActivity } from "@/lib/stage1Funnel";

type MatrixPoint = {
  method: string;
  week: number;
  leads: number;
  attempts: number;
  contacts: number;
};

const DAY_MS = 86_400_000;

function dateOnly(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: Date, includeYear = false) {
  return value.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

export function Stage1LeadMatrix({ activities, methods }: { activities: Stage1LeadActivity[]; startedAt?: string | null; methods: string[] }) {
  const [selected, setSelected] = useState<MatrixPoint | null>(null);
  const window = useMemo(() => {
    const dates = activities
      .map((activity) => dateOnly(activity.activity_date))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());
    const latestActivity = dates.at(-1) ?? null;
    if (!latestActivity) return null;
    return {
      start: new Date(latestActivity.getTime() - 41 * DAY_MS),
      end: latestActivity,
    };
  }, [activities]);

  const points = useMemo(() => {
    if (!window) return [];
    const totals = new Map<string, MatrixPoint>();
    activities.forEach((activity) => {
      const activityDate = dateOnly(activity.activity_date);
      if (!activityDate) return;
      const week = Math.floor((activityDate.getTime() - window.start.getTime()) / (DAY_MS * 7)) + 1;
      if (week < 1 || week > 6) return;
      const key = `${activity.method}:${week}`;
      const existing = totals.get(key) ?? { method: activity.method, week, leads: 0, attempts: 0, contacts: 0 };
      existing.leads += activity.leads_generated;
      existing.attempts += activity.attempts;
      existing.contacts += activity.contacts_made;
      totals.set(key, existing);
    });
    return Array.from(totals.values());
  }, [activities, window]);

  const visibleMethods = useMemo(() => {
    const recorded = new Set(activities.map((activity) => activity.method));
    return methods.filter((method) => recorded.has(method));
  }, [activities, methods]);

  const weeklyTotals = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const week = index + 1;
    return points
      .filter((point) => point.week === week)
      .reduce((total, point) => total + point.leads, 0);
  }), [points]);
  const sixWeekTotal = weeklyTotals.reduce((total, leads) => total + leads, 0);
  const outsideWindow = useMemo(() => activities.filter((activity) => {
    if (!window) return false;
    const activityDate = dateOnly(activity.activity_date);
    return !activityDate || activityDate < window.start || activityDate > window.end;
  }).length, [activities, window]);

  if (!window || visibleMethods.length === 0) {
    return <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Log the first dated activity to begin the rolling six-week lead-source graph.</div>;
  }

  return (
    <section className="space-y-3" aria-labelledby="lead-matrix-title">
      <div>
        <h3 id="lead-matrix-title" className="font-semibold">Rolling six-week lead-source graph</h3>
        <p className="text-sm text-muted-foreground">
          {formatDate(window.start, true)} to {formatDate(window.end, true)} · the window ends on your latest logged activity.
        </p>
        <p className="text-sm text-muted-foreground">Touch a point to see the result for that source and week.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white p-3">
        <div className="grid min-w-[620px] gap-2" style={{ gridTemplateColumns: "minmax(150px, 1.5fr) repeat(6, minmax(62px, 1fr))" }}>
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead source</div>
          {Array.from({ length: 6 }, (_, index) => {
            const end = new Date(window.start.getTime() + (index * 7 + 6) * DAY_MS);
            return <div key={index} className="px-1 py-1 text-center text-xs font-semibold"><span className="block">Week {index + 1}</span><span className="font-normal text-muted-foreground">ends {formatDate(end)}</span></div>;
          })}
          {visibleMethods.map((method) => (
            <MatrixRow key={method} method={method} points={points} onSelect={setSelected} />
          ))}
          <div className="flex min-h-14 items-center rounded-lg bg-sky-950 px-2 text-sm font-semibold text-white">
            Weekly total
          </div>
          {weeklyTotals.map((total, index) => (
            <div key={index} className="flex min-h-14 items-center justify-center rounded-lg bg-sky-50 text-base font-semibold text-sky-950">
              {total}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-sky-50 p-3 text-sm">
        <span className="font-medium text-sky-950">Rolling six-week potential-customer total</span>
        <span className="text-xl font-semibold text-sky-950">{sixWeekTotal}</span>
      </div>
      {outsideWindow > 0 ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {outsideWindow} older dated activit{outsideWindow === 1 ? "y falls" : "ies fall"} before this rolling six-week window and {outsideWindow === 1 ? "is" : "are"} not included in the graph.
        </p>
      ) : null}
      <div aria-live="polite" className="min-h-16 rounded-xl border bg-slate-50 p-3 text-sm">
        {selected ? <><strong>{selected.method} · Week {selected.week}</strong><span className="mt-1 block">{selected.leads} lead{selected.leads === 1 ? "" : "s"} from {selected.attempts} attempts and {selected.contacts} contacts.</span></> : <span className="text-muted-foreground">Select a point for its lead count.</span>}
      </div>
    </section>
  );
}

function MatrixRow({ method, points, onSelect }: { method: string; points: MatrixPoint[]; onSelect: (point: MatrixPoint) => void }) {
  return (
    <>
      <div className="flex min-h-14 items-center rounded-lg bg-slate-50 px-2 text-sm font-medium">{method}</div>
      {Array.from({ length: 6 }, (_, index) => {
        const week = index + 1;
        const point = points.find((item) => item.method === method && item.week === week);
        return <div key={week} className="flex min-h-14 items-center justify-center rounded-lg bg-slate-50">{point ? <button type="button" onClick={() => onSelect(point)} aria-label={`${method}, Week ${week}, ${point.leads} leads`} className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-sky-700 font-semibold text-white shadow-sm ring-offset-2 hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600" style={{ width: `${Math.min(52, 34 + point.leads * 3)}px`, height: `${Math.min(52, 34 + point.leads * 3)}px` }}>{point.leads}</button> : <span className="text-muted-foreground">—</span>}</div>;
      })}
    </>
  );
}
