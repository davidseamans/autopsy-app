import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import { Autopsy, AutopsyRunRoute } from "@/components/autopsy/Autopsy";
import AutopsyHistory from "@/pages/AutopsyHistory";
import AutopsyWorksheet from "@/pages/AutopsyWorksheet";
import Leads from "@/pages/crm/Leads";
import Accounts from "@/pages/crm/Accounts";
import Pipeline from "@/pages/crm/Pipeline";
import Quotes from "@/pages/crm/Quotes";
import Jobs from "@/pages/crm/Jobs";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
  </QueryClientProvider>
);

export default App;
