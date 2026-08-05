import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CleaningTechnicalGuide from "@/pages/CleaningTechnicalGuide";

describe("Cleaning Technical Guide touch journey", () => {
  it("shows observation reference images without replacing the plain-language choices", () => {
    const { container } = render(<MemoryRouter initialEntries={["/stage-1/technical-guide?demo=1"]}><CleaningTechnicalGuide /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Shower Screens, tiles, grout, seals and tracks" }));

    expect(screen.getByRole("button", { name: "Greasy or sticky film" })).toBeInTheDocument();
    expect(container.querySelectorAll('img[src^="/technical-guide/shower/"]')).toHaveLength(5);
    expect(container.querySelector('img[src="/technical-guide/shower/greasy-film.webp"]')).toHaveAttribute("loading", "lazy");
  });

  it("routes an unknown prior product to a clear stop result", () => {
    render(
      <MemoryRouter initialEntries={["/stage-1/technical-guide?demo=1"]}>
        <CleaningTechnicalGuide />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Shower Screens, tiles, grout, seals and tracks" }));
    expect(screen.getByRole("heading", { name: "What are you seeing?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Greasy or sticky film" }));
    fireEvent.click(screen.getByRole("button", { name: "Glass" }));
    expect(screen.getByLabelText("Shower area map")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Screen or door" }));
    fireEvent.click(screen.getByRole("button", { name: "Something, but I’m not sure what" }));

    expect(screen.getByRole("heading", { name: "Stop before applying another product" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Do not add another chemical" })).toBeInTheDocument();
    expect(screen.getByText(/Do not try to neutralise/)).toBeInTheDocument();
  });

  it("shows a complete process and outcome for an ordinary film pathway", () => {
    render(<MemoryRouter initialEntries={["/stage-1/technical-guide?demo=1"]}><CleaningTechnicalGuide /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Shower Screens, tiles, grout, seals and tracks" }));
    fireEvent.click(screen.getByRole("button", { name: "Greasy or sticky film" }));
    fireEvent.click(screen.getByRole("button", { name: "Glass" }));
    fireEvent.click(screen.getByRole("button", { name: "Screen or door" }));
    fireEvent.click(screen.getByRole("button", { name: "Nothing yet" }));

    expect(screen.getByRole("heading", { name: "Remove ordinary organic and soap film" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Read the label and ventilate" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Expected outcome" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What to tell the customer" })).toBeInTheDocument();
  });

  it("lets the operator return to a completed answer without losing the journey", () => {
    render(<MemoryRouter initialEntries={["/stage-1/technical-guide?demo=1"]}><CleaningTechnicalGuide /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Shower Screens, tiles, grout, seals and tracks" }));
    fireEvent.click(screen.getByRole("button", { name: "White or chalky marks" }));
    expect(screen.getByRole("button", { name: "White or chalky marks · Change" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "White or chalky marks · Change" }));

    expect(screen.getByRole("heading", { name: "What are you seeing?" })).toBeInTheDocument();
  });
});
