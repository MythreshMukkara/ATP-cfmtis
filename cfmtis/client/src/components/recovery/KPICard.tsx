import { PropsWithChildren } from "react";

export const KPICard = ({
  accent,
  label,
  value,
  children
}: PropsWithChildren<{ accent: string; label: string; value: string }>) => (
  <div className="panel-card relative overflow-hidden border-l-[4px] p-5" style={{ borderLeftColor: accent }}>
    <div className="font-cond text-xs uppercase tracking-[0.18em] text-secondary">{label}</div>
    <div className="count-up mt-3 text-3xl font-semibold text-primary">{value}</div>
    {children}
  </div>
);
