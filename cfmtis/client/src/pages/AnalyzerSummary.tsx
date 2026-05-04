import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnalyzerSummary, uploadDatasetRequest } from "../api/analyzer";
import { PageShell } from "../components/layout/PageShell";
import { KPICard } from "../components/recovery/KPICard";
import { Button } from "../components/ui/Button";
import { formatINR } from "../utils/format";

export const AnalyzerSummaryPage = () => {
  const [summary, setSummary] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const loadSummary = async () => {
    const data = await getAnalyzerSummary();
    setSummary(data);
  };

  useEffect(() => {
    loadSummary().catch(() => undefined);
  }, []);

  return (
    <PageShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="font-cond text-3xl uppercase tracking-[0.2em]">Fraud Intelligence Analyzer</div>
          <div className="mt-1 text-sm text-secondary">
            Multi-sheet dataset ingestion, case linking, risk ranking, recovery, and bank intelligence.
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              await uploadDatasetRequest(file);
              await loadSummary();
              setUploading(false);
            }}
          />
          <Button variant="primary">{uploading ? "Uploading Dataset" : "Upload Dataset"}</Button>
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard accent="var(--accent-blue)" label="Cases Analyzed" value={String(summary?.totalCases ?? 0)} />
        <KPICard accent="var(--accent-orange)" label="Total Fraud Amount" value={formatINR(summary?.totalAmount ?? 0)} />
        <KPICard accent="var(--accent-green)" label="Recovered Amount" value={formatINR(summary?.recoveredAmount ?? 0)} />
        <KPICard accent="var(--accent-red)" label="Critical Cases" value={String(summary?.criticalCases ?? 0)} />
      </div>

      <div className="panel-card mt-6 overflow-hidden">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-panel text-xs uppercase tracking-[0.2em] text-secondary">
            <tr>
              <th className="px-4 py-3">Acknowledgement</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Recovery</th>
              <th className="px-4 py-3">Views</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.cases ?? []).map((item: any) => (
              <tr key={item.caseId} className="border-t border-border hover:bg-hover">
                <td className="px-4 py-3 font-mono text-primary">{item.acknowledgementNo}</td>
                <td className="px-4 py-3">{formatINR(item.totalAmount)}</td>
                <td className="px-4 py-3">{item.risk?.level}</td>
                <td className="px-4 py-3">{Math.round((item.recovery?.recoveryRate ?? 0) * 100)}%</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <Link to={`/analyzer/graph/${item.caseId}`} className="text-blue">Graph</Link>
                    <Link to={`/analyzer/timeline/${item.caseId}`} className="text-blue">Timeline</Link>
                    <Link to={`/analyzer/withdrawals/${item.caseId}`} className="text-blue">Withdrawals</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
};
