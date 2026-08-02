import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/AuthGate";
import AppShell from "@/components/AppShell";
import { Autopsy, AutopsyRunRoute } from "@/components/autopsy/Autopsy";
import AutopsyHistory from "@/pages/AutopsyHistory";
import AutopsyWorksheet from "@/pages/AutopsyWorksheet";
import ReadinessWorksheet from "@/pages/ReadinessWorksheet";
import Stage1Dashboard from "@/pages/Stage1Dashboard";
import MorningOrientation from "@/pages/MorningOrientation";
import FirstConversation from "@/pages/FirstConversation";
import PaidAutopsyEntry from "@/pages/PaidAutopsyEntry";
import OwnerCockpit from "@/pages/OwnerCockpit";
import StaffCockpit from "@/pages/StaffCockpit";
import Leads from "@/pages/crm/Leads";
import Accounts from "@/pages/crm/Accounts";
import Pipeline from "@/pages/crm/Pipeline";
import Quotes from "@/pages/crm/Quotes";
import Jobs from "@/pages/crm/Jobs";
import NotFound from "./pages/NotFound.tsx";
import BusinessSetup from "@/pages/BusinessSetup";
import Stage1QuoteNew from "@/pages/Stage1QuoteNew";
import Stage1QuoteDocument from "@/pages/Stage1QuoteDocument";
import AutopsyClaim from "@/pages/AutopsyClaim";
import Stage1Leads from "@/pages/Stage1Leads";
import Stage1Quotes from "@/pages/Stage1Quotes";

const queryClient = new QueryClient();
const FirstConversationRoute = () => (
  <AuthGate>
    <FirstConversation />
  </AuthGate>
);
const BusinessSetupRoute = () => (
  <AuthGate>
    <BusinessSetup />
  </AuthGate>
);
const Stage1QuoteNewRoute = () => (
  <AuthGate>
    <Stage1QuoteNew />
  </AuthGate>
);
const Stage1LeadsRoute = () => (
  <AuthGate>
    <Stage1Leads />
  </AuthGate>
);
const Stage1QuotesRoute = () => (
  <AuthGate>
    <Stage1Quotes />
  </AuthGate>
);
const Stage1QuoteDocumentRoute = () => (
  <AuthGate>
    <Stage1QuoteDocument />
  </AuthGate>
);

const LegacyStage1Redirect = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

const PaidAutopsyRoute = () => {
  const params = new URLSearchParams(window.location.search);
  const embeddedPreview =
    window.location.hostname ===
      "autopsy-app-git-codex-voice-autopsy-integration-david-seamans.vercel.app" &&
    params.get("test_payment") === "accepted" &&
    params.get("embedded") === "flight-deck";

  return embeddedPreview ? (
    <PaidAutopsyEntry />
  ) : (
    <AuthGate>
      <PaidAutopsyEntry />
    </AuthGate>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/orientation" replace />} />
              <Route path="/orientation" element={<MorningOrientation />} />
              <Route path="/first-conversation" element={<FirstConversationRoute />} />
              <Route path="/owner-cockpit" element={<OwnerCockpit />} />
              <Route path="/staff-cockpit" element={<StaffCockpit />} />
              <Route path="/autopsy" element={<Autopsy />} />
              <Route path="/autopsy/history" element={<AutopsyHistory />} />
              <Route path="/autopsy/run/:runId" element={<AutopsyRunRoute />} />
              <Route path="/autopsy/claim/:runId" element={<AutopsyClaim />} />
              <Route path="/autopsy/run/:runId/worksheet" element={<AutopsyWorksheet />} />
              <Route path="/autopsy/run/:runId/readiness" element={<ReadinessWorksheet />} />
              <Route path="/worksheet" element={<AutopsyWorksheet />} />
              <Route path="/worksheet/:runId" element={<AutopsyWorksheet />} />
              <Route path="/stage-1" element={<Stage1Dashboard />} />
              <Route path="/stage-1/leads" element={<Stage1LeadsRoute />} />
              <Route path="/stage-1/quotes" element={<Stage1QuotesRoute />} />
              <Route path="/stage-1/quotes/new" element={<Stage1QuoteNewRoute />} />
              <Route path="/stage-1/quote/:quoteId" element={<Stage1QuoteDocumentRoute />} />
              <Route path="/launchpad" element={<LegacyStage1Redirect to="/stage-1" />} />
              <Route path="/launchpad/leads" element={<LegacyStage1Redirect to="/stage-1/leads" />} />
              <Route path="/launchpad/quote/new" element={<LegacyStage1Redirect to="/stage-1/quotes/new" />} />
              <Route path="/business-setup" element={<BusinessSetupRoute />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/jobs" element={<Jobs />} />
            </Route>
            <Route path="/autopsy/paid" element={<PaidAutopsyRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
