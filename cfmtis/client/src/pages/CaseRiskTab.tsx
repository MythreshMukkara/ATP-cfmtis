import { useOutletContext } from "react-router-dom";
import { RiskTable } from "../components/risk/RiskTable";
import { Button } from "../components/ui/Button";
import { useFreeze } from "../hooks/useFreeze";
import { useCaseStore } from "../store/caseStore";
import { formatINR, riskColor } from "../utils/format";
import { exportRiskReport } from "../utils/reportExport";

export const CaseRiskTab = () => {
  const { analysisDone } = useOutletContext<{ analysisDone: boolean }>();
  const activeCase = useCaseStore((state) => state.activeCase);
  const items = useCaseStore((state) => state.riskData);
  const repeatedAccounts = useCaseStore((state) => state.repeatedAccounts);
  const { freezeAccount, unfreezeAccount, freezeCritical } = useFreeze();
  const recoveryTotals = useCaseStore((state) => state.recoveryData.totals);
  const factors = [
    { label: "Rapid Splitting", value: 82, level: "HIGH" },
    { label: "Transaction Velocity", value: 61, level: "MEDIUM" },
    { label: "New Account (<30d)", value: 74, level: "HIGH" },
    { label: "Location Mismatch", value: 36, level: "LOW" },
    { label: "Chain Depth (>3)", value: 57, level: "MEDIUM" }
  ];

  if (!analysisDone && items.length === 0) {
    return <div className="panel-card p-6 font-mono text-dim">Run analysis from the Complaint tab</div>;
  }

  const criticalCount = items.filter((item) => item.riskLevel === "CRITICAL").length;
  const frozenCount = items.filter((item) => item.isFrozen).length;
  const handleExport = () => {
    exportRiskReport({
      caseId: activeCase?.complaintId ?? "Case",
      victimName: activeCase?.victimName ?? "Unknown",
      items: items.map((item) => ({
        accountNumber: item.accountNumber,
        holderName: item.holderName,
        bankName: item.bankName,
        currentBalance: formatINR(item.currentBalance),
        riskScore: Math.round(item.riskScore),
        riskLevel: item.riskLevel,
        accountStatus: item.accountStatus
      }))
    });
  };

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <RiskTable items={items} onFreeze={freezeAccount} onUnfreeze={unfreezeAccount} />
      <aside className="flex flex-col gap-4">
        <Button variant="primary" onClick={handleExport}>
          Export PDF
        </Button>
        <div className="panel-card p-4">
          <div className="section-header">Risk Factors</div>
          <div className="mt-4 grid gap-4">
            {factors.map((factor) => (
              <div key={factor.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{factor.label}</span>
                  <span className="font-mono" style={{ color: riskColor(factor.level) }}>{factor.level}</span>
                </div>
                <div className="risk-bar h-2">
                  <span style={{ width: `${factor.value}%`, background: riskColor(factor.level) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel-card p-4">
          <div className="section-header">Cross-Case Repeats</div>
          <div className="mt-4 grid gap-3">
            {repeatedAccounts.length === 0 ? (
              <div className="font-mono text-sm text-dim">No repeated account numbers found in other cases.</div>
            ) : (
              repeatedAccounts.map((item) => (
                <div key={item.accountNumber} className="rounded-[8px] border border-border bg-card px-3 py-3">
                  <div className="font-mono text-sm text-primary">{item.accountNumber}</div>
                  <div className="mt-1 text-sm text-secondary">
                    Seen in {item.caseCount} other case{item.caseCount === 1 ? "" : "s"}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-secondary">
                    {item.cases.map((relatedCase) => (
                      <div key={`${item.accountNumber}-${relatedCase.caseId}`}>
                        {relatedCase.complaintId} · {relatedCase.victimName}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel-card p-4">
          <div className="section-header">Freeze Summary</div>
          <div className="mt-4 grid gap-2 font-mono text-sm text-secondary">
            <div className="flex justify-between"><span>Accounts Analyzed</span><span>{items.length}</span></div>
            <div className="flex items-center justify-between">
              <span>Recommended Freeze</span>
              <span className="rounded-[4px] px-2 py-1 text-[11px] text-white" style={{ background: "var(--accent-red)" }}>{criticalCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Under Review</span>
              <span className="rounded-[4px] px-2 py-1 text-[11px] text-white" style={{ background: "var(--accent-yellow)" }}>{items.filter((item) => item.riskLevel === "HIGH").length}</span>
            </div>
            <div className="flex justify-between"><span>Frozen</span><span>{frozenCount}</span></div>
            <div className="my-1 border-t border-border" />
            <div className="flex justify-between text-primary"><span>Amount Secured</span><span>{formatINR(recoveryTotals?.frozen ?? 0)}</span></div>
          </div>
          <Button variant="danger" fullWidth className="mt-4 text-white" style={{ background: "var(--accent-red)", borderColor: "var(--accent-red)" }} onClick={freezeCritical}>
            Freeze All Critical Accounts
          </Button>
        </div>
      </aside>
    </div>
  );
};
