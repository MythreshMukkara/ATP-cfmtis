import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AuthPayload = {
  officerId: string;
  badgeNumber: string;
  role: "ADMIN" | "OFFICER" | "VIEWER";
};

export const signToken = (payload: AuthPayload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });

export const verifyToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET) as AuthPayload;
