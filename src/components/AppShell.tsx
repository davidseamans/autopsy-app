import { NavLink, Outlet } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Stethoscope,
  GitBranch,
  FileText,
  Briefcase,
  Users,
  Building2,
  Rocket,
  IdCard,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Autopsy", url: "/autopsy", icon: Stethoscope },
  { title: "Launchpad", url: "/launchpad", icon: Rocket },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Pipeline", url: "/pipeline", icon: GitBranch },
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
  { title: "First 5 Jobs Dashboard", url: "/stage-1", icon: LayoutDashboard },
  { title: "Business Setup", url: "/business-setup", icon: IdCard },
];

const archiveItems = [
  { title: "Preliminary First 5 Jobs Dashboard", url: "/stage-1-archived", icon: Archive },
];

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>CRM</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2",
                          isActive &&
                            "bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] font-medium border-l-2 border-[hsl(var(--autopsy-accent))]",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Archive / Legacy</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {archiveItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2",
                          isActive &&
                            "bg-[hsl(var(--autopsy-accent-soft))] text-[hsl(var(--autopsy-accent))] font-medium border-l-2 border-[hsl(var(--autopsy-accent))]",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function AppShell() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[hsl(var(--autopsy-bg))] text-foreground">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 gap-2 bg-white">
            <SidebarTrigger />
            <span className="text-sm font-medium tracking-tight">Autopsy Console</span>
          </header>
          <main className="flex-1 min-w-0 bg-white">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}