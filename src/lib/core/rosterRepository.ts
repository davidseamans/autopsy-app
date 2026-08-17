import { supabase } from "@/lib/supabase";
import type { RosterWeek } from "@/lib/core/rosterWeek";

export interface CoreWeeklyRosterRow {
  shift_id: string;
  tenant_id: string;
  work_date: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  shift_status: string;
  employee_id: string;
  employee_name: string;
  job_id: string;
  job_sequence_number: number;
  site_id: string | null;
  site_name: string | null;
  planned_minutes: number;
  actual_minutes: number | null;
  variance_minutes: number | null;
  time_entry_status: string | null;
}

export async function loadCoreWeeklyRoster(week: RosterWeek) {
  const { data, error } = await supabase
    .from("core_weekly_roster")
    .select(
      "shift_id,tenant_id,work_date,starts_at,ends_at,timezone,shift_status,employee_id,employee_name,job_id,job_sequence_number,site_id,site_name,planned_minutes,actual_minutes,variance_minutes,time_entry_status",
    )
    .gte("work_date", week.startsOn)
    .lte("work_date", week.endsOn)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CoreWeeklyRosterRow[];
}
