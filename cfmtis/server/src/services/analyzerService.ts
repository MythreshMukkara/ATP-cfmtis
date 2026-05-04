import { logger } from "../utils/logger.js";
import { analyzeWorkbookFile, ingestAnalyzerDataset, ingestAnalyzerDatasetForCase } from "./analyzerEngine.js";
import { parseAnalyzerWorkbook } from "./analyzerWorkbookService.js";

type ExistingCaseTarget = {
  id: string;
  complaintId: string;
  fraudAmount: number;
  victimAccount: string;
  victimName: string;
  victimMobile: string;
  bankName: string;
};

const normalizeValue = (value?: string | null) => String(value ?? "").trim().toLowerCase();
const digitsOnly = (value?: string | null) => String(value ?? "").replace(/\D+/g, "");
const hasEnoughDigits = (value?: string | null, min = 8) => digitsOnly(value).length >= min;

const accountCandidates = (value?: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const candidates = new Set<string>([
    normalizeValue(raw),
    digitsOnly(raw)
  ]);

  const scientificMatch = raw.match(/^(\d+(?:\.\d+)?)e\+?(\d+)$/i);
  if (scientificMatch) {
    const [, mantissa, exponentText] = scientificMatch;
    const exponent = Number(exponentText);
    const mantissaDigits = mantissa.replace(".", "");
    const decimals = mantissa.includes(".") ? mantissa.length - mantissa.indexOf(".") - 1 : 0;
    const zeroCount = Math.max(exponent - decimals, 0);
    const expanded = `${mantissaDigits}${"0".repeat(zeroCount)}`;
    candidates.add(expanded);

    const stablePrefix = mantissaDigits.slice(0, Math.min(mantissaDigits.length, 6));
    if (stablePrefix) {
      candidates.add(stablePrefix);
    }
  }

  return [...candidates].filter(Boolean);
};

const isReliableAccountInput = (value?: string | null) =>
  accountCandidates(value).some((candidate) => /^\d+$/.test(candidate) && candidate.length >= 8);

const accountMatches = (left?: string | null, right?: string | null) => {
  const leftCandidates = accountCandidates(left);
  const rightCandidates = accountCandidates(right);
  if (!leftCandidates.length || !rightCandidates.length) return false;

  return leftCandidates.some((leftValue) =>
    rightCandidates.some((rightValue) => {
      if (!leftValue || !rightValue) return false;
      return (
        leftValue === rightValue ||
        (leftValue.length >= 6 && rightValue.startsWith(leftValue)) ||
        (rightValue.length >= 6 && leftValue.startsWith(rightValue))
      );
    })
  );
};

const victimExistsInWorkbook = (filePath: string, caseRecord: ExistingCaseTarget) => {
  const parsed = parseAnalyzerWorkbook(filePath);
  const victimAccount = caseRecord.victimAccount;
  const complaintId = normalizeValue(caseRecord.complaintId);
  const victimName = normalizeValue(caseRecord.victimName);
  const victimMobile = normalizeValue(caseRecord.victimMobile);

  const accountMatched =
    isReliableAccountInput(victimAccount) &&
    (
      parsed.transfers.some(
        (item) =>
          accountMatches(item.senderAccount, victimAccount) ||
          accountMatches(item.receiverAccount, victimAccount)
      ) ||
      parsed.withdrawals.some((item) => accountMatches(item.accountNumber, victimAccount)) ||
      parsed.smallTransactions.some((item) => accountMatches(item.accountNumber, victimAccount))
    );

  const caseMatched =
    Boolean(complaintId) &&
    (
      parsed.transfers.some((item) => normalizeValue(item.acknowledgementNo) === complaintId) ||
      parsed.withdrawals.some((item) => normalizeValue(item.acknowledgementNo) === complaintId) ||
      parsed.holds.some((item) => normalizeValue(item.acknowledgementNo) === complaintId) ||
      parsed.bankActions.some((item) => normalizeValue(item.acknowledgementNo) === complaintId) ||
      parsed.smallTransactions.some((item) => normalizeValue(item.acknowledgementNo) === complaintId)
    );

  const victimProfileMatched =
    (Boolean(victimName) &&
      parsed.transfers.some((item) => normalizeValue(item.victimName) === victimName)) ||
    (Boolean(victimMobile) &&
      parsed.transfers.some((item) => normalizeValue(item.victimMobile) === victimMobile));

  const heuristicGraphFallback =
    !accountMatched &&
    !caseMatched &&
    !victimProfileMatched &&
    parsed.transfers.length > 0 &&
    (!isReliableAccountInput(victimAccount) || !hasEnoughDigits(caseRecord.complaintId));

  return {
    matched: accountMatched || caseMatched || victimProfileMatched || heuristicGraphFallback,
    reason: accountMatched
      ? "victim account matched"
      : caseMatched
        ? "complaint acknowledgement matched"
        : victimProfileMatched
          ? "victim profile matched"
          : heuristicGraphFallback
            ? "graph dataset fallback selected"
            : "no victim account or acknowledgement match found"
  };
};

export const runAnalyzerForCase = async (filePath: string, caseRecord: ExistingCaseTarget) => {
  logger.info({ caseId: caseRecord.id, filePath }, "ANALYZER STARTED");

  const victimMatch = victimExistsInWorkbook(filePath, caseRecord);
  if (!victimMatch.matched) {
    logger.warn(
      {
        caseId: caseRecord.id,
        complaintId: caseRecord.complaintId,
        victimAccount: caseRecord.victimAccount,
        filePath
      },
      "Victim not found in dataset"
    );
    throw new Error("Victim not found in dataset");
  }

  logger.info({ caseId: caseRecord.id, match: victimMatch.reason }, "VICTIM FOUND");
  const result = await ingestAnalyzerDatasetForCase(filePath, caseRecord);
  logger.info({ caseId: caseRecord.id }, "GRAPH BUILT");
  logger.info({ caseId: caseRecord.id, level: (result as any)?.risk?.level }, "RISK CALCULATED");
  return result;
};

export const runAnalyzerForUpload = async (filePath: string, officerId: string) => {
  logger.info({ filePath, officerId }, "ANALYZER STARTED");
  const result = await ingestAnalyzerDataset(filePath, officerId);
  logger.info({ filePath, importedCases: result.importedCases.length }, "RISK CALCULATED");
  return result;
};

export const previewAnalyzerWorkbook = (filePath: string) => {
  logger.info({ filePath }, "ANALYZER STARTED");
  const result = analyzeWorkbookFile(filePath) as {
    diagnostics?: { dominantAcknowledgement?: string | null };
    riskAssessment?: { level?: string };
  };
  logger.info({ filePath, dominantAcknowledgement: result.diagnostics?.dominantAcknowledgement ?? null }, "GRAPH BUILT");
  logger.info({ filePath, level: result.riskAssessment?.level ?? null }, "RISK CALCULATED");
  return result;
};
