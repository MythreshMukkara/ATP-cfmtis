import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAnalyzerCase } from "../api/analyzer";
import { PageShell } from "../components/layout/PageShell";

export const AnalyzerTimelinePage = () => {
  const { caseId = "" } = useParams();
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    getAnalyzerCase(caseId).then(setAnalysis);
  }, [caseId]);

  const timelineData = (analysis?.timeline?.events ?? []).map((event: any, index: number) => ({
    index: index + 1,
    label: event.kind,
    time: new Date(event.timestamp).getTime()
  }));

  return (
    <PageShell>
      <div className="mb-6">
        <div className="font-cond text-3xl uppercase tracking-[0.2em]">Fraud Timeline</div>
        <div className="mt-1 text-sm text-secondary">
          Delay category: {analysis?.timeline?.delayCategory ?? "Unknown"} · {Math.round(analysis?.timeline?.delayInHours ?? 0)} hours
        </div>
      </div>
      <div className="panel-card h-[360px] p-5">
        <div className="section-header">Case Event Sequence</div>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={timelineData}>
            <XAxis dataKey="label" stroke="#92a2b5" />
            <YAxis stroke="#92a2b5" hide />
            <Tooltip />
            <Line type="monotone" dataKey="time" stroke="#72a6b6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </PageShell>
  );
};
