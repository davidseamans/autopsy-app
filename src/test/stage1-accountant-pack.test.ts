import { describe, expect, it } from "vitest";
import { buildAccountantPackFiles, zipAccountantPack } from "@/lib/stage1AccountantPack";
import type { ProofUnit } from "@/pages/Stage1";

const job: ProofUnit = {
  n: 1, jobSequenceNumber: 1, client: "Acme Dental", jobSite: "Brisbane", proofType: "Completed Job", status: "Completed", gm: 40, evidence: false,
  sourceQuote: "Q-1001", quotedLabourHours: 6, actualLabourHours: 5.5,
  invoiceLines: [{ id: "i1", date: "2026-08-01", ref: "INV-1", description: "Initial clean", amount: 1100, gstIncluded: true, gstTreatment: "gst_included" }],
  paymentLines: [{ id: "p1", date: "2026-08-03", description: "Payment received", amount: 600, method: "EFT" }],
  costLines: [{ id: "c1", date: "2026-08-02", description: "Consumables", amount: 110, gstIncluded: true, gstTreatment: "gst_included" }],
};

describe("5JD Accountant Pack", () => {
  it("exports reconciled, accountant-readable files without prescribing imports", () => {
    const files = buildAccountantPackFiles({ units: [job], business: { businessName: "Acme Cleaning", registeredName: "Acme Pty Ltd", abn: "12345678901", gstRegistered: true }, runId: "run-1", generatedAt: new Date("2026-08-10T00:00:00Z") });
    expect(Object.keys(files)).toEqual(["README.txt", "summary.csv", "jobs.csv", "invoices.csv", "payments.csv", "job-costs.csv", "general-expenses.csv", "job-detail-reports.html"]);
    expect(files["summary.csv"]).toContain('"Outstanding","500.00"');
    expect(files["invoices.csv"]).toContain('"1100.00","100.00","1000.00"');
    expect(files["jobs.csv"]).toContain('"J-1","Acme Dental"');
    expect(files["README.txt"]).toContain("check whether QBO or bank feeds already contain the same transactions");
    expect(files["README.txt"]).toContain("not an audit file or accounting advice");
  });

  it("builds a downloadable ZIP container", async () => {
    const blob = zipAccountantPack({ "README.txt": "hello", "jobs.csv": "Job\r\n" });
    expect(blob.type).toBe("application/zip");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  });
});
