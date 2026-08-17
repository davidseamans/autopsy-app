import { NavLink, Outlet, useLocation } from "react-router-dom";

const navGroups = [
  {
    label: "Autopsy",
    items: [
      { title: "Morning Orientation", url: "/orientation", badge: "Current" },
      { title: "Autopsy", url: "/autopsy" },
      { title: "History", url: "/autopsy/history" },
      { title: "Worksheet", url: "/worksheet", badge: "Needs run" },
      { title: "First Conversation", url: "/first-conversation", badge: "Experiment" },
    ],
  },
  {
    label: "5JD / Stage 1",
    items: [
      { title: "First 5 Jobs", url: "/stage-1" },
      { title: "Quotes", url: "/stage-1/quotes" },
      { title: "Technical Guide", url: "/stage-1/technical-guide" },
      { title: "Business Details", url: "/business-setup" },
    ],
  },
  {
    label: "BuildOS / Core",
    items: [
      { title: "Core overview", url: "/core", badge: "Read only" },
      { title: "Weekly roster", url: "/core/roster", badge: "Read only" },
    ],
  },
  {
    label: "Experiments",
    items: [
      { title: "Owner Cockpit", url: "/owner-cockpit", badge: "Experiment" },
      { title: "Staff Cockpit", url: "/staff-cockpit", badge: "Experiment" },
    ],
  },
];

export default function AppShell() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const runId = searchParams.get("runId");
  const stage1Context = searchParams.get("demo") === "1"
    ? "?demo=1"
    : runId
      ? `?runId=${encodeURIComponent(runId)}`
      : "";
  const embeddedFlightDeck =
    new URLSearchParams(window.location.search).get("embedded") === "flight-deck";

  if (embeddedFlightDeck) {
    return (
      <div className="min-h-screen bg-white text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
      <header className="border-b px-4 py-3">
        <div className="space-y-3">
          <div>
            <span className="text-sm font-semibold tracking-tight">Autopsy Console</span>
            <p className="text-xs text-muted-foreground">
              Existing screens are exposed here. Experimental screens are labelled, not deleted.
            </p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm" aria-label="Primary screens">
            {navGroups.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                {group.items.map((item) => (
                  <NavLink
                    key={item.url}
                    to={group.label === "5JD / Stage 1"
                      ? `${item.url}${stage1Context}`
                      : item.url}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-1.5 ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`
                    }
                  >
                    <span>{item.title}</span>
                    {item.badge ? (
                      <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </header>
      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
