import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["api", "src", "docs", "supabase/migrations"];
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".json", ".yml", ".yaml"]);
const historicalMigrationAllowlist = new Set([
  "supabase/migrations/20260721042338_autopsy_stripe_test_payment_boundary.sql",
  "supabase/migrations/20260731010000_restore_assessment_control_layers.sql",
  "supabase/migrations/20260812014502_fix_paid_checkout_order_conflict.sql",
]);
const forbidden = [
  new RegExp("\\$" + "49\\b"),
  new RegExp("A\\$" + "49\\b"),
  new RegExp("\\b49" + "00\\b"),
];

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const candidate = join(path, name);
    return statSync(candidate).isDirectory() ? filesUnder(candidate) : [candidate];
  });
}

describe("Discover price contamination guard", () => {
  it("rejects active A$49 authority outside immutable historical migrations", () => {
    const violations = roots
      .flatMap(filesUnder)
      .filter((path) => textExtensions.has(path.slice(path.lastIndexOf("."))))
      .map((path) => relative(".", path).replaceAll("\\", "/"))
      .filter((path) => !historicalMigrationAllowlist.has(path))
      .filter((path) => forbidden.some((pattern) => pattern.test(readFileSync(path, "utf8"))));

    expect(violations).toEqual([]);
  });

  it("requires the superseding A$69 database migration", () => {
    const migration = readFileSync(
      "supabase/migrations/20260821060000_enforce_discover_price_a69.sql",
      "utf8",
    );
    expect(migration).toContain("amount_minor = 6900");
    expect(migration).toContain("p_amount_minor <> 6900");
    expect(migration).toContain("status <> 'paid'");
  });
});
