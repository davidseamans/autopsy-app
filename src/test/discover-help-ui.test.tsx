import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoverHelp, HelpTargetFocus } from "@/components/DiscoverHelp";
import { Stage1TourResume } from "@/components/Stage1WelcomeGuide";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output>;
}

describe("Discover Help interaction", () => {
  afterEach(() => vi.useRealTimers());

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

    fireEvent.click(screen.getByRole("button", { name: "Open Help" }));
    expect(screen.getByRole("textbox", { name: "Search Help" })).toHaveValue("");
    expect(screen.getByText("Useful on this screen")).toBeInTheDocument();
  });

  it("clears a prior search whenever Help is closed and reopened", () => {
    render(
      <MemoryRouter initialEntries={["/stage-1?demo=1"]}>
        <DiscoverHelp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Help" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search Help" }), { target: { value: "cleaning" } });
    fireEvent.click(screen.getByRole("button", { name: "Search Help" }));
    expect(screen.getByText('Results for “cleaning”')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Help" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Help" }));

    expect(screen.getByRole("textbox", { name: "Search Help" })).toHaveValue("");
    expect(screen.getByText("Useful on this screen")).toBeInTheDocument();
  });

  it("keeps Help visible below a separately positioned tour-resume control", () => {
    render(
      <MemoryRouter initialEntries={["/stage-1?demo=1"]}>
        <DiscoverHelp />
        <Stage1TourResume onClick={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Open Help" })).toHaveClass("bottom-5", "z-[250]");
    expect(screen.getByRole("button", { name: "Resume 5 Jobs Tour" })).toHaveClass("bottom-20", "z-[200]");
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

  it("scrolls to and temporarily highlights an authorised stable target", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(
      <MemoryRouter initialEntries={["/stage-1?demo=1&helpTarget=money-owing"]}>
        <HelpTargetFocus />
        <section data-help-target="money-owing">Money owing</section>
      </MemoryRouter>,
    );

    vi.advanceTimersByTime(100);
    const target = screen.getByText("Money owing");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(target).toHaveClass("ring-teal-400");

    vi.advanceTimersByTime(3500);
    expect(target).not.toHaveClass("ring-teal-400");
  });
});
