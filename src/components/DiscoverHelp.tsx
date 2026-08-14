import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, HelpCircle, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { buildHelpTargetUrl, searchDiscoverHelp, suggestedHelpEntries, type HelpEntry } from "@/lib/discoverHelp";

const MISSING_SEARCH_KEY = "buildos.discover-help.missing-searches.v1";

function rememberMissingSearch(query: string, pathname: string) {
  if (!query.trim() || typeof window === "undefined") return;
  try {
    const previous = JSON.parse(window.localStorage.getItem(MISSING_SEARCH_KEY) ?? "[]") as unknown[];
    const next = [...previous.slice(-19), { query: query.trim().slice(0, 160), pathname, recordedAt: new Date().toISOString() }];
    window.localStorage.setItem(MISSING_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // Help must remain available even when local storage is blocked.
  }
}

export function DiscoverHelp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const results = useMemo(() => searchDiscoverHelp(submittedQuery), [submittedQuery]);
  const suggestions = useMemo(() => suggestedHelpEntries(location.pathname), [location.pathname]);

  const runSearch = () => {
    const next = query.trim();
    setSubmittedQuery(next);
    if (next && searchDiscoverHelp(next).length === 0) rememberMissingSearch(next, location.pathname);
  };

  const goTo = (entry: HelpEntry) => {
    setOpen(false);
    navigate(buildHelpTargetUrl(entry, location.search));
  };

  const visibleEntries = submittedQuery ? results : suggestions;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" className="fixed bottom-5 right-5 z-40 gap-2 rounded-full bg-[#07375a] px-5 text-white shadow-lg hover:bg-[#082849]" aria-label="Open Help">
          <HelpCircle className="h-5 w-5" /> Help
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel="Close Help" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pr-24">
          <SheetTitle>How can we help?</SheetTitle>
          <SheetDescription>Search for a short answer. Help can take you to the right place, but it will never change your information.</SheetDescription>
        </SheetHeader>

        <form className="mt-6 flex gap-2" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try money owing, potential customer or margin" aria-label="Search Help" className="min-h-11" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Search Help"><Search className="h-5 w-5" /></Button>
        </form>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{submittedQuery ? `Results for “${submittedQuery}”` : "Useful on this screen"}</p>
          {visibleEntries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug text-slate-950">{entry.question}</h3>
                {entry.scope === "cleaning-sleeve" ? <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-800">Cleaning guide</span> : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{entry.answer}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => goTo(entry)}>
                {entry.target.label}<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </article>
          ))}
          {submittedQuery && visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">We do not have that answer yet.</p>
              <p className="mt-1 leading-relaxed">This search has been saved on this device for testing. Try fewer words, or use live Hudson only if the Help Library genuinely cannot resolve it.</p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function HelpTargetFocus() {
  const location = useLocation();
  const lastTarget = useRef<string | null>(null);

  useEffect(() => {
    const target = new URLSearchParams(location.search).get("helpTarget");
    if (!target || lastTarget.current === `${location.pathname}:${target}`) return;
    lastTarget.current = `${location.pathname}:${target}`;
    let highlighted: HTMLElement | null = null;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      highlighted = document.querySelector<HTMLElement>(`[data-help-target="${CSS.escape(target)}"]`);
      if (highlighted) {
        window.clearInterval(timer);
        highlighted.classList.add("relative", "z-30", "ring-4", "ring-teal-400", "ring-offset-4");
        highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => highlighted?.classList.remove("relative", "z-30", "ring-4", "ring-teal-400", "ring-offset-4"), 3500);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [location.pathname, location.search]);

  return null;
}
