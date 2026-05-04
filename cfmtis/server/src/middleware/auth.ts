import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/jwt.js";

type Role = "ADMIN" | "OFFICER" | "VIEWER";

export type AuthenticatedRequest = Request & {
  officer?: { officerId: string; badgeNumber: string; role: Role };
};

export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const cookieToken = req.cookies?.token as string | undefined;
  const token = bearer ?? cookieToken;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.officer = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole =
  (...roles: Role[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.officer || !roles.includes(req.officer.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
