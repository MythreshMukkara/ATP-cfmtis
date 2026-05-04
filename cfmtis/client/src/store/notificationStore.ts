import { create } from "zustand";

type NotificationState = {
  message: string | null;
  tone: "success" | "info";
  timeoutId: number | null;
  show: (message: string, tone?: "success" | "info") => void;
  clear: () => void;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  message: null,
  tone: "info",
  timeoutId: null,
  show: (message, tone = "info") => {
    const active = get().timeoutId;
    if (active) {
      window.clearTimeout(active);
    }

    const timeoutId = window.setTimeout(() => {
      set({ message: null, timeoutId: null });
    }, 5000);

    set({ message, tone, timeoutId });
  },
  clear: () => {
    const active = get().timeoutId;
    if (active) {
      window.clearTimeout(active);
    }

    set({ message: null, timeoutId: null });
  }
}));
