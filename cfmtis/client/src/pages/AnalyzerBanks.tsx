import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAnalyzerBanks } from "../api/analyzer";
import { PageShell } from "../components/layout/PageShell";

export const AnalyzerBanksPage = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getAnalyzerBanks().then(setData);
  }, []);

  return (
    <PageShell>
      <div className="mb-6">
        <div className="font-cond text-3xl uppercase tracking-[0.2em]">Bank Performance</div>
        <div className="mt-1 text-sm text-secondary">Freeze counts, recovery rates, and response-time ranking.</div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="panel-card h-[360px] p-5">
          <div className="section-header">Top Performing Banks</div>
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={data?.banks ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#344558" />
              <XAxis dataKey="bankName" stroke="#92a2b5" />
              <YAxis stroke="#92a2b5" />
              <Tooltip />
              <Bar dataKey="recoveryRate" fill="#4f87b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel-card h-[360px] p-5">
          <div className="section-header">Poor Performers</div>
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={data?.poorPerformers ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#344558" />
              <XAxis dataKey="bankName" stroke="#92a2b5" />
              <YAxis stroke="#92a2b5" />
              <Tooltip />
              <Bar dataKey="avgResponseTime" fill="#c86464" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PageShell>
  );
};
