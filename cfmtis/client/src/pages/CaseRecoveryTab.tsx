import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getFreezeLog } from "../api/freeze";
import { Button } from "../components/ui/Button";
import { RecoveryDonutChart } from "../components/recovery/DonutChart";
import { KPICard } from "../components/recovery/KPICard";
import { useCaseStore } from "../store/caseStore";
import { formatINR } from "../utils/format";
import { exportRecoveryReport } from "../utils/reportExport";

export const CaseRecoveryTab = () => {
  const { analysisDone, caseId } = useOutletContext<{ analysisDone: boolean; caseId: string }>();
  const activeCase = useCaseStore((state) => state.activeCase);
  const recovery = useCaseStore((state) => state.recoveryData);
  const [freezeLog, setFreezeLog] = useState<Array<{ id: string; accountNumber: string; timestamp: string; officer: { name: string } }>>([]);

  useEffect(() => {
    getFreezeLog(caseId).then(setFreezeLog).catch(() => setFreezeLog([]));
  }, [caseId]);

  if (!analysisDone && !recovery.totals) {
    return <div className="panel-card p-6 font-mono text-dim">Run analysis from the Complaint tab</div>;
  }

  const totals = recovery.totals ?? {
    fraudAmount: 0,
    recoverable: 0,
    atRisk: 0,
    lost: 0,
    frozen: 0,
    accountsTraced: 0,
    recoveryPct: 0
  };
  const handleExport = () => {
    exportRecoveryReport({
      caseId: activeCase?.complaintId ?? "Case",
      victimName: activeCase?.victimName ?? "Unknown",
      totals: [
        { label: "Total Fraud", value: formatINR(totals.fraudAmount) },
        { label: "Recoverable", value: formatINR(totals.recoverable) },
        { label: "At Risk", value: formatINR(totals.atRisk) },
        { label: "Accounts Traced", value: String(totals.accountsTraced) }
      ],
      accounts: recovery.accounts.map((account) => ({
        accountNumber: account.accountNumber,
        balance: formatINR(account.balance),
        status: account.status
      })),
      freezeLog: freezeLog.map((item) => ({
        accountNumber: item.accountNumber,
        officer: item.officer.name,
        timestamp: new Date(item.timestamp).toLocaleString("en-IN")
      }))
    });
  };

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <Button variant="primary" onClick={handleExport}>
          Export PDF
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <KPICard accent="var(--accent-red)" label="Total Fraud" value={formatINR(totals.fraudAmount)} />
        <KPICard accent="var(--accent-green)" label="Recoverable (Frozen)" value={formatINR(totals.recoverable)} />
        <KPICard accent="var(--accent-orange)" label="At Risk" value={formatINR(totals.atRisk)} />
        <KPICard accent="var(--accent-blue)" label="Accounts Traced" value={String(totals.accountsTraced)} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="panel-card max-h-[320px] overflow-auto p-5">
          <div className="section-header">Account-wise Distribution</div>
          <div className="mt-4 space-y-3">
            {recovery.accounts.map((account) => (
              <div
                key={account.accountNumber}
                className="flex items-center justify-between rounded-[4px] border border-border border-l-[4px] bg-card px-4 py-3"
                style={{
                  borderLeftColor:
                    account.status === "FROZEN"
                      ? "var(--accent-green)"
                      : account.status === "WITHDRAWN"
                        ? "#98a4b2"
                        : "var(--accent-red)"
                }}
              >
                <div>
                  <div className="font-mono text-primary">{account.accountNumber}</div>
                  <div className="text-sm text-secondary">{formatINR(account.balance)}</div>
                </div>
                <span className="font-mono text-xs text-cyan">{account.status}</span>
              </div>
            ))}
          </div>
        </div>

        <RecoveryDonutChart recoverable={totals.recoverable} atRisk={totals.atRisk} lost={totals.lost} />
      </div>
      <div className="panel-card p-5">
        <div className="section-header">Freeze Audit Log</div>
        <div className="mt-4 grid gap-3">
          {freezeLog.length === 0 ? (
            <div className="font-mono text-sm text-dim">No freeze actions recorded yet.</div>
          ) : (
            freezeLog.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-[4px] border border-border bg-card px-4 py-3">
                <div>
                  <div className="font-mono text-primary">{item.accountNumber}</div>
                  <div className="text-sm text-secondary">{item.officer.name}</div>
                </div>
                <div className="font-mono text-xs text-cyan">{new Date(item.timestamp).toLocaleString("en-IN")}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
