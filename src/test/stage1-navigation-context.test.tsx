import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppShell from "@/components/AppShell";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));

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
    renderShell("/stage-1?demo=1&runId=sample-run");

    expect(screen.getAllByRole("link", { name: "Quotes" })[0]).toHaveAttribute("href", "/stage-1/quotes?demo=1");
    expect(screen.getByRole("link", { name: "Technical Guide" })).toHaveAttribute("href", "/stage-1/technical-guide?demo=1");
    expect(screen.getByRole("link", { name: "Core overview Read only" })).toHaveAttribute("href", "/core");
  });

  it("opens only Stage 1 demonstration routes without an account session", () => {
    const app = readFileSync(resolve("src/App.tsx"), "utf8");
    const gate = readFileSync(resolve("src/components/AuthGate.tsx"), "utf8");

    expect(app.match(/<AuthGate allowDemo>/g)).toHaveLength(6);
    expect(gate).toContain('new URLSearchParams(window.location.search).get("demo") === "1"');
    expect(gate).toContain("if (demonstrationOnly)");
    expect(app).toContain("const BusinessSetupRoute = () => (\n  <AuthGate>");
    expect(app).toContain("const FirstConversationRoute = () => <FirstConversation />");
  });
});
