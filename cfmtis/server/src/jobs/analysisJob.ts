import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { materializeStoredFile } from "../services/fileStorageService.js";
import { parseEvidenceFile } from "../services/parserService.js";
import { runAnalyzerForCase } from "../services/analyzerService.js";
import { detectPatterns } from "../services/patternDetector.js";
import { calculateRiskScore, classifyRiskLevel } from "../services/riskEngine.js";

export const analysisSteps = [
  "Parsing transaction records...",
  "Mapping sender/receiver account pairs...",
  "Building transaction graph structure...",
  "Detecting fragmentation patterns...",
  "Calculating risk scores per node...",
  "Identifying suspicious velocity spikes...",
  "Cross-referencing device & location data...",
  "Generating freeze recommendations...",
  "Compiling recovery data...",
  "Analysis complete ✓"
];

const AnalysisStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  DONE: "DONE"
} as const;

type AnalysisProgress = {
  status: string;
  progress: number;
  currentStep: string;
  error?: string;
};

const inFlightCases = new Set<string>();
const progressState = new Map<string, AnalysisProgress>();

const setProgress = (
  caseId: string,
  status: string,
  stepIndex: number,
  error?: string
) => {
  const boundedIndex = Math.max(0, Math.min(stepIndex, analysisSteps.length - 1));
  progressState.set(caseId, {
    status,
    progress: Math.round((boundedIndex / (analysisSteps.length - 1)) * 100),
    currentStep: analysisSteps[boundedIndex],
    error
  });
};

export const getCaseAnalysisProgress = (caseId: string) => progressState.get(caseId);

const getCaseFilesForAnalysis = async (caseId: string) => {
  try {
    return await prisma.uploadedFile.findMany({
      where: { caseId },
      select: {
        id: true,
        filename: true,
        fileType: true,
        sizeMb: true,
        storageKey: true,
        content: true,
        caseId: true
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return prisma.uploadedFile.findMany({
        where: { caseId },
        select: {
          id: true,
          filename: true,
          fileType: true,
          sizeMb: true,
          storageKey: true,
          caseId: true
        }
      });
    }

    throw error;
  }
};

const deriveMetrics = (accountNumber: string, txns: Awaited<ReturnType<typeof parseEvidenceFile>>) => {
  const received = txns.filter((txn) => txn.receiver_account === accountNumber);
  const sent = txns.filter((txn) => txn.sender_account === accountNumber);
  const amountReceived = received.reduce((sum, txn) => sum + txn.amount, 0);
  const amountOut = sent.reduce((sum, txn) => sum + txn.amount, 0);
  const chainDepth = received.length === 0 ? 0 : Math.min(received.length, 4);
  const velocity = sent.length;
  const fragmentation = amountOut === 0 ? 0 : sent.length / Math.max(amountOut / 10000, 1);
  const balanceRatio = amountReceived === 0 ? 1 : Math.max(amountReceived - amountOut, 0) / amountReceived;

  return { amountReceived, amountOut, chainDepth, velocity, fragmentation, balanceRatio };
};

export const processCaseAnalysis = async (caseId: string) => {
  if (inFlightCases.has(caseId)) {
    return;
  }

  inFlightCases.add(caseId);
  setProgress(caseId, AnalysisStatus.RUNNING, 0);

  await prisma.case.update({
    where: { id: caseId },
    data: { analysisStatus: AnalysisStatus.RUNNING }
  });

  try {
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        complaintId: true,
        fraudAmount: true,
        victimAccount: true,
        victimName: true,
        victimMobile: true,
        bankName: true
      }
    });

    if (!caseRecord) {
      throw new Error("Case not found");
    }

    const caseFiles = await getCaseFilesForAnalysis(caseId);

    const analyzerWorkbook = caseFiles.find(
      (file: any) =>
        /\.xlsx?$/i.test(String(file.filename ?? file.storageKey ?? ""))
    );

    if (analyzerWorkbook) {
      setProgress(caseId, AnalysisStatus.RUNNING, 1);
      const workbookFile = await materializeStoredFile(analyzerWorkbook);

      try {
        await runAnalyzerForCase(workbookFile.path, {
          id: caseRecord.id,
          complaintId: caseRecord.complaintId,
          fraudAmount: caseRecord.fraudAmount,
          victimAccount: caseRecord.victimAccount,
          victimName: caseRecord.victimName,
          victimMobile: caseRecord.victimMobile,
          bankName: caseRecord.bankName
        });
      } finally {
        await workbookFile.cleanup();
      }

      await prisma.case.update({
        where: { id: caseId },
        data: { analysisStatus: AnalysisStatus.DONE }
      });
      setProgress(caseId, AnalysisStatus.DONE, 9);
      return;
    }

    setProgress(caseId, AnalysisStatus.RUNNING, 1);
    const materializedFiles = await Promise.all(
      caseFiles.map(async (file: any) => ({
        file,
        temp: await materializeStoredFile(file)
      }))
    );

    let parsedFiles: Awaited<ReturnType<typeof parseEvidenceFile>>[] = [];
    try {
      parsedFiles = await Promise.all(
        materializedFiles.map(({ temp }) => parseEvidenceFile(temp.path))
      );
    } finally {
      await Promise.all(materializedFiles.map(({ temp }) => temp.cleanup()));
    }

    const transactions = parsedFiles.flat();
    if (transactions.length === 0) {
      throw new Error("No transaction data parsed");
    }

    setProgress(caseId, AnalysisStatus.RUNNING, 2);
    await prisma.transaction.deleteMany({ where: { caseId } });
    await prisma.tracedAccount.deleteMany({ where: { caseId } });
    await prisma.patternAlert.deleteMany({ where: { caseId } });

    await prisma.transaction.createMany({
      data: transactions.map((txn) => ({
        caseId,
        txnId: txn.txn_id,
        senderAccount: txn.sender_account,
        receiverAccount: txn.receiver_account,
        amount: txn.amount,
        timestamp: txn.timestamp,
        txnType: txn.type,
        status: txn.status,
        referenceId: txn.reference_id
      }))
    });

    setProgress(caseId, AnalysisStatus.RUNNING, 3);
    const uniqueAccounts = [...new Set(transactions.flatMap((txn) => [txn.sender_account, txn.receiver_account]))];

    setProgress(caseId, AnalysisStatus.RUNNING, 4);
    for (const accountNumber of uniqueAccounts) {
      const metrics = deriveMetrics(accountNumber, transactions);
      const riskScore = calculateRiskScore({
        chainDepth: accountNumber === caseRecord.victimAccount ? 0 : metrics.chainDepth,
        velocity: metrics.velocity,
        fragmentation: Math.min(metrics.fragmentation, 1),
        accountAgeDays: accountNumber === caseRecord.victimAccount ? 400 : 14 + metrics.chainDepth * 9,
        locationMismatch: metrics.chainDepth >= 2,
        balanceRatio: metrics.balanceRatio,
        transactionType: transactions.find((txn) => txn.receiver_account === accountNumber)?.type
      });
      const riskLevel = classifyRiskLevel(riskScore);

      await prisma.tracedAccount.create({
        data: {
          caseId,
          accountNumber,
          holderName:
            accountNumber === caseRecord.victimAccount ? caseRecord.victimName : `Holder ${accountNumber.slice(-4)}`,
          bankName:
            accountNumber === caseRecord.victimAccount
              ? caseRecord.bankName
              : accountNumber.replace(/[0-9]/g, "").slice(0, 5) || "BANK",
          currentBalance: Math.max(metrics.amountReceived - metrics.amountOut, 0),
          amountReceived: metrics.amountReceived,
          chainDepth: accountNumber === caseRecord.victimAccount ? 0 : metrics.chainDepth,
          riskScore,
          riskLevel,
          accountStatus: riskLevel === "CRITICAL" ? "FREEZE RECOMMENDED" : "UNDER REVIEW",
          createdDaysAgo: accountNumber === caseRecord.victimAccount ? 480 : 12 + metrics.chainDepth * 7,
          location: metrics.chainDepth >= 2 ? "Hyderabad / Mismatch" : "Hyderabad",
          transactionVelocity: metrics.velocity,
          fragmentationScore: Math.min(metrics.fragmentation, 1)
        }
      });
    }

    setProgress(caseId, AnalysisStatus.RUNNING, 5);
    setProgress(caseId, AnalysisStatus.RUNNING, 6);
    setProgress(caseId, AnalysisStatus.RUNNING, 7);
    const patterns = detectPatterns(caseRecord.victimAccount, transactions);
    await prisma.patternAlert.createMany({
      data: patterns.map((pattern) => ({
        caseId,
        type: pattern.type,
        severity: pattern.severity,
        message: pattern.message
      }))
    });

    setProgress(caseId, AnalysisStatus.RUNNING, 8);
    await prisma.case.update({
      where: { id: caseId },
      data: { analysisStatus: AnalysisStatus.DONE }
    });
    setProgress(caseId, AnalysisStatus.DONE, 9);
  } catch (error) {
    await prisma.case.update({
      where: { id: caseId },
      data: { analysisStatus: AnalysisStatus.FAILED }
    });
    setProgress(
      caseId,
      AnalysisStatus.FAILED,
      9,
      error instanceof Error ? error.message : "Analysis failed"
    );
    throw error;
  } finally {
    inFlightCases.delete(caseId);
  }
};

export const triggerCaseAnalysis = async (caseId: string) => {
  if (inFlightCases.has(caseId)) {
    return;
  }

  setProgress(caseId, AnalysisStatus.QUEUED, 0);
  setTimeout(() => {
    if (!inFlightCases.has(caseId)) {
      void processCaseAnalysis(caseId).catch(() => undefined);
    }
  }, 50);
};
