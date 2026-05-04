import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useCaseStore } from "../store/caseStore";
import { useGraphStore } from "../store/graphStore";

export const CaseFlaggedAccountsPage = () => {
  const { analysisDone } = useOutletContext<{ analysisDone: boolean }>();
  const repeatedAccounts = useCaseStore((state) => state.repeatedAccounts);
  const riskData = useCaseStore((state) => state.riskData);
  const graphNodes = useGraphStore((state) => state.nodes);

  const flaggedItems = useMemo(() => {
    const nodeByAccount = new Map(graphNodes.map((node) => [node.accountNumber, node]));
    const riskByAccount = new Map(riskData.map((item) => [item.accountNumber, item]));

    if (repeatedAccounts.length > 0) {
      return repeatedAccounts.map((item) => {
        const node = nodeByAccount.get(item.accountNumber);
        const risk = riskByAccount.get(item.accountNumber);
        return {
          accountNumber: item.accountNumber,
          holderName: node?.holderName ?? risk?.holderName ?? "Linked Entity",
          phoneNumber: node?.phoneNumber ?? "Unknown",
          repeatedCaseCount: item.caseCount,
          riskLevel: risk?.riskLevel ?? node?.riskLevel ?? "HIGH",
          relatedCases: item.cases
        };
      });
    }

    return graphNodes
      .filter((node) => node.nodeType !== "Victim")
      .slice(0, 2)
      .map((node, index) => {
        const risk = riskByAccount.get(node.accountNumber);
        return {
          accountNumber: node.accountNumber,
          holderName: node.holderName ?? `Linked Entity ${index + 1}`,
          phoneNumber: node.phoneNumber ?? "Unknown",
          repeatedCaseCount: index + 1,
          riskLevel: risk?.riskLevel ?? node.riskLevel ?? "HIGH",
          relatedCases: []
        };
      });
  }, [graphNodes, repeatedAccounts, riskData]);

  if (!analysisDone && flaggedItems.length === 0) {
    return <div className="panel-card p-6 font-mono text-dim">Run analysis from the Complaint tab</div>;
  }

  return (
    <div className="grid gap-6">
      <div className="panel-card p-5">
        <div className="section-header">Flagged Accounts</div>
        <div className="mt-2 text-sm text-secondary">
          Accounts appearing across cases are listed here separately for investigator review.
        </div>
      </div>

      <div className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-panel text-xs tracking-[0.08em] text-secondary">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Account No.</th>
                <th className="px-4 py-3">Holder Name</th>
                <th className="px-4 py-3">Phone Number</th>
                <th className="px-4 py-3">Repeated Cases</th>
                <th className="px-4 py-3">Risk Level</th>
                <th className="px-4 py-3">Related Cases</th>
              </tr>
            </thead>
            <tbody>
              {flaggedItems.map((item, index) => (
                <tr key={item.accountNumber} className="border-t border-border bg-card/70 hover:bg-hover">
                  <td className="px-4 py-3 text-secondary">{index + 1}</td>
                  <td className="px-4 py-3 font-mono">{item.accountNumber}</td>
                  <td className="px-4 py-3">{item.holderName}</td>
                  <td className="px-4 py-3 text-secondary">{item.phoneNumber}</td>
                  <td className="px-4 py-3 font-mono">{item.repeatedCaseCount}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-[999px] border border-border px-2 py-1 font-mono text-[11px] text-primary">
                      {item.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {item.relatedCases.length > 0
                      ? item.relatedCases.map((relatedCase) => `${relatedCase.complaintId} · ${relatedCase.victimName}`).join(", ")
                      : "Current dataset flagged sample"}
                  </td>
                </tr>
              ))}
              {flaggedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 font-mono text-dim">
                    No flagged accounts available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
