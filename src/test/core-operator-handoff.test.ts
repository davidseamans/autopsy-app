import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Packet 4 operator-facing handoff", () => {
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const shell = readFileSync(resolve("src/components/AppShell.tsx"), "utf8");
  const page = readFileSync(resolve("src/pages/CoreOverview.tsx"), "utf8");
  const workspace = readFileSync(resolve("src/lib/jobWorkspace.ts"), "utf8");
  const legacyRevenue = readFileSync(resolve("src/components/RevenuePanel.tsx"), "utf8");

  it("quarantines the legacy unprefixed Core routes", () => {
    for (const route of ["leads", "accounts", "pipeline", "quotes", "jobs"]) {
      expect(app).toContain(`<Route path="/${route}" element={<Navigate to="/core" replace />} />`);
    }
    expect(shell).not.toContain('{ title: "Accounts", url: "/accounts" }');
  });

  it("uses only tenant-scoped canonical Core reads", () => {
    expect(page).toContain('from("core_accounts")');
    expect(page).toContain('from("core_job_margin_summary")');
    expect(page).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(workspace).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(legacyRevenue).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("keeps quote, ex-GST revenue, costs, profit and margin distinct", () => {
    for (const label of ["Quote", "Revenue (ex GST)", "Direct costs", "Gross profit", "Gross margin"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain("Quote value is not revenue");
  });

  it("fails closed for promotion", () => {
    expect(page).toContain("Promotion unavailable");
    expect(page).toContain("Browser-direct Core writes are disabled");
    expect(page).not.toContain("Promotion successful");
  });
});
