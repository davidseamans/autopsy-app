import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import { Autopsy, AutopsyRunRoute } from "@/components/autopsy/Autopsy";
import AutopsyHistory from "@/pages/AutopsyHistory";
import Placeholder from "@/pages/Placeholder";
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
            <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
            <Route path="/autopsy" element={<Autopsy />} />
            <Route path="/autopsy/history" element={<AutopsyHistory />} />
            <Route path="/autopsy/run/:runId" element={<AutopsyRunRoute />} />
            <Route path="/pipeline" element={<Placeholder title="Pipeline" />} />
            <Route path="/quotes" element={<Placeholder title="Quotes" />} />
            <Route path="/jobs" element={<Placeholder title="Jobs" />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
