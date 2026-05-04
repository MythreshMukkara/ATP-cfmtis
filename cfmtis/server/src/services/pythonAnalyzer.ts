import { execFileSync } from "node:child_process";
import path from "node:path";
import { logger } from "../utils/logger.js";

type ParsedDatasetPayload = {
  transfers: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  holds: Array<Record<string, unknown>>;
  bankActions: Array<Record<string, unknown>>;
  smallTransactions: Array<Record<string, unknown>>;
  metadata: {
    sheets: string[];
    totalRows: number;
  };
};

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT_PATH = path.resolve(process.cwd(), "python", "analyzer_engine.py");

const runPythonAnalyzer = <T>(mode: "parse" | "report", filePath: string): T | null => {
  try {
    const stdout = execFileSync(PYTHON_BIN, [SCRIPT_PATH, mode, filePath], {
      cwd: path.resolve(process.cwd()),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });

    return JSON.parse(stdout) as T;
  } catch (error) {
    logger.warn(
      {
        filePath,
        mode,
        error: error instanceof Error ? error.message : String(error)
      },
      "Python analyzer unavailable, falling back to TypeScript analyzer"
    );
    return null;
  }
};

export const getPythonParsedDataset = (filePath: string) =>
  runPythonAnalyzer<ParsedDatasetPayload>("parse", filePath);

export const getPythonAnalyzerReport = (filePath: string) =>
  runPythonAnalyzer<Record<string, unknown>>("report", filePath);
