import type { Stage1LeadActivity, Stage1LeadRecord } from "@/lib/stage1Funnel";

export function leadRecordsAsActivities(leads: Stage1LeadRecord[]): Stage1LeadActivity[] {
  return leads.map((lead) => ({
    id: lead.id,
    activity_date: lead.created_at.slice(0, 10),
    method: lead.source,
    attempts: 0,
    contacts_made: 0,
    leads_generated: 1,
    created_at: lead.created_at,
  }));
}
