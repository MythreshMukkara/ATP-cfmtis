import { useNotificationStore } from "../../store/notificationStore";

export const NotificationBanner = () => {
  const message = useNotificationStore((state) => state.message);
  const tone = useNotificationStore((state) => state.tone);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[80]">
      <div
        className="min-w-[280px] rounded-[10px] border px-4 py-3 shadow-[0_18px_35px_rgba(22,48,67,0.18)]"
        style={{
          background: "#ffffff",
          borderColor: tone === "success" ? "var(--accent-green)" : "var(--accent-blue)",
          color: "#23415a"
        }}
      >
        <div className="text-sm">{message}</div>
      </div>
    </div>
  );
};
