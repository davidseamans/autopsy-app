import { describe, expect, it } from "vitest";
import { buildHelpTargetUrl, discoverHelpEntries, searchDiscoverHelp, suggestedHelpEntries } from "@/lib/discoverHelp";

describe("Discover Help Library", () => {
  it("finds practical questions using the candidate's words", () => {
    expect(searchDiscoverHelp("who owes me money")[0]?.id).toBe("money-owing");
    expect(searchDiscoverHelp("potential customer phone number")[0]?.id).toBe("lead-contact-details");
    expect(searchDiscoverHelp("cleaning shower chemical")[0]?.id).toBe("cleaning-guide");
  });

  it("returns no invented answer when there is no match", () => {
    expect(searchDiscoverHelp("interplanetary franchise licence")).toEqual([]);
  });

  it("preserves the governed run context in stable targets", () => {
    const entry = discoverHelpEntries.find(({ id }) => id === "money-owing");
    expect(entry).toBeDefined();
    expect(buildHelpTargetUrl(entry!, "?runId=run-123&tour=1")).toBe("/stage-1?runId=run-123&helpTarget=money-owing");
  });

  it("preserves demo context without copying unrelated query state", () => {
    const entry = discoverHelpEntries.find(({ id }) => id === "quotes-potential");
    expect(entry).toBeDefined();
    expect(buildHelpTargetUrl(entry!, "?demo=1&step=4&autoplay=1")).toBe("/stage-1/quotes?demo=1&helpTarget=quotes-potential");
  });

  it("suggests help relevant to the current screen", () => {
    expect(suggestedHelpEntries("/stage-1/quotes/new").map(({ id }) => id)).toContain("prepare-quote");
    expect(suggestedHelpEntries("/stage-1/technical-guide").map(({ id }) => id)).toContain("cleaning-guide");
  });

  it("keeps the Cleaning guide visibly Sleeve-owned", () => {
    const cleaning = discoverHelpEntries.filter(({ scope }) => scope === "cleaning-sleeve");
    expect(cleaning.map(({ id }) => id)).toEqual(["cleaning-guide"]);
  });
});
