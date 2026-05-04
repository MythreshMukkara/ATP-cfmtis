import fs from "node:fs/promises";
import path from "node:path";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { env } from "../utils/env.js";

export const uploadFiles = async (req: Request, res: Response) => {
  const caseId = String(req.params.id);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (!files.length) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  let created;

  try {
    created = await prisma.$transaction(
      files.map((file) =>
        prisma.uploadedFile.create({
          data: {
            caseId,
            filename: file.originalname,
            fileType: file.mimetype,
            sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
            storageKey: null,
            content: Uint8Array.from(file.buffer)
          }
        })
      )
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      const uploadDir = path.resolve(env.UPLOAD_DIR);
      await fs.mkdir(uploadDir, { recursive: true });
      const persistedFiles = await Promise.all(
        files.map(async (file) => {
          const storedName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
          const storageKey = path.join(uploadDir, storedName);
          await fs.writeFile(storageKey, file.buffer);
          return {
            caseId,
            filename: file.originalname,
            fileType: file.mimetype,
            sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
            storageKey
          };
        })
      );

      created = await prisma.$transaction(
        persistedFiles.map((file) =>
          prisma.uploadedFile.create({
            data: file
          })
        )
      );
    } else {
      throw error;
    }
  }

  return res.status(201).json(created);
};

export const listFiles = async (req: Request, res: Response) => {
  const caseId = String(req.params.id);
  const files = await prisma.uploadedFile.findMany({
    where: { caseId },
    orderBy: { filename: "asc" },
    select: {
      id: true,
      filename: true,
      fileType: true,
      sizeMb: true,
      storageKey: true,
      caseId: true
    }
  });

  return res.json(files);
};

export const listSampleDatasets = async (_req: Request, res: Response) => {
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  const entries = await fs.readdir(uploadDir, { withFileTypes: true }).catch(() => []);
  const items = entries
    .filter((entry) => entry.isFile() && /\.(xlsx?|csv|json|pdf)$/i.test(entry.name))
    .map((entry) => ({
      id: entry.name,
      filename: entry.name
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));

  return res.json({ items });
};

export const downloadSampleDataset = async (req: Request, res: Response) => {
  const fileName = path.basename(String(req.params.fileName ?? ""));
  const filePath = path.resolve(env.UPLOAD_DIR, fileName);
  return res.download(filePath, fileName);
};
