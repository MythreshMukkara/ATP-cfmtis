import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AnalyzerBanksPage } from "./pages/AnalyzerBanks";
import { AnalyzerGraphPage } from "./pages/AnalyzerGraph";
import { AnalyzerSummaryPage } from "./pages/AnalyzerSummary";
import { AnalyzerTimelinePage } from "./pages/AnalyzerTimeline";
import { AnalyzerWithdrawalsPage } from "./pages/AnalyzerWithdrawals";
import { AdminPage } from "./pages/Admin";
import { CaseComplaintTab } from "./pages/CaseComplaintTab";
import { CaseFlaggedAccountsPage } from "./pages/CaseFlaggedAccountsPage";
import { CaseGraphTab } from "./pages/CaseGraphTab";
import { CaseRecoveryTab } from "./pages/CaseRecoveryTab";
import { CaseRiskTab } from "./pages/CaseRiskTab";
import { CaseWorkspacePage } from "./pages/CaseWorkspace";
import { CasesListPage } from "./pages/CasesList";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { NewCasePage } from "./pages/NewCase";
import { NotificationBanner } from "./components/ui/NotificationBanner";
import { useAuthStore } from "./store/authStore";

const Protected = ({ children }: { children: JSX.Element }) => {
  const officer = useAuthStore((state) => state.officer);
  return officer ? children : <Navigate to="/login" replace />;
};

export const App = () => (
  <BrowserRouter>
    <NotificationBanner />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/analyzer/summary" element={<Protected><AnalyzerSummaryPage /></Protected>} />
      <Route path="/analyzer/banks" element={<Protected><AnalyzerBanksPage /></Protected>} />
      <Route path="/analyzer/graph/:caseId" element={<Protected><AnalyzerGraphPage /></Protected>} />
      <Route path="/analyzer/timeline/:caseId" element={<Protected><AnalyzerTimelinePage /></Protected>} />
      <Route path="/analyzer/withdrawals/:caseId" element={<Protected><AnalyzerWithdrawalsPage /></Protected>} />
      <Route path="/cases" element={<Protected><CasesListPage /></Protected>} />
      <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
      <Route path="/case/new" element={<Protected><NewCasePage /></Protected>} />
      <Route path="/case/:id" element={<Protected><CaseWorkspacePage /></Protected>}>
        <Route path="complaint" element={<CaseComplaintTab />} />
        <Route path="flagged" element={<CaseFlaggedAccountsPage />} />
        <Route path="graph" element={<CaseGraphTab />} />
        <Route path="risk" element={<CaseRiskTab />} />
        <Route path="recovery" element={<CaseRecoveryTab />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);
