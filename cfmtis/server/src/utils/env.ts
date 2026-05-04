import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("8h"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173")
});

export const env = envSchema.parse(process.env);
