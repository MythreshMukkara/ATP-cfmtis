import multer from "multer";
import { env } from "../utils/env.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024
  }
});
