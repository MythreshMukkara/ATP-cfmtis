import { create } from "zustand";
import { GraphEdge, GraphNode } from "../types";
import { applyInnocentRiskRule } from "../utils/innocentRisk";

type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  summary: {
    victimAccount: string;
    fraudAmount: number;
    accounts: number;
    transfers: number;
    depth: number;
  } | null;
  setGraph: (payload: { nodes: GraphNode[]; edges: GraphEdge[]; summary: GraphState["summary"] }) => void;
  selectNode: (node: GraphNode | null) => void;
  selectEdge: (edge: GraphEdge | null) => void;
  markNodeFrozen: (accountId: string) => void;
  unmarkNodeFrozen: (accountId: string) => void;
  markNodeInnocent: (accountId: string) => void;
};

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  selectedEdge: null,
  summary: null,
  setGraph: ({ nodes, edges, summary }) =>
    set({
      nodes: nodes.map((node) => ({
        ...node,
        isInnocent: node.isInnocent ?? false,
        baseRiskScore: node.baseRiskScore ?? node.riskScore
      })),
      edges,
      summary,
      selectedNode: null,
      selectedEdge: null
    }),
  selectNode: (selectedNode) => set({ selectedNode, selectedEdge: null }),
  selectEdge: (selectedEdge) => set({ selectedEdge, selectedNode: null }),
  markNodeFrozen: (accountId) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === accountId ? { ...node, isFrozen: true, nodeType: "Frozen" } : node
      ),
      selectedNode:
        state.selectedNode?.id === accountId
          ? { ...state.selectedNode, isFrozen: true, nodeType: "Frozen" }
          : state.selectedNode
    })),
  unmarkNodeFrozen: (accountId) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === accountId ? { ...node, isFrozen: false, nodeType: "Suspect" } : node
      ),
      selectedNode:
        state.selectedNode?.id === accountId
          ? { ...state.selectedNode, isFrozen: false, nodeType: "Suspect" }
          : state.selectedNode
    })),
  markNodeInnocent: (accountId) =>
    set((state) => {
      const nodes = applyInnocentRiskRule(state.nodes, state.edges, accountId);
      return {
        nodes,
        selectedNode: state.selectedNode ? nodes.find((node) => node.id === state.selectedNode?.id) ?? null : null
      };
    })
}));
