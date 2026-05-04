import { Request, Response } from "express";
import { prisma } from "../prisma/client.js";
import {
  getAnalyzerSummary,
  getBankPerformanceAnalysis,
  getCaseAnalysisById,
  getRiskAnalysis
} from "../services/analyzerEngine.js";
import { createTempFileFromBuffer } from "../services/fileStorageService.js";
import { runAnalyzerForUpload } from "../services/analyzerService.js";

export const uploadDataset = async (req: Request, res: Response) => {
  const datasetFile = (req.file as Express.Multer.File | undefined) ?? null;
  const officerId =
    (req as Request & { officer?: { officerId?: string } }).officer?.officerId ?? null;

  if (!datasetFile) {
    return res.status(400).json({ message: "Dataset file is required" });
  }

  if (!officerId) {
    return res.status(401).json({ message: "Officer context missing" });
  }

  const tempFile = await createTempFileFromBuffer(datasetFile.originalname, datasetFile.buffer);

  try {
    const result = await runAnalyzerForUpload(tempFile.path, officerId);
    return res.status(201).json(result);
  } finally {
    await tempFile.cleanup();
  }
};

export const getCaseDetailById = async (req: Request, res: Response) => {
  const caseId = String(req.params.id);
  const analysis = await getCaseAnalysisById(caseId);
  if (!analysis) {
    return res.status(404).json({ message: "Case analysis not found" });
  }
  return res.json(analysis);
};

export const getSummary = async (_req: Request, res: Response) => {
  const summary = await getAnalyzerSummary();
  return res.json(summary);
};

export const getBanks = async (_req: Request, res: Response) => {
  const banks = await getBankPerformanceAnalysis();
  return res.json(banks);
};

export const getRisk = async (_req: Request, res: Response) => {
  const risk = await getRiskAnalysis();
  return res.json(risk);
};

export const getGraphByCase = async (req: Request, res: Response) => {
  const caseId = String(req.params.caseId);
  const analysis = await prisma.caseAnalysis.findUnique({ where: { caseId } });
  if (!analysis) {
    return res.status(404).json({ message: "Graph analysis not found" });
  }
  return res.json((analysis.moneyTrail as Record<string, unknown>) ?? {});
};
