import { create } from "zustand";
import { loginRequest, logoutRequest, meRequest } from "../api/auth";
import { getStoredAuthToken, setStoredAuthToken } from "../api/client";
import { Officer } from "../types";

type AuthState = {
  officer: Officer | null;
  token: string | null;
  loading: boolean;
  login: (badgeNumber: string, password: string) => Promise<void>;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  officer: null,
  token: getStoredAuthToken(),
  loading: false,
  login: async (badgeNumber, password) => {
    set({ loading: true });
    try {
      const data = await loginRequest(badgeNumber, password);
      setStoredAuthToken(data.token);
      set({ officer: data.officer, token: data.token, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  bootstrap: async () => {
    const token = getStoredAuthToken();

    if (!token) {
      set({ officer: null, token: null, loading: false });
      return;
    }

    try {
      const officer = await meRequest();
      set({ officer, token });
    } catch {
      setStoredAuthToken(null);
      set({ officer: null, token: null });
    }
  },
  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      setStoredAuthToken(null);
      set({ officer: null, token: null, loading: false });
    }
  }
}));
