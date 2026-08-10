import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";
import { Stage1WelcomeGuide } from "@/components/Stage1WelcomeGuide";
import type { ProofUnit } from "@/pages/Stage1";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: null }),
}));

const sampleJob: ProofUnit = {
  n: 1,
  jobSequenceNumber: 1,
  client: "Riverstone Dental Centre",
  jobSite: "Sample premises, Paddington QLD",
  sourceQuote: "Q-1001",
  status: "Completed",
  invoiceLines: [{
    id: "demo-invoice-1",
    date: "2026-07-18",
    ref: "INV-1",
    description: "Final invoice generated from accepted quote Q-1001",
    amount: 2035,
    gstIncluded: true,
    gstTreatment: "gst_included",
  }],
  quotedLabourHours: 20,
  actualLabourHours: 19,
  quotedConsumablesBudget: 55,
  quotedCleanTypeLabel: "Initial or heavy clean",
  costLines: [{
    id: "demo-cost-1",
    description: "Cleaning materials and consumables",
    amount: 85,
    gstIncluded: true,
    gstTreatment: "gst_included",
  }],
};

describe("First 5 Jobs sample report", () => {
  it("opens the populated Job Cost Summary in tour mode", () => {
    render(
      <DetailedJobCostReport
        unit={sampleJob}
        runId={null}
        open
        onOpenChange={vi.fn()}
        tourInteractive
        readOnly
      />,
    );

    expect(screen.getByText("Job Cost Summary Report")).toBeInTheDocument();
    expect(screen.getByText("Riverstone Dental Centre")).toBeInTheDocument();
    expect(screen.getByText("Q-1001")).toBeInTheDocument();
    expect(screen.getByText("INV-1")).toBeInTheDocument();
  });

  it("captures and saves actual hours from the current Job Cost Summary", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DetailedJobCostReport unit={{ ...sampleJob, actualLabourHours: undefined }} runId={null} open onOpenChange={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Actual hours worked"), { target: { value: "6.25" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save hours" })); });

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ actualLabourHours: 6.25 })));
  });

  it("takes Back across the quotation-to-jobs route boundary", () => {
    const onJourneyBack = vi.fn();
    render(
      <Stage1WelcomeGuide
        mode="jobs"
        onClose={vi.fn()}
        onStepChange={vi.fn()}
        onJourneyBack={onJourneyBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onJourneyBack).toHaveBeenCalledOnce();
  });

  it("keeps one global step count when the route changes", () => {
    render(
      <Stage1WelcomeGuide
        mode="quotes"
        onClose={vi.fn()}
        onStepChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Step 4 of 24/)).toBeInTheDocument();
    expect(screen.getByText("Quote genuine opportunities")).toBeInTheDocument();
  });
});
