import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { Autopsy, AutopsyRunRoute } from "@/components/autopsy/Autopsy";
import AutopsyHistory from "@/pages/AutopsyHistory";
import AutopsyWorksheet from "@/pages/AutopsyWorksheet";
import ReadinessWorksheet from "@/pages/ReadinessWorksheet";
import Stage1 from "@/pages/Stage1";
import Stage1Dashboard from "@/pages/Stage1Dashboard";
import Stage1Archived from "@/pages/Stage1Archived";
import Leads from "@/pages/crm/Leads";
import Accounts from "@/pages/crm/Accounts";
import Pipeline from "@/pages/crm/Pipeline";
import Quotes from "@/pages/crm/Quotes";
import Jobs from "@/pages/crm/Jobs";
import NotFound from "./pages/NotFound.tsx";
import Placeholder from "@/pages/Placeholder";
import Launchpad from "@/pages/Launchpad";
import BusinessSetup from "@/pages/BusinessSetup";
import LaunchpadQuoteNew from "@/pages/LaunchpadQuoteNew";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/autopsy" replace />} />
            <Route path="/autopsy" element={<Autopsy />} />
            <Route path="/autopsy/history" element={<AutopsyHistory />} />
            <Route path="/autopsy/run/:runId" element={<AutopsyRunRoute />} />
            <Route path="/autopsy/run/:runId/worksheet" element={<AutopsyWorksheet />} />
            <Route path="/autopsy/run/:runId/readiness" element={<ReadinessWorksheet />} />
            <Route path="/worksheet" element={<AutopsyWorksheet />} />
            <Route path="/worksheet/:runId" element={<AutopsyWorksheet />} />
            <Route path="/stage-1" element={<Stage1Dashboard />} />
            <Route path="/stage-1-archived" element={<Stage1Archived />} />
            <Route path="/launchpad" element={<Launchpad />} />
            <Route path="/launchpad/quote/new" element={<LaunchpadQuoteNew />} />
            <Route path="/business-setup" element={<BusinessSetup />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/jobs" element={<Jobs />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
