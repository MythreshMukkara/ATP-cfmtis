import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getAnalyzerCase } from "../api/analyzer";
import { PageShell } from "../components/layout/PageShell";
import { formatINR } from "../utils/format";

export const AnalyzerWithdrawalsPage = () => {
  const { caseId = "" } = useParams();
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    getAnalyzerCase(caseId).then(setAnalysis);
  }, [caseId]);

  const distribution = Object.entries(analysis?.withdrawalIntelligence?.withdrawalTypeDistribution ?? {}).map(
    ([name, value], index) => ({
      name,
      value,
      color: ["#4f87b8", "#b9825a", "#6f9b7f", "#c86464"][index % 4]
    })
  );

  return (
    <PageShell>
      <div className="mb-6">
        <div className="font-cond text-3xl uppercase tracking-[0.2em]">Withdrawal Analytics</div>
        <div className="mt-1 text-sm text-secondary">
          Total withdrawn: {formatINR(analysis?.withdrawalIntelligence?.totalWithdrawn ?? 0)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="panel-card h-[340px] p-5">
          <div className="section-header">Withdrawal Type Distribution</div>
          <ResponsiveContainer width="100%" height="88%">
            <PieChart>
              <Pie data={distribution} dataKey="value" innerRadius={70} outerRadius={100}>
                {distribution.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="panel-card p-5">
          <div className="section-header">ATM Location Clusters</div>
          <div className="mt-4 space-y-3">
            {Object.entries(analysis?.withdrawalIntelligence?.atmLocations ?? {}).map(([location, count]) => (
              <div key={location} className="flex items-center justify-between rounded-[4px] border border-border bg-card px-4 py-3">
                <span>{location}</span>
                <span className="font-mono">{String(count)}</span>
              </div>
            ))}
            <div className="rounded-[4px] border border-border bg-card px-4 py-3 text-sm text-secondary">
              AEPS High Risk: {analysis?.withdrawalIntelligence?.aepsHighRisk ? "YES" : "NO"}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
