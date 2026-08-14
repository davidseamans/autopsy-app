import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DiscoverHelp } from "@/components/DiscoverHelp";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output>;
}

describe("Discover Help interaction", () => {
  it("answers briefly and navigates to a stable target without copying tour state", () => {
    render(
      <MemoryRouter initialEntries={["/stage-1?demo=1&tour=1"]}>
        <DiscoverHelp />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Help" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search Help" }), { target: { value: "money owing" } });
    fireEvent.click(screen.getByRole("button", { name: "Search Help" }));

    expect(screen.getByText("Where can I see money owing?")).toBeInTheDocument();
    expect(screen.getByText(/practical follow-up view/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show Money Owing/i }));

    expect(screen.getByRole("status", { name: "Current route" })).toHaveTextContent("/stage-1?demo=1&helpTarget=money-owing");
  });

  it("does not invent an answer for an unknown question", () => {
    render(
      <MemoryRouter initialEntries={["/stage-1?demo=1"]}>
        <DiscoverHelp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Help" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search Help" }), { target: { value: "interplanetary franchise licence" } });
    fireEvent.click(screen.getByRole("button", { name: "Search Help" }));

    expect(screen.getByText("We do not have that answer yet.")).toBeInTheDocument();
    expect(screen.getByText(/saved on this device for testing/i)).toBeInTheDocument();
  });
});
