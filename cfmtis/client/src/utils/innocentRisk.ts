import { GraphEdge, GraphNode, RiskAccount } from "../types";

const riskLevelFromScore = (score: number): GraphNode["riskLevel"] => {
  if (score >= 85) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

export const applyInnocentRiskRule = (nodes: GraphNode[], edges: GraphEdge[], accountId: string) => {
  const nextNodes = nodes.map((node) => {
    const baseRiskScore = node.baseRiskScore ?? node.riskScore;
    return node.id === accountId
      ? {
          ...node,
          baseRiskScore,
          isInnocent: true,
          nodeType: "Recovered" as const,
          riskScore: Math.min(baseRiskScore, 15),
          riskLevel: "LOW" as const
        }
      : {
          ...node,
          baseRiskScore
        };
  });

  const childIdsByParent = new Map<string, string[]>();
  edges.forEach((edge) => {
    const existing = childIdsByParent.get(edge.source) ?? [];
    existing.push(edge.target);
    childIdsByParent.set(edge.source, existing);
  });

  const byId = new Map(nextNodes.map((node) => [node.id, node]));

  return nextNodes.map((node) => {
    if (node.isInnocent) {
      return {
        ...node,
        riskScore: Math.min(node.baseRiskScore ?? node.riskScore, 15),
        riskLevel: "LOW" as const
      };
    }

    const childIds = childIdsByParent.get(node.id) ?? [];
    if (childIds.length === 0) {
      const score = clampScore(node.baseRiskScore ?? node.riskScore);
      return { ...node, riskScore: score, riskLevel: riskLevelFromScore(score) };
    }

    const allChildrenInnocent = childIds.every((childId) => byId.get(childId)?.isInnocent);
    const base = node.baseRiskScore ?? node.riskScore;
    const score = clampScore(allChildrenInnocent ? base * 0.5 : base);
    return {
      ...node,
      riskScore: score,
      riskLevel: riskLevelFromScore(score)
    };
  });
};

export const syncRiskAccountsFromGraph = (items: RiskAccount[], nodes: GraphNode[]) => {
  const byAccount = new Map(nodes.map((node) => [node.accountNumber, node]));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return items.map((item) => {
    const match = byId.get(item.id) ?? byAccount.get(item.accountNumber);
    if (!match) {
      return {
        ...item,
        baseRiskScore: item.baseRiskScore ?? item.riskScore,
        isInnocent: item.isInnocent ?? false
      };
    }

    return {
      ...item,
      baseRiskScore: item.baseRiskScore ?? item.riskScore,
      riskScore: match.riskScore,
      riskLevel: match.riskLevel,
      isInnocent: match.isInnocent ?? false,
      accountStatus:
        match.isFrozen ? "FROZEN" : match.isInnocent ? "INNOCENT" : item.accountStatus
    };
  });
};
