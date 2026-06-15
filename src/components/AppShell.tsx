import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { title: "Autopsy", url: "/autopsy" },
  { title: "Launchpad", url: "/launchpad" },
  { title: "First 5 Jobs", url: "/stage-1" },
  { title: "Business Details", url: "/business-setup" },
];

export default function AppShell() {
  return (
    <div className="min-h-screen bg-white text-foreground">
      <header className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">Autopsy Console</span>
          <nav className="flex flex-wrap gap-2 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`
                }
              >
                {item.title}
              </NavLink>
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
