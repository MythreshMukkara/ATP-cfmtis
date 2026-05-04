export const formatINR = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const riskColor = (level: string) => {
  if (level === "CRITICAL") return "var(--accent-red)";
  if (level === "HIGH") return "var(--accent-orange)";
  if (level === "MEDIUM") return "var(--accent-yellow)";
  return "var(--accent-green)";
};
