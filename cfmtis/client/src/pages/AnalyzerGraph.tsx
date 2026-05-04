import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getAnalyzerGraph } from "../api/analyzer";
import { GraphCanvas } from "../components/graph/GraphCanvas";
import { PageShell } from "../components/layout/PageShell";
import { useGraphStore } from "../store/graphStore";

export const AnalyzerGraphPage = () => {
  const { caseId = "" } = useParams();
  const setGraph = useGraphStore((state) => state.setGraph);

  useEffect(() => {
    getAnalyzerGraph(caseId).then((graph) => {
      setGraph({
        nodes: (graph.nodes ?? []).map((node: any) => ({
          id: node.id,
          accountNumber: node.accountNumber,
          label: node.accountNumber,
          bankName: "Imported",
          holderName: node.accountNumber,
          amountReceived: 0,
          currentBalance: 0,
          chainDepth: 0,
          riskScore: 0,
          riskLevel: "LOW",
          nodeType: "Transfer",
          location: null,
          isFrozen: false
        })),
        edges: (graph.edges ?? []).map((edge: any, index: number) => ({
          id: edge.txnId ?? `edge-${index}`,
          source: edge.source,
          target: edge.target,
          amount: edge.amount,
          timestamp: edge.timestamp ?? new Date().toISOString()
        })),
        summary: {
          victimAccount: graph.path?.[0] ?? "Unknown",
          fraudAmount: (graph.edges ?? []).reduce((sum: number, edge: any) => sum + Number(edge.amount ?? 0), 0),
          accounts: graph.nodes?.length ?? 0,
          transfers: graph.edges?.length ?? 0,
          depth: Object.keys(graph.layerDistribution ?? {}).length
        }
      });
    });
  }, [caseId, setGraph]);

  return (
    <PageShell>
      <div className="mb-6">
        <div className="font-cond text-3xl uppercase tracking-[0.2em]">Money Trail Graph</div>
        <div className="mt-1 text-sm text-secondary">Directed account flow reconstructed from the imported dataset.</div>
      </div>
      <div className="h-[calc(100vh-160px)] panel-card p-4">
        <GraphCanvas />
      </div>
    </PageShell>
  );
};
