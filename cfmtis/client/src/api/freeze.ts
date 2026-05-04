import { api } from "./client";

export const freezeAccountRequest = async (caseId: string, accountId: string) => {
  const { data } = await api.post(`/cases/${caseId}/freeze/${accountId}`);
  return data;
};

export const unfreezeAccountRequest = async (caseId: string, accountId: string) => {
  const { data } = await api.delete(`/cases/${caseId}/freeze/${accountId}`);
  return data;
};

export const freezeBulkRequest = async (caseId: string) => {
  const { data } = await api.post(`/cases/${caseId}/freeze/bulk`);
  return data;
};

export const getFreezeLog = async (caseId: string) => {
  const { data } = await api.get(`/cases/${caseId}/freeze-log`);
  return data;
};
