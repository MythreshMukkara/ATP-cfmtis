import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { getCase, getCases } from "../api/cases";
import { getFiles, getGraph, getRecovery, getRisk } from "../api/analysis";
import { NavTabs } from "../components/layout/NavTabs";
import { Topbar } from "../components/layout/Topbar";
import { useCaseStore } from "../store/caseStore";
import { useGraphStore } from "../store/graphStore";
import { formatINR } from "../utils/format";

export const CaseWorkspacePage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activeCase = useCaseStore((state) => state.activeCase);
  const cases = useCaseStore((state) => state.cases);
  const setCases = useCaseStore((state) => state.setCases);
  const setActiveCase = useCaseStore((state) => state.setActiveCase);
  const setRiskData = useCaseStore((state) => state.setRiskData);
  const setRecoveryData = useCaseStore((state) => state.setRecoveryData);
  const setPatternAlerts = useCaseStore((state) => state.setPatternAlerts);
  const setRepeatedAccounts = useCaseStore((state) => state.setRepeatedAccounts);
  const setUploadedFiles = useCaseStore((state) => state.setUploadedFiles);
  const riskData = useCaseStore((state) => state.riskData);
  const recoveryData = useCaseStore((state) => state.recoveryData);
  const setGraph = useGraphStore((state) => state.setGraph);
  const graphSummary = useGraphStore((state) => state.summary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [caseData, caseList] = await Promise.all([
        getCase(id),
        cases.length ? Promise.resolve({ items: cases }) : getCases().catch(() => ({ items: [] }))
      ]);

      if (!cases.length) {
        setCases(caseList.items ?? []);
      }

      setActiveCase({
        id: caseData.id,
        complaintId: caseData.complaintId,
        fraudType: caseData.fraudType,
        fraudAmount: caseData.fraudAmount,
        victimAccount: caseData.victimAccount,
        victimName: caseData.victimName,
        victimMobile: caseData.victimMobile,
        bankName: caseData.bankName,
        fraudTimestamp: caseData.fraudTimestamp,
        description: caseData.description,
        status: caseData.status,
        analysisStatus: caseData.analysisStatus
      });
      const [files, graph, risk, recovery] = await Promise.all([
        getFiles(id).catch(() => []),
        getGraph(id).catch(() => ({ nodes: [], edges: [], alerts: [], summary: null })),
        getRisk(id).catch(() => ({ items: [] })),
        getRecovery(id).catch(() => ({ totals: null, accounts: [], log: [] }))
      ]);
      setUploadedFiles(files);
      setGraph({ nodes: graph.nodes ?? [], edges: graph.edges ?? [], summary: graph.summary ?? null });
      setPatternAlerts(graph.alerts ?? []);
      setRiskData(risk.items ?? []);
      setRepeatedAccounts(risk.repeatedAccounts ?? []);
      setRecoveryData(recovery);
      setLoading(false);
    };

    load();
  }, [cases, id, setActiveCase, setCases, setGraph, setPatternAlerts, setRecoveryData, setRepeatedAccounts, setRiskData, setUploadedFiles]);

  const analysisDone = useMemo(
    () =>
      activeCase?.analysisStatus === "DONE" ||
      Boolean(graphSummary) ||
      riskData.length > 0 ||
      Boolean(recoveryData.totals),
    [activeCase?.analysisStatus, graphSummary, recoveryData.totals, riskData.length]
  );
  const tab = location.pathname.split("/").pop();

  useEffect(() => {
    if (location.pathname === `/case/${id}`) {
      navigate(`/case/${id}/${analysisDone ? "graph" : "complaint"}`, { replace: true });
    }
  }, [analysisDone, id, location.pathname, navigate]);

  if (loading || !activeCase) {
    return (
      <div className="grid min-h-screen place-items-center bg-deep font-mono text-secondary">
        Loading active case workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep">
      <Topbar caseId={activeCase.complaintId} />
      <main className="grid min-h-screen grid-cols-[280px_1fr] gap-6 px-6 pb-6 pt-[82px]">
        <aside className="sticky top-[82px] h-[calc(100vh-106px)] overflow-hidden rounded-[14px] border border-border bg-panel/92 shadow-[0_18px_40px_rgba(22,48,67,0.08)]">
          <div className="border-b border-border px-5 py-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-secondary">Workspace</div>
            <div className="mt-2 text-lg font-semibold text-primary">{activeCase.victimName}</div>
            <div className="mt-1 font-mono text-xs text-secondary">{activeCase.complaintId}</div>
            <div className="mt-4 rounded-[10px] border border-border bg-card px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-secondary">Fraud Amount</div>
              <div className="mt-1 font-mono text-lg text-primary">{formatINR(activeCase.fraudAmount)}</div>
            </div>
          </div>

          <div className="border-b border-border px-4 py-4">
            <div className="grid gap-2">
              <Link to="/dashboard" className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm text-primary transition hover:bg-hover">
                Home Dashboard
              </Link>
              <Link to="/cases" className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm text-primary transition hover:bg-hover">
                Switch Cases
              </Link>
              <Link
                to={`/case/${id}/flagged`}
                className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm text-primary transition hover:bg-hover"
              >
                Flagged Accounts
              </Link>
            </div>
          </div>

          <div className="border-b border-border px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-secondary">Recent Cases</div>
            <div className="mt-3 grid max-h-[300px] gap-2 overflow-auto pr-1">
              {cases.slice(0, 12).map((caseItem) => {
                const active = caseItem.id === id;
                return (
                  <Link
                    key={caseItem.id}
                    to={`/case/${caseItem.id}/${caseItem.analysisStatus === "DONE" ? "graph" : "complaint"}`}
                    className={`rounded-[10px] border px-3 py-3 transition ${
                      active
                        ? "border-cyan bg-cyan/10"
                        : "border-border bg-card hover:bg-hover"
                    }`}
                  >
                    <div className="font-mono text-xs text-cyan">{caseItem.complaintId}</div>
                    <div className="mt-1 text-sm text-primary">{caseItem.victimName}</div>
                    <div className="mt-1 text-xs text-secondary">{caseItem.fraudType}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 rounded-[14px] border border-border bg-panel/92 shadow-[0_12px_30px_rgba(22,48,67,0.08)]">
            <NavTabs caseId={id} analysisDone={analysisDone} />
          </div>
          <Outlet context={{ caseId: id, activeCase, tab, analysisDone }} />
        </section>
      </main>
    </div>
  );
};
