import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { signToken } from "../utils/jwt.js";
import { env } from "../utils/env.js";

const loginSchema = z.object({
  badgeNumber: z.string().trim().min(3),
  password: z.string().min(6)
});

const authCookieOptions = {
  httpOnly: true,
  sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
  secure: env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000
};

const handleAuthDatabaseError = (error: unknown, res: Response) => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  ) {
    return res.status(503).json({
      message: "Database not initialized. Run Prisma migrations and seed the database."
    });
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      message: "Database unavailable. Check DATABASE_URL and ensure PostgreSQL is running."
    });
  }

  throw error;
};

export const login = async (req: Request, res: Response) => {
  try {
    const { badgeNumber, password } = loginSchema.parse(req.body);
    const officer = await prisma.officer.findUnique({ where: { badgeNumber } });

    if (!officer || !(await bcrypt.compare(password, officer.passwordHash))) {
      return res.status(401).json({ message: "Invalid badge number or password" });
    }

    const token = signToken({
      officerId: officer.id,
      badgeNumber: officer.badgeNumber,
      role: officer.role
    });

    res.cookie("token", token, authCookieOptions);

    return res.json({
      token,
      officer: {
        id: officer.id,
        badgeNumber: officer.badgeNumber,
        name: officer.name,
        rank: officer.rank,
        department: officer.department,
        role: officer.role
      }
    });
  } catch (error) {
    return handleAuthDatabaseError(error, res);
  }
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie("token", authCookieOptions);
  return res.status(204).send();
};

export const me = async (req: Request, res: Response) => {
  const officer = (req as Request & { officer?: { officerId: string } }).officer;
  if (!officer) return res.status(401).json({ message: "Not authenticated" });

  try {
    const record = await prisma.officer.findUnique({ where: { id: officer.officerId } });
    if (!record) return res.status(404).json({ message: "Officer not found" });

    return res.json({
      id: record.id,
      badgeNumber: record.badgeNumber,
      name: record.name,
      rank: record.rank,
      department: record.department,
      role: record.role
    });
  } catch (error) {
    return handleAuthDatabaseError(error, res);
  }
};
