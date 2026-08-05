import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveShowerProcedure, searchMatchesShower, showerObservationOptions } from "@/lib/cleaningTechnicalGuide";

describe("Cleaning Technical Guide Stage Pack", () => {
  it("recognises ordinary shower search language and field aliases", () => {
    expect(searchMatchesShower("shower")).toBe(true);
    expect(searchMatchesShower("bodyfat")).toBe(true);
    expect(searchMatchesShower("soap scum")).toBe(true);
    expect(searchMatchesShower("carpet stain")).toBe(false);
  });

  it("provides an original reference image for each observable shower condition", () => {
    const observableConditions = showerObservationOptions.filter((option) => option.key !== "unsure");
    expect(observableConditions).toHaveLength(5);
    expect(observableConditions.every((option) => option.image?.startsWith("/technical-guide/shower/"))).toBe(true);
  });

  it("preserves the bounded 5JD Sleeve controls", () => {
    const page = readFileSync(resolve("src/pages/CleaningTechnicalGuide.tsx"), "utf8");
    const model = readFileSync(resolve("src/lib/cleaningTechnicalGuide.ts"), "utf8");
    expect(page).toContain("Cleaning Sleeve · 5JD Stage Pack");
    expect(page).toContain("Expert review build.");
    expect(page).toContain("Expected outcome");
    expect(page).toContain("Authority and safety sources");
    expect(model).toContain("Do not add another chemical");
    expect(model).toContain("Ready for Gai’s field-method review");
    expect(page).toContain("Shower area map");
    expect(page).toContain("Your answers");
    expect(model).toContain("I’m not sure");
  });

  it("resolves ordinary observations to a procedure and uncertainty to a hard stop", () => {
    expect(resolveShowerProcedure({ observation: "greasy-film", surface: "glass", location: "screen", previousProduct: "nothing" }).key).toBe("greasy-film");
    expect(resolveShowerProcedure({ observation: "white-marks", surface: "tile", location: "wall-floor", previousProduct: "known" }).key).toBe("white-marks");
    expect(resolveShowerProcedure({ observation: "dark-spots", surface: "grout", location: "wall-floor", previousProduct: "nothing" }).key).toBe("dark-spots");
    expect(resolveShowerProcedure({ observation: "damage", surface: "glass", location: "screen", previousProduct: "nothing" }).status).toBe("Stop and escalate");
    expect(resolveShowerProcedure({ observation: "greasy-film", surface: "glass", location: "screen", previousProduct: "unknown" }).status).toBe("Stop and escalate");
  });

  it("is reachable from eligible 5JD without creating another Core surface", () => {
    const app = readFileSync(resolve("src/App.tsx"), "utf8");
    const shell = readFileSync(resolve("src/components/AppShell.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(app).toContain('/stage-1/technical-guide');
    expect(shell).toContain('{ title: "Technical Guide", url: "/stage-1/technical-guide" }');
    expect(dashboard).toContain("Open technical guide");
    expect(shell).not.toContain('{ title: "Technical Guide", url: "/technical-guide" }');
  });
});
