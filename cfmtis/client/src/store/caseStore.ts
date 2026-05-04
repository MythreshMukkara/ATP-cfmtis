import { create } from "zustand";
import { CaseRecord, CaseSummary, CrossCaseRepeat, GraphNode, PatternAlert, RecoveryTotals, RiskAccount } from "../types";
import { syncRiskAccountsFromGraph } from "../utils/innocentRisk";

type CaseState = {
  cases: CaseSummary[];
  activeCase: CaseRecord | null;
  riskData: RiskAccount[];
  recoveryData: {
    totals: RecoveryTotals | null;
    accounts: Array<{ accountNumber: string; balance: number; status: string }>;
    log: Array<{ timestamp: string; level: string; message: string }>;
  };
  patternAlerts: PatternAlert[];
  repeatedAccounts: CrossCaseRepeat[];
  analysis: { status: string; progress: number; currentStep: string; steps: string[]; error?: string };
  uploadedFiles: Array<Record<string, unknown>>;
  frozenAccounts: Set<string>;
  setCases: (cases: CaseSummary[]) => void;
  setActiveCase: (record: CaseRecord) => void;
  setRiskData: (items: RiskAccount[]) => void;
  setRecoveryData: (payload: CaseState["recoveryData"]) => void;
  setPatternAlerts: (alerts: PatternAlert[]) => void;
  setRepeatedAccounts: (items: CrossCaseRepeat[]) => void;
  setAnalysis: (analysis: Partial<CaseState["analysis"]>) => void;
  setUploadedFiles: (files: Array<Record<string, unknown>>) => void;
  markFrozen: (accountId: string) => void;
  unmarkFrozen: (accountId: string) => void;
  syncRiskFromGraph: (nodes: GraphNode[]) => void;
  updateCaseAnalysisStatus: (caseId: string, analysisStatus: CaseRecord["analysisStatus"]) => void;
};

export const useCaseStore = create<CaseState>((set) => ({
  cases: [],
  activeCase: null,
  riskData: [],
  recoveryData: { totals: null, accounts: [], log: [] },
  patternAlerts: [],
  repeatedAccounts: [],
  analysis: { status: "PENDING", progress: 0, currentStep: "", steps: [], error: undefined },
  uploadedFiles: [],
  frozenAccounts: new Set(),
  setCases: (cases) => set({ cases }),
  setActiveCase: (record) => set({ activeCase: record }),
  setRiskData: (items) =>
    set({
      riskData: items.map((item) => ({
        ...item,
        isInnocent: item.isInnocent ?? false,
        baseRiskScore: item.baseRiskScore ?? item.riskScore
      }))
    }),
  setRecoveryData: (payload) => set({ recoveryData: payload }),
  setPatternAlerts: (alerts) =>
    set({
      patternAlerts: (alerts ?? []).map((alert, index) => ({
        id: String(alert?.id ?? `alert-${index}`),
        type: String(alert?.type ?? "ANALYZER_ALERT"),
        severity:
          alert?.severity === "CRITICAL" ||
          alert?.severity === "HIGH" ||
          alert?.severity === "MEDIUM" ||
          alert?.severity === "LOW"
            ? alert.severity
            : "MEDIUM",
        message: String(alert?.message ?? "Analyzer detected a suspicious pattern.")
      }))
    }),
  setRepeatedAccounts: (repeatedAccounts) => set({ repeatedAccounts }),
  setAnalysis: (analysis) =>
    set((state) => ({ analysis: { ...state.analysis, ...analysis } })),
  setUploadedFiles: (files) => set({ uploadedFiles: files }),
  syncRiskFromGraph: (nodes) =>
    set((state) => ({
      riskData: syncRiskAccountsFromGraph(state.riskData, nodes)
    })),
  updateCaseAnalysisStatus: (caseId, analysisStatus) =>
    set((state) => ({
      activeCase:
        state.activeCase?.id === caseId
          ? {
              ...state.activeCase,
              analysisStatus
            }
          : state.activeCase,
      cases: state.cases.map((item) =>
        item.id === caseId
          ? {
              ...item,
              analysisStatus
            }
          : item
      )
    })),
  markFrozen: (accountId) =>
    set((state) => {
      const next = new Set(state.frozenAccounts);
      next.add(accountId);
      const frozenAccount = state.riskData.find((item) => item.id === accountId);
      const nextRecoveryTotals = state.recoveryData.totals
        ? {
            ...state.recoveryData.totals,
            recoverable:
              state.recoveryData.totals.recoverable +
              (frozenAccount && !frozenAccount.isFrozen ? frozenAccount.currentBalance : 0),
            atRisk: Math.max(
              state.recoveryData.totals.atRisk -
                (frozenAccount && !frozenAccount.isFrozen ? frozenAccount.currentBalance : 0),
              0
            ),
            frozen:
              state.recoveryData.totals.frozen +
              (frozenAccount && !frozenAccount.isFrozen ? frozenAccount.currentBalance : 0)
          }
        : null;

      return {
        frozenAccounts: next,
        riskData: state.riskData.map((item) =>
          item.id === accountId ? { ...item, isFrozen: true, accountStatus: "FROZEN" } : item
        ),
        recoveryData: {
          ...state.recoveryData,
          totals: nextRecoveryTotals,
          accounts: state.recoveryData.accounts.map((item) =>
            frozenAccount && item.accountNumber === frozenAccount.accountNumber
              ? { ...item, status: "FROZEN" }
              : item
          )
        }
      };
    }),
  unmarkFrozen: (accountId) =>
    set((state) => {
      const next = new Set(state.frozenAccounts);
      next.delete(accountId);
      const thawedAccount = state.riskData.find((item) => item.id === accountId);
      const nextRecoveryTotals = state.recoveryData.totals
        ? {
            ...state.recoveryData.totals,
            recoverable: Math.max(
              state.recoveryData.totals.recoverable -
                (thawedAccount && thawedAccount.isFrozen ? thawedAccount.currentBalance : 0),
              0
            ),
            atRisk:
              state.recoveryData.totals.atRisk +
              (thawedAccount && thawedAccount.isFrozen ? thawedAccount.currentBalance : 0),
            frozen: Math.max(
              state.recoveryData.totals.frozen -
                (thawedAccount && thawedAccount.isFrozen ? thawedAccount.currentBalance : 0),
              0
            )
          }
        : null;

      return {
        frozenAccounts: next,
        riskData: state.riskData.map((item) =>
          item.id === accountId ? { ...item, isFrozen: false, accountStatus: "UNDER REVIEW" } : item
        ),
        recoveryData: {
          ...state.recoveryData,
          totals: nextRecoveryTotals,
          accounts: state.recoveryData.accounts.map((item) =>
            thawedAccount && item.accountNumber === thawedAccount.accountNumber
              ? { ...item, status: "AT RISK" }
              : item
          )
        }
      };
    })
}));
