import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppShell from "@/components/AppShell";

function renderShell(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>Stage 1 content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Stage 1 navigation context", () => {
  it("preserves an eligible Autopsy run across every 5JD link", () => {
    renderShell("/stage-1?runId=run-123");

    expect(screen.getByRole("link", { name: "First 5 Jobs" })).toHaveAttribute("href", "/stage-1?runId=run-123");
    expect(screen.getAllByRole("link", { name: "Quotes" })[0]).toHaveAttribute("href", "/stage-1/quotes?runId=run-123");
    expect(screen.getByRole("link", { name: "Technical Guide" })).toHaveAttribute("href", "/stage-1/technical-guide?runId=run-123");
    expect(screen.getByRole("link", { name: "Business Details" })).toHaveAttribute("href", "/business-setup?runId=run-123");
  });

  it("preserves the demonstration boundary without leaking it into Core", () => {
    renderShell("/stage-1?demo=1");

    expect(screen.getAllByRole("link", { name: "Quotes" })[0]).toHaveAttribute("href", "/stage-1/quotes?demo=1");
    expect(screen.getByRole("link", { name: "Technical Guide" })).toHaveAttribute("href", "/stage-1/technical-guide?demo=1");
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute("href", "/leads");
  });
});
