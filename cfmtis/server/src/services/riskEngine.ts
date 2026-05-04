type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type RiskMetricInput = {
  chainDepth: number;
  velocity: number;
  fragmentation: number;
  accountAgeDays?: number | null;
  locationMismatch?: boolean;
  balanceRatio: number;
  transactionType?: string;
};

export const calculateRiskScore = (input: RiskMetricInput) => {
  let score = 0;

  if (input.chainDepth === 1) score += 30;
  if (input.chainDepth >= 3) score += 20;
  if (input.velocity > 5) score += 25;
  if (input.fragmentation > 0.6) score += 20;
  if ((input.accountAgeDays ?? 999) < 30) score += 20;
  if (input.locationMismatch) score += 10;
  if (input.balanceRatio < 0.1) score += 15;
  if (input.transactionType === "Wallet") score += 10;

  return Math.min(score, 100);
};

export const classifyRiskLevel = (score: number): RiskLevel => {
  if (score >= 85) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};
