import { PropsWithChildren } from "react";
import { riskColor } from "../../utils/format";

export const MonoBadge = ({ children }: PropsWithChildren) => (
  <span className="inline-flex items-center rounded-[3px] border border-cyan/30 bg-cyan/10 px-3 py-1 font-mono text-[11px] text-cyan">
    {children}
  </span>
);

export const RiskPill = ({ level }: { level: string }) => (
  <span
    className="inline-flex items-center rounded-[3px] border px-3 py-1 font-mono text-[11px]"
    style={{
      borderColor: riskColor(level),
      background: level === "CRITICAL" ? riskColor(level) : `${riskColor(level)}1f`,
      color: level === "CRITICAL" ? "#ffffff" : riskColor(level)
    }}
  >
    {level}
  </span>
);
