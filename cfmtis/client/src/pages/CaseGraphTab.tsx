import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { GraphCanvas } from "../components/graph/GraphCanvas";
import { NodeDetailCard } from "../components/graph/NodeDetailCard";
import { useFreeze } from "../hooks/useFreeze";
import { useGraphStore } from "../store/graphStore";
import { formatINR } from "../utils/format";
import { Button } from "../components/ui/Button";
import { useCaseStore } from "../store/caseStore";
import { exportGraphReport } from "../utils/reportExport";

export const CaseGraphTab = () => {
  const { analysisDone } = useOutletContext<{ analysisDone: boolean }>();
  const activeCase = useCaseStore((state) => state.activeCase);
  const summary = useGraphStore((state) => state.summary);
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const selectedEdge = useGraphStore((state) => state.selectedEdge);
  const markNodeInnocent = useGraphStore((state) => state.markNodeInnocent);
  const syncRiskFromGraph = useCaseStore((state) => state.syncRiskFromGraph);
  const { freezeAccount, unfreezeAccount } = useFreeze();
  const graphAvailable = analysisDone || nodes.length > 0 || Boolean(summary);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const availableLevels = useMemo(
    () => [...new Set(nodes.map((node) => node.chainDepth))].sort((left, right) => left - right),
    [nodes]
  );
  const levelStats = useMemo(
    () =>
      Object.fromEntries(
        availableLevels.map((level) => {
          const levelNodes = nodes.filter((node) => node.chainDepth === level);
          return [
            level,
            {
              accounts: levelNodes.length,
              enteredAmount: edges
                .filter((edge) => levelNodes.some((node) => node.accountNumber === edge.target))
                .reduce((sum, edge) => sum + edge.amount, 0),
              leftAmount: edges
                .filter((edge) => levelNodes.some((node) => node.accountNumber === edge.source))
                .reduce((sum, edge) => sum + edge.amount, 0)
            }
          ];
        })
      ) as Record<number, { accounts: number; enteredAmount: number; leftAmount: number }>,
    [availableLevels, edges, nodes]
  );
  const allLevelsSelected = selectedLevels.length === 0;
  const filteredNodes = useMemo(
    () => (allLevelsSelected ? nodes : nodes.filter((node) => selectedLevels.includes(node.chainDepth))),
    [allLevelsSelected, nodes, selectedLevels]
  );
  const visibleIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () =>
      allLevelsSelected
        ? edges
        : edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [allLevelsSelected, edges, visibleIds]
  );
  const selectedLayerAnalysis = useMemo(() => {
    const levelsToAnalyze = allLevelsSelected ? availableLevels : selectedLevels;
    return levelsToAnalyze.reduce(
      (acc, level) => {
        const stats = levelStats[level] ?? { accounts: 0, enteredAmount: 0, leftAmount: 0 };
        acc.accounts += stats.accounts;
        acc.enteredAmount += stats.enteredAmount;
        acc.leftAmount += stats.leftAmount;
        return acc;
      },
      { accounts: 0, enteredAmount: 0, leftAmount: 0 }
    );
  }, [allLevelsSelected, availableLevels, levelStats, selectedLevels]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.accountNumber, node])), [nodes]);
  const selectedSource = selectedEdge ? nodeMap.get(selectedEdge.source) : null;
  const selectedTarget = selectedEdge ? nodeMap.get(selectedEdge.target) : null;
  const toggleLevel = (level: number) => {
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level].sort((a, b) => a - b)
    );
  };
  const handleExport = () => {
    const svgMarkup =
      document.querySelector('svg[data-graph-export="true"]')?.outerHTML ?? "<div>No graph available</div>";
    exportGraphReport({
      caseId: activeCase?.complaintId ?? "Case",
      victimName: activeCase?.victimName ?? "Unknown",
      victimAccount: summary?.victimAccount ?? activeCase?.victimAccount ?? "Unknown",
      fraudAmount: formatINR(summary?.fraudAmount ?? activeCase?.fraudAmount ?? 0),
      accounts: summary?.accounts ?? filteredNodes.length,
      transfers: summary?.transfers ?? filteredEdges.length,
      depth: summary?.depth ?? 0,
      selectedLayerSummary: {
        accounts: selectedLayerAnalysis.accounts,
        enteredAmount: formatINR(selectedLayerAnalysis.enteredAmount),
        leftAmount: formatINR(selectedLayerAnalysis.leftAmount)
      },
      svgMarkup
    });
  };
  const handleMarkInnocent = (accountId: string) => {
    markNodeInnocent(accountId);
    const nextNodes = useGraphStore.getState().nodes;
    syncRiskFromGraph(nextNodes);
  };

  if (!graphAvailable) {
    return <div className="panel-card p-6 font-mono text-dim">Run analysis from the Complaint tab</div>;
  }

  return (
    <div className="grid h-[calc(100vh-118px)] grid-cols-[minmax(0,1fr)_260px] gap-5">
      <section className="relative panel-card overflow-hidden p-4">
        <div className="absolute left-4 top-4 z-10 grid gap-2">
          <div className="rounded-[3px] border border-border bg-panel/90 px-3 py-2 font-mono text-xs">
            Victim Account: {summary?.victimAccount}
          </div>
          <div className="rounded-[3px] border border-border bg-panel/90 px-3 py-2 font-mono text-xs">
            Fraud Amount: {formatINR(summary?.fraudAmount ?? 0)}
          </div>
          <div className="rounded-[3px] border border-border bg-panel/90 px-3 py-2 font-mono text-xs">
            {summary?.accounts ?? 0} Accounts · {summary?.transfers ?? 0} Transfers
          </div>
          <div className="rounded-[3px] border border-border bg-panel/90 px-3 py-2 font-mono text-xs">
            Depth: {summary?.depth ?? 0} Levels
          </div>
        </div>
        <GraphCanvas nodes={filteredNodes} edges={filteredEdges} layerStats={levelStats} />
      </section>

      <aside className="flex h-full flex-col gap-4">
        <Button variant="primary" onClick={handleExport}>
          Export PDF
        </Button>
        <div className="panel-card p-4">
          <div className="section-header">Level Filter</div>
          <div className="mt-4 grid gap-2">
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="checkbox"
                checked={allLevelsSelected}
                onChange={() => setSelectedLevels([])}
              />
              All Levels
            </label>
            {availableLevels.map((level) => (
              <label key={level} className="flex items-center gap-2 text-sm text-primary">
                <input
                  type="checkbox"
                  checked={allLevelsSelected || selectedLevels.includes(level)}
                  onChange={() => toggleLevel(level)}
                />
                Level {level}
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-[8px] border border-border bg-card px-3 py-3">
            <div className="text-[11px] tracking-[0.08em] text-secondary">Selected Layer Analysis</div>
            <div className="mt-2 grid gap-1 font-mono text-xs text-primary">
              <div>Accounts: {selectedLayerAnalysis.accounts}</div>
              <div>Amount In: {formatINR(selectedLayerAnalysis.enteredAmount)}</div>
              <div>Amount Out: {formatINR(selectedLayerAnalysis.leftAmount)}</div>
            </div>
          </div>
          <div className="mt-4 font-mono text-xs text-secondary">
            Showing {filteredNodes.length} entities and {filteredEdges.length} links
          </div>
        </div>

        <NodeDetailCard
          node={selectedNode}
          onFreeze={freezeAccount}
          onUnfreeze={unfreezeAccount}
          onMarkInnocent={handleMarkInnocent}
        />

        <div className="panel-card p-4">
          <div className="section-header">Transaction</div>
          {!selectedEdge ? (
            <div className="mt-4 font-mono text-sm text-dim">Select an edge to inspect transaction details.</div>
          ) : (
            <div className="mt-4 grid gap-3 text-sm">
              <div className="rounded-[8px] border border-border bg-card px-3 py-3">
                <div className="font-cond text-xs uppercase tracking-[0.18em] text-secondary">From</div>
                <div className="mt-1 font-mono text-primary">{selectedEdge.source}</div>
                <div className="mt-1 text-secondary">{selectedSource?.holderName ?? "Unknown holder"}</div>
              </div>
              <div className="rounded-[8px] border border-border bg-card px-3 py-3">
                <div className="font-cond text-xs uppercase tracking-[0.18em] text-secondary">To</div>
                <div className="mt-1 font-mono text-primary">{selectedEdge.target}</div>
                <div className="mt-1 text-secondary">{selectedTarget?.holderName ?? "Unknown holder"}</div>
              </div>
              <div className="rounded-[8px] border border-border bg-card px-3 py-3 text-secondary">
                <div>Amount: {formatINR(selectedEdge.amount)}</div>
                <div className="mt-2">
                  Time: {selectedEdge.timestamp ? new Date(selectedEdge.timestamp).toLocaleString("en-IN") : "Unknown"}
                </div>
                {selectedEdge.referenceId && <div className="mt-2">Reference: {selectedEdge.referenceId}</div>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
