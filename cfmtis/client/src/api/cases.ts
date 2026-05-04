import { api } from "./client";

export const getCases = async () => {
  const { data } = await api.get("/cases");
  return data;
};

export const getCase = async (id: string) => {
  const { data } = await api.get(`/cases/${id}`);
  return data;
};

export const createCase = async (payload: Record<string, unknown>) => {
  const { data } = await api.post("/cases", payload);
  return data;
};

export const updateCase = async (id: string, payload: Record<string, unknown>) => {
  const { data } = await api.patch(`/cases/${id}`, payload);
  return data;
};
