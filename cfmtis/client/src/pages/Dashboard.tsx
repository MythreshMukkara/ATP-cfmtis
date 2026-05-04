import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { downloadSampleDataset, getSampleDatasets } from "../api/analysis";
import { getCases } from "../api/cases";
import { PageShell } from "../components/layout/PageShell";
import { KPICard } from "../components/recovery/KPICard";
import { RiskPill } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useCaseStore } from "../store/caseStore";
import { formatINR } from "../utils/format";

export const DashboardPage = () => {
  const cases = useCaseStore((state) => state.cases);
  const setCases = useCaseStore((state) => state.setCases);
  const [sampleDatasets, setSampleDatasets] = useState<Array<{ id: string; filename: string }>>([]);
  const [selectedDataset, setSelectedDataset] = useState("");

  useEffect(() => {
    getCases().then((data) => setCases(data.items));
  }, [setCases]);

  useEffect(() => {
    getSampleDatasets()
      .then((data) => {
        setSampleDatasets(data.items);
        setSelectedDataset(data.items[0]?.filename ?? "");
      })
      .catch(() => {
        setSampleDatasets([]);
        setSelectedDataset("");
      });
  }, []);

  const stats = useMemo(() => ({
    total: cases.length,
    active: cases.filter((item) => item.status === "ACTIVE").length,
    totalFraudAmount: cases.reduce((sum, item) => sum + Number(item.fraudAmount || 0), 0)
  }), [cases]);

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-cond text-3xl uppercase tracking-[0.24em]">Active Case Dashboard</div>
          <div className="mt-1 text-sm text-secondary">Live cyber fraud operations status and active investigations.</div>
        </div>
        <Link to="/case/new">
          <Button variant="primary">New Case</Button>
        </Link>
      </div>
    

      <div className="grid grid-cols-4 gap-4">
        <KPICard accent="var(--accent-red)" label="Total Cases This Month" value={String(stats.total)} />
        <KPICard accent="var(--accent-yellow)" label="Active Investigations" value={String(stats.active)} />
        <KPICard accent="var(--accent-blue)" label="Total Fraud Amount" value={formatINR(stats.totalFraudAmount)} />
        <KPICard accent="var(--accent-green)" label="Sample Datasets" value={String(sampleDatasets.length)}>
          <div className="mt-4 grid gap-2">
            <select
              className="h-10 rounded-[6px] border border-border bg-card px-3 text-sm text-primary outline-none transition focus:border-cyan"
              value={selectedDataset}
              onChange={(event) => setSelectedDataset(event.target.value)}
            >
              <option value="">Select dataset</option>
              {sampleDatasets.map((dataset) => (
                <option key={dataset.id} value={dataset.filename}>
                  {dataset.filename}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              onClick={() => selectedDataset && void downloadSampleDataset(selectedDataset)}
              disabled={!selectedDataset}
            >
              Download Sample
            </Button>
          </div>
        </KPICard>
      </div>

      <div className="panel-card mt-6 overflow-hidden">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-panel text-xs tracking-[0.08em] text-secondary">
            <tr>
              {["Case ID", "Victim", "Fraud Amount", "Type", "Status", "Risk Level", "Date", "Action"].map((item) => (
                <th key={item} className="px-4 py-3">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => (
              <tr key={String(item.id)} className="border-t border-border hover:bg-hover">
                <td className="px-4 py-3 font-mono">{String(item.complaintId)}</td>
                <td className="px-4 py-3">{String(item.victimName)}</td>
                <td className="px-4 py-3">{formatINR(Number(item.fraudAmount))}</td>
                <td className="px-4 py-3">{String(item.fraudType)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-[3px] border border-cyan/30 bg-cyan/10 px-3 py-1 font-mono text-[11px] text-cyan">
                    {String(item.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RiskPill level={String(item.riskLevel)} />
                </td>
                <td className="px-4 py-3 text-secondary">{new Date(String(item.createdAt)).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3">
                  <Link to={`/case/${String(item.id)}/complaint`} className="font-cond uppercase tracking-[0.2em] text-blue">
                    Open Case
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
};
