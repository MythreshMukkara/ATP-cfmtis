import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import axios from "axios";
import { analyzeCase as analyzeCaseApi, getFiles, getGraph, getRecovery, getRisk, uploadFiles } from "../api/analysis";
import { updateCase } from "../api/cases";
import { ComplaintForm } from "../components/complaint/ComplaintForm";
import { FileList } from "../components/complaint/FileList";
import { UploadZone } from "../components/complaint/UploadZone";
import { Button } from "../components/ui/Button";
import { useAnalysis } from "../hooks/useAnalysis";
import { useCaseStore } from "../store/caseStore";
import { useGraphStore } from "../store/graphStore";

type Context = {
  caseId: string;
  activeCase: Record<string, any>;
};

export const CaseComplaintTab = () => {
  const { caseId, activeCase } = useOutletContext<Context>();
  const navigate = useNavigate();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const [polling, setPolling] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const analysis = useCaseStore((state) => state.analysis);
  const uploadedFiles = useCaseStore((state) => state.uploadedFiles);
  const setUploadedFiles = useCaseStore((state) => state.setUploadedFiles);
  const setAnalysis = useCaseStore((state) => state.setAnalysis);
  const setRiskData = useCaseStore((state) => state.setRiskData);
  const setRecoveryData = useCaseStore((state) => state.setRecoveryData);
  const setPatternAlerts = useCaseStore((state) => state.setPatternAlerts);
  const updateCaseAnalysisStatus = useCaseStore((state) => state.updateCaseAnalysisStatus);
  const setGraph = useGraphStore((state) => state.setGraph);
  const mergedFiles = useMemo(() => {
    const persisted = (uploadedFiles as Array<Record<string, unknown>>).map((file, index) => ({
      id: String(file.id ?? `uploaded-${index}`),
      filename: String(file.filename ?? ""),
      sizeMb: Number(file.sizeMb ?? 0),
      fileType: String(file.fileType ?? "SERVER")
    }));
    const pending = pendingFiles
      .filter((file) => !persisted.some((saved) => saved.filename === file.name))
      .map((file, index) => ({
        id: `pending-${file.name}-${file.size}-${index}`,
        filename: file.name,
        sizeMb: file.size / 1024 / 1024,
        fileType: file.type || "LOCAL"
      }));

    return { persisted, pending };
  }, [pendingFiles, uploadedFiles]);

  useAnalysis(caseId, polling, async (statusData) => {
    updateCaseAnalysisStatus(caseId, statusData.status as "PENDING" | "QUEUED" | "RUNNING" | "DONE" | "FAILED");

    if (statusData.status === "FAILED") {
      setPolling(false);
      setAnalysisError(statusData.error ?? "Analysis failed for the uploaded document.");
      return;
    }

    const [files, graph, risk, recovery] = await Promise.all([
      getFiles(caseId),
      getGraph(caseId),
      getRisk(caseId),
      getRecovery(caseId)
    ]);
    setUploadedFiles(files);
    setGraph({ nodes: graph.nodes, edges: graph.edges, summary: graph.summary });
    setPatternAlerts(graph.alerts);
    setRiskData(risk.items);
    setRecoveryData(recovery);
    setPolling(false);
    navigate(`/case/${caseId}/graph`);
  });

  const handleSave = async (values: Record<string, string>) => {
    setSaveError(null);

    try {
      await updateCase(caseId, values);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSaveError(String(error.response?.data?.message ?? "Unable to save complaint details."));
        return;
      }

      setSaveError("Unable to save complaint details.");
    }
  };

  const handleAnalyze = async () => {
    setAnalysisError(null);

    try {
      if (pendingFiles.length) {
        const uploaded = await uploadFiles(caseId, pendingFiles);
        setUploadedFiles(uploaded);
        setPendingFiles([]);
        setUploadResetKey((value) => value + 1);
      }

      const response = await analyzeCaseApi(caseId);
      updateCaseAnalysisStatus(caseId, response.status as "PENDING" | "QUEUED" | "RUNNING" | "DONE" | "FAILED");
      setAnalysis({ status: response.status, steps: response.steps, progress: 8, currentStep: response.steps[0] });
      setPolling(true);
    } catch (error) {
      setPolling(false);

      if (axios.isAxiosError(error)) {
        setAnalysisError(String(error.response?.data?.message ?? "Unable to start analysis."));
        return;
      }

      setAnalysisError("Unable to start analysis.");
    }
  };

  const handleClearPending = () => {
    setPendingFiles([]);
    setAnalysisError(null);
    setUploadResetKey((value) => value + 1);
  };

  return (
    <div className="grid gap-6">
      <ComplaintForm initialValues={activeCase} onSubmit={handleSave} />
      {saveError && (
        <div className="rounded-[4px] border border-red/40 bg-red/8 px-4 py-3 text-sm text-red">
          {saveError}
        </div>
      )}
      <section className="panel-card p-6">
        <div className="section-header">Upload Evidence Files</div>
        <UploadZone key={uploadResetKey} onFiles={(files) => setPendingFiles(files)} />
        {mergedFiles.pending.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs tracking-[0.08em] text-secondary">Selected for upload</div>
            <FileList files={mergedFiles.pending} />
          </div>
        )}
        {mergedFiles.persisted.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs tracking-[0.08em] text-secondary">Already uploaded to this case</div>
            <FileList files={mergedFiles.persisted} />
          </div>
        )}
        {analysisError && (
          <div className="mt-4 rounded-[4px] border border-red/40 bg-red/8 px-4 py-3 text-sm text-red">
            {analysisError}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={handleClearPending} disabled={pendingFiles.length === 0}>
            Clear Selected
          </Button>
          <Button variant="primary" onClick={handleAnalyze}>Analyze &amp; Build Money Trail</Button>
        </div>
      </section>

      {polling && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#02050ae6]">
          <div className="panel-card w-[540px] p-8">
            <div className="font-cond text-2xl uppercase tracking-[0.24em] text-cyan">Analysis Running</div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-card">
              <div className="h-full bg-gradient-to-r from-blue to-cyan transition-all duration-700" style={{ width: `${analysis.progress}%` }} />
            </div>
            <div className="mt-4 font-mono text-sm text-primary">{analysis.currentStep || "Parsing transaction records..."}</div>
            <div className="mt-6 grid gap-2 text-xs text-secondary">
              {(analysis.steps.length ? analysis.steps : [
                "Parsing transaction records...",
                "Mapping sender/receiver account pairs...",
                "Building transaction graph structure...",
                "Detecting fragmentation patterns...",
                "Calculating risk scores per node..."
              ]).map((step) => (
                <div key={step}>{step}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
