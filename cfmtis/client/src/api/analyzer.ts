import { api } from "./client";

export const uploadDatasetRequest = async (file: File) => {
  const formData = new FormData();
  formData.append("dataset", file);
  const { data } = await api.post("/upload-dataset", formData);
  return data;
};

export const getAnalyzerSummary = async () => {
  const { data } = await api.get("/analysis/summary");
  return data;
};

export const getAnalyzerBanks = async () => {
  const { data } = await api.get("/analysis/banks");
  return data;
};

export const getAnalyzerRisk = async () => {
  const { data } = await api.get("/analysis/risk");
  return data;
};

export const getAnalyzerCase = async (caseId: string) => {
  const { data } = await api.get(`/case/${caseId}`);
  return data;
};

export const getAnalyzerGraph = async (caseId: string) => {
  const { data } = await api.get(`/analysis/graph/${caseId}`);
  return data;
};
