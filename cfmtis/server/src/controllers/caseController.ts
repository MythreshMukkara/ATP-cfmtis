import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { AuthenticatedRequest } from "../middleware/auth.js";

const optionalComplaintId = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length === 0 ? undefined : normalized;
  },
  z.string().min(5).optional()
);

const caseSchema = z.object({
  complaintId: optionalComplaintId,
  fraudType: z.string(),
  fraudAmount: z.coerce.number(),
  victimAccount: z.string(),
  victimName: z.string(),
  victimMobile: z.string(),
  bankName: z.string(),
  fraudTimestamp: z.string().datetime().or(z.string()),
  description: z.string(),
  status: z.enum(["ACTIVE", "PENDING", "CLOSED", "ARCHIVED"]).optional()
});

export const listCases = async (_req: Request, res: Response) => {
  const cases = await prisma.case.findMany({
    include: { officer: true, accounts: true },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    items: cases.map((item) => ({
      id: item.id,
      complaintId: item.complaintId,
      victimName: item.victimName,
      fraudAmount: item.fraudAmount,
      fraudType: item.fraudType,
      status: item.status,
      riskLevel:
        item.accounts.some((account: { riskLevel: string }) => account.riskLevel === "CRITICAL")
          ? "CRITICAL"
          : item.accounts.some((account: { riskLevel: string }) => account.riskLevel === "HIGH")
            ? "HIGH"
            : "MEDIUM",
      analysisStatus: item.analysisStatus,
      createdAt: item.createdAt,
      officer: {
        name: item.officer.name,
        rank: item.officer.rank
      }
    }))
  });
};

export const createCase = async (req: AuthenticatedRequest, res: Response) => {
  const data = caseSchema.parse(req.body);
  const generateComplaintId = () =>
    `CMP-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}${String(
      new Date().getDate()
    ).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

  let complaintId = data.complaintId ?? generateComplaintId();

  if (!data.complaintId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await prisma.case.findUnique({ where: { complaintId } });
      if (!existing) break;
      complaintId = generateComplaintId();
    }
  }


  // Upsert case by complaintId
  const record = await prisma.case.upsert({
    where: { complaintId },
    update: {
      ...data,
      fraudTimestamp: new Date(String(data.fraudTimestamp)),
      officerId: req.officer!.officerId,
      updatedAt: new Date()
    },
    create: {
      ...data,
      complaintId,
      fraudTimestamp: new Date(String(data.fraudTimestamp)),
      officerId: req.officer!.officerId,
      createdAt: new Date()
    }
  });

  return res.status(201).json(record);
};

export const getCase = async (req: Request, res: Response) => {
  const caseId = String(req.params.id);
  const record = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      officer: true,
      files: {
        select: {
          id: true,
          filename: true,
          fileType: true,
          sizeMb: true,
          storageKey: true,
          caseId: true
        }
      },
      accounts: true,
      patternAlerts: true
    }
  });

  if (!record) return res.status(404).json({ message: "Case not found" });
  return res.json(record);
};

export const updateCase = async (req: Request, res: Response, next: NextFunction) => {
  const caseId = String(req.params.id);
  const data = caseSchema.partial().parse(req.body);

  try {
    const existing = await prisma.case.findUnique({
      where: { id: caseId },
      select: { complaintId: true }
    });

    if (!existing) {
      return res.status(404).json({ message: "Case not found" });
    }

    const nextComplaintId =
      typeof data.complaintId === "string" ? data.complaintId.trim() : undefined;

    const shouldUpdateComplaintId =
      nextComplaintId !== undefined &&
      nextComplaintId.length > 0 &&
      nextComplaintId !== existing.complaintId;

    const record = await prisma.case.update({
      where: { id: caseId },
      data: {
        ...data,
        complaintId: shouldUpdateComplaintId ? nextComplaintId : undefined,
        fraudTimestamp: data.fraudTimestamp ? new Date(String(data.fraudTimestamp)) : undefined
      }
    });

    return res.json(record);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta?.target.includes("complaintId")
    ) {
      return res.status(409).json({ message: "Complaint ID already exists" });
    }

    return next(error);
  }
};

export const deleteCase = async (req: Request, res: Response) => {
  await prisma.case.delete({ where: { id: String(req.params.id) } });
  return res.status(204).send();
};
