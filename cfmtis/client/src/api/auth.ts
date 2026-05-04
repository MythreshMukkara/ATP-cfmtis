import { api } from "./client";

export const loginRequest = async (badgeNumber: string, password: string) => {
  const { data } = await api.post("/auth/login", { badgeNumber, password });
  return data;
};

export const meRequest = async () => {
  const { data } = await api.get("/auth/me");
  return data;
};

export const logoutRequest = async () => {
  await api.post("/auth/logout");
};
