import { useEffect } from "react";
import { getAnalysisStatus } from "../api/analysis";
import { useCaseStore } from "../store/caseStore";

export const useAnalysis = (
  caseId?: string,
  enabled = false,
  onDone?: (data: { status: string; progress: number; currentStep: string; error?: string }) => void
) => {
  const setAnalysis = useCaseStore((state) => state.setAnalysis);

  useEffect(() => {
    if (!caseId || !enabled) return;

    const timer = window.setInterval(async () => {
      const data = await getAnalysisStatus(caseId);
      setAnalysis(data);
      if (data.status === "DONE" || data.status === "FAILED") {
        window.clearInterval(timer);
        onDone?.(data);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [caseId, enabled, onDone, setAnalysis]);
};
