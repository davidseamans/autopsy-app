import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Stage1LeadMatrix } from "@/components/Stage1LeadMatrix";
import type { Stage1LeadActivity } from "@/lib/stage1Funnel";

const activities: Stage1LeadActivity[] = [
  { id: "a1", activity_date: "2026-08-02", method: "Customer Referral", attempts: 4, contacts_made: 3, leads_generated: 2, created_at: "2026-08-02T09:00:00Z" },
  { id: "a2", activity_date: "2026-08-09", method: "Customer Referral", attempts: 2, contacts_made: 2, leads_generated: 1, created_at: "2026-08-09T09:00:00Z" },
];

describe("Stage 1 six-week lead-source matrix", () => {
  it("places dated lead totals into touchable Stage 1 weeks", () => {
    render(<Stage1LeadMatrix activities={activities} startedAt="2026-08-01T00:00:00Z" methods={["Customer Referral"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Customer Referral, Week 1, 2 leads" }));
    expect(screen.getByText("2 leads from 4 attempts and 3 contacts.")).toBeInTheDocument();
    expect(screen.getByText("Week 6")).toBeInTheDocument();
  });

  it("keeps the persistent record aggregate and privacy-safe", () => {
    const migration = readFileSync(resolve("supabase/migrations/20260805033000_stage1_lead_activity_matrix.sql"), "utf8");
    expect(migration).toContain("stage1_lead_activities");
    expect(migration).toContain("leads_generated integer");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("current_user_can_use_stage1_run");
    expect(migration).not.toContain("client_name");
    expect(migration).not.toContain("phone");
    expect(migration).not.toContain("email");
    expect(migration).not.toContain("notes");
  });
});
